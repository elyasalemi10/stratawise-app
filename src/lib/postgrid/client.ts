import "server-only";

// PostGrid client wrapper.
//
// PostGrid runs TWO separate products on TWO separate API keys:
//   • Print & Mail API , sends physical letters. Endpoints live at
//     api.postgrid.com/print-mail/v1/... ($-billable; charge applies
//     per letter once the test mode is flipped off.)
//   • Address Verification API , checks deliverability. Endpoints at
//     api.postgrid.com/v1/addver/... (US/CA) and
//     api.postgrid.com/v1/intl_addver/... (everything else inc. AU).
//
// Auth: x-api-key header. Each product has its OWN key , supplying a
// Print Mail key to the Address Verification endpoint returns
// HTTP 401 "OperationalError: Invalid API key." (Verified locally by
// scripts/test-postgrid-addver.ts.)
//
// Env vars (live = production; test keys retained for local-only debugging):
//   POSTGRID_PRINT_TEST_API_KEY    POSTGRID_PRINT_API_KEY
//   POSTGRID_ADDVER_TEST_API_KEY   POSTGRID_ADDVER_API_KEY
//
// Mode is hard-coded to "live" , POSTGRID_MODE is no longer read.
//
// IMPORTANT: PostGrid keys come in two flavours, distinguished by prefix:
//   • test_pk_… / live_pk_…  , PUBLIC key. Browser-only. PostGrid checks
//                              the request Origin against an allowlist
//                              configured in the dashboard. Server-side
//                              calls from Node have no Origin header and
//                              get rejected with HTTP 403 "Invalid origin
//                              for this api key." (verified locally , see
//                              scripts/test-postgrid-addver.ts).
//   • test_sk_… / live_sk_…  , SECRET key. Server-side only. No origin
//                              restriction; the key itself authenticates.
//                              This is what every endpoint in this wrapper
//                              expects. Generate one from PostGrid
//                              dashboard → Settings → API Keys → Secret.
//
// Backwards-compat: POSTGRID_TEST_API_KEY (no product prefix) is treated
// as the Print Mail test key, since that's what the dashboard hands you
// first. Address verification stays "unchecked" until the addver key is
// added , `verifyAddress` short-circuits with a synthetic "unchecked"
// status rather than throwing, so the wizard works end-to-end while we
// wait on the verification subscription.

export type PostGridMode = "test" | "live";
export type PostGridProduct = "print" | "addver";

// PostGrid mode is hard-coded , the env override was removed because every
// environment that talks to PostGrid (dev, staging, prod) is on live keys.
function resolveMode(): PostGridMode {
  return "live";
}

/** Returns the API key for the given product+mode, or null if not
 *  configured. Callers decide whether to soft-fail (verification) or hard-
 *  fail (print mail). */
function resolveKey(product: PostGridProduct, mode: PostGridMode): string | null {
  const envName = product === "print"
    ? (mode === "live" ? "POSTGRID_PRINT_API_KEY" : "POSTGRID_PRINT_TEST_API_KEY")
    : (mode === "live" ? "POSTGRID_ADDVER_API_KEY" : "POSTGRID_ADDVER_TEST_API_KEY");
  const key = process.env[envName];
  if (key && key.trim()) return key.trim();
  // Back-compat: a bare POSTGRID_TEST_API_KEY (the dashboard's default
  // when you sign up) is treated as the Print Mail test key, since
  // that's the product PostGrid bootstraps first.
  if (product === "print" && mode === "test") {
    const legacy = process.env.POSTGRID_TEST_API_KEY;
    if (legacy && legacy.trim()) return legacy.trim();
  }
  return null;
}

export type PostGridAddress = {
  line1: string;            // e.g. "123 Smith Street"
  line2?: string | null;
  city: string;             // suburb
  provinceOrState: string;  // "VIC"
  postalOrZip: string;      // "3000"
  country?: string;         // defaults to "AU"
};

// "unchecked" lands when no Address Verification key is configured ,
// the wizard records the address as-is and lets levy / notice flows
// proceed with a flagged delivery_log row. Lets us ship the UX before
// the verify-product subscription is bought.
export type VerificationStatus = "verified" | "corrected" | "failed" | "unchecked";

export type VerificationResult = {
  status: VerificationStatus;
  correctedAddress: PostGridAddress | null;
  errorMessage: string | null;
  verificationId: string | null;
  mode: PostGridMode;
};

// PostGrid Addver response shape , verified locally against intl_addver
// with a real test key. Top-level `status` is the HTTP-level
// success/error flag; the verification-specific status lives at
// `data.summary.verificationStatus` and the verified-form address fields
// sit directly under `data` (NOT nested under verifiedAddress).
//
// data.summary.verificationStatus values seen in practice:
//   "verified"            , exact match (matchScore 100)
//   "partially_verified"  , match with some corrections (treat as "corrected")
//   "ambiguous"           , multiple candidates; surface as "corrected" with
//                           the top-ranked match
//   "not_verified"        , couldn't match → "failed"
//   "reverted"            , fallback, treat as "failed"
type PostGridVerifyResponse = {
  status?: string;
  message?: string;
  data?: {
    line1?: string;
    line2?: string;
    line3?: string;
    city?: string;
    provinceOrState?: string;
    postalOrZip?: string;
    country?: string;
    formattedAddress?: string;
    summary?: {
      verificationStatus?: string;
      matchScore?: number;
    };
  };
  error?: { message?: string; type?: string };
};

const AU_COUNTRIES = new Set(["AU", "AUS", "AUSTRALIA"]);

/** Verify a single postal address. Returns "unchecked" with a logged
 *  warning when the addver key isn't configured , never throws on missing
 *  config, only on real network/server errors. AU addresses route to
 *  the intl_addver endpoint; everything else to addver (US/CA). */
export async function verifyAddress(addr: PostGridAddress): Promise<VerificationResult> {
  const mode = resolveMode();
  const key = resolveKey("addver", mode);
  if (!key) {
    // No addver key , the wizard still needs to save the address so we
    // return a synthetic "unchecked" result. The delivery_log will mark
    // every send to this address as unverified.
    return { status: "unchecked", correctedAddress: null, errorMessage: null, verificationId: null, mode };
  }

  const country = (addr.country ?? "AU").trim().toUpperCase();
  const isIntl = !["US", "USA", "CA", "CAN"].includes(country);
  const path = isIntl ? "/v1/intl_addver/verifications" : "/v1/addver/verifications";

  // PostGrid expects { address: { ... } } nested, NOT a flat body. The
  // querystring flags ask for the corrected version + proper-cased output.
  const body = {
    address: {
      line1: addr.line1.trim(),
      line2: (addr.line2 ?? "").trim() || undefined,
      city: addr.city.trim(),
      provinceOrState: addr.provinceOrState.trim(),
      postalOrZip: addr.postalOrZip.trim(),
      country: AU_COUNTRIES.has(country) ? "AU" : country,
    },
  };

  // pk_ keys require an Origin header that matches the dashboard
  // allowlist. sk_ keys ignore Origin entirely so this is a harmless
  // header on either type. Default to NEXT_PUBLIC_APP_URL or localhost
  // for dev so a fresh checkout with localhost in the allowlist works
  // out of the box. POSTGRID_ORIGIN_OVERRIDE lets you target a
  // different allowlisted origin from a non-browser context (e.g. CI).
  const origin = (process.env.POSTGRID_ORIGIN_OVERRIDE
    ?? process.env.NEXT_PUBLIC_APP_URL
    ?? "http://localhost:3000").trim();

  let resp: Response;
  try {
    resp = await fetch(`https://api.postgrid.com${path}?includeDetails=true&properCase=true`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        Origin: origin,
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    console.error("postgrid addver: network failure", err);
    throw new Error("Address verification is temporarily unavailable.");
  }

  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    console.error("postgrid addver: HTTP", resp.status, txt);
    // 401 means key works but isn't a verify-product key , soft-fail to
    // unchecked so the manager isn't blocked by a config issue.
    if (resp.status === 401) {
      return { status: "unchecked", correctedAddress: null, errorMessage: "Address verification key not configured.", verificationId: null, mode };
    }
    // 403 "Invalid origin" means the configured addver key is a public
    // (test_pk_…) key restricted to a browser Origin allowlist. Our
    // server-side call doesn't carry an Origin and won't ever pass that
    // check. Surface a clear hint instead of a mystery error.
    if (resp.status === 403 && txt.toLowerCase().includes("invalid origin")) {
      console.error("postgrid addver: configured key is a public (pk_) key , needs a secret (sk_) key for server-side calls. See lib/postgrid/client.ts comment.");
      return { status: "unchecked", correctedAddress: null, errorMessage: "Address verification key must be a server-side secret key.", verificationId: null, mode };
    }
    throw new Error("Address verification is temporarily unavailable.");
  }

  let payload: PostGridVerifyResponse;
  try {
    payload = (await resp.json()) as PostGridVerifyResponse;
  } catch (err) {
    console.error("postgrid addver: JSON parse failure", err);
    throw new Error("Address verification is temporarily unavailable.");
  }

  // Top-level error path. PostGrid wraps success in { status: "success",
  // data: {...} } and failure in { status: "error", message: "..." }.
  if (payload.status !== "success" || !payload.data) {
    return {
      status: "failed",
      correctedAddress: null,
      errorMessage: payload.message ?? payload.error?.message ?? "Verification failed.",
      verificationId: null,
      mode,
    };
  }

  const data = payload.data;
  const summary = data.summary?.verificationStatus?.toLowerCase() ?? "";
  // Map PostGrid's verbose summary statuses onto our 3-state model.
  // "verified" stays verified; anything with a partial / ambiguous match
  // surfaces as "corrected" so the user gets to see the suggestion;
  // not_verified / reverted / unknown → "failed".
  let status: VerificationStatus;
  if (summary === "verified") status = "verified";
  else if (summary === "partially_verified" || summary === "ambiguous") status = "corrected";
  else status = "failed";

  // Build the PostGrid-corrected address from the response fields. If
  // status is "verified" we skip building it , the address is already
  // good as-is, no need to surface a "use suggestion" dialog.
  const correctedAddress: PostGridAddress | null = status === "verified" || !data.line1
    ? null
    : {
        line1: data.line1,
        // line2 (subbuilding) + line3 (premise) are PostGrid's
        // international-format hierarchy. Collapse into our line1/line2
        // pair so the dialog can show a clean before/after.
        line2: data.line2 ?? null,
        city: data.city ?? body.address.city,
        provinceOrState: data.provinceOrState ?? body.address.provinceOrState,
        postalOrZip: data.postalOrZip ?? body.address.postalOrZip,
        country: data.country ?? body.address.country,
      };

  return {
    status,
    correctedAddress,
    errorMessage: status === "failed" ? (data.summary?.verificationStatus ?? "Address could not be verified.") : null,
    // PostGrid's intl_addver doesn't return a verification id we can
    // persist for audit , the summary itself is the trace. If we
    // upgrade to addver (US/CA) later we can pull id from data.id.
    verificationId: null,
    mode,
  };
}

/** Format an address as one flat string for display ("123 Smith St, Hawthorn VIC 3122"). */
export function formatAddress(addr: PostGridAddress): string {
  const line2 = addr.line2 ? `, ${addr.line2}` : "";
  return `${addr.line1}${line2}, ${addr.city} ${addr.provinceOrState} ${addr.postalOrZip}`.trim();
}
