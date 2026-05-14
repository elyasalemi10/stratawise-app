import "server-only";

// PostGrid client wrapper.
//
// PostGrid runs TWO separate products on TWO separate API keys:
//   • Print & Mail API — sends physical letters. Endpoints live at
//     api.postgrid.com/print-mail/v1/... ($-billable; charge applies
//     per letter once the test mode is flipped off.)
//   • Address Verification API — checks deliverability. Endpoints at
//     api.postgrid.com/v1/addver/... (US/CA) and
//     api.postgrid.com/v1/intl_addver/... (everything else inc. AU).
//
// Auth: x-api-key header. Each product has its OWN key — supplying a
// Print Mail key to the Address Verification endpoint returns
// HTTP 401 "OperationalError: Invalid API key." (Verified locally by
// scripts/test-postgrid-addver.ts.)
//
// Env vars (test = sandbox, live = production):
//   POSTGRID_PRINT_TEST_API_KEY    POSTGRID_PRINT_API_KEY
//   POSTGRID_ADDVER_TEST_API_KEY   POSTGRID_ADDVER_API_KEY
//   POSTGRID_MODE                  — "test" (default) | "live"
//
// Backwards-compat: POSTGRID_TEST_API_KEY (no product prefix) is treated
// as the Print Mail test key, since that's what the dashboard hands you
// first. Address verification stays "unchecked" until the addver key is
// added — `verifyAddress` short-circuits with a synthetic "unchecked"
// status rather than throwing, so the wizard works end-to-end while we
// wait on the verification subscription.

export type PostGridMode = "test" | "live";
export type PostGridProduct = "print" | "addver";

function resolveMode(): PostGridMode {
  const m = (process.env.POSTGRID_MODE ?? "test").trim().toLowerCase();
  return m === "live" ? "live" : "test";
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

// "unchecked" lands when no Address Verification key is configured —
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

// PostGrid Addver response shape — verified locally against intl_addver.
// `verifiedAddress` is the corrected version (always returned when the
// service finds a match, even on status="verified"). Status is one of:
//   "verified"               — exact match
//   "corrected"              — match after correction
//   "failed"                 — couldn't match
//   "verified_with_warnings" — match but with caveats (we treat as verified)
type PostGridVerifyResponse = {
  id?: string;
  status?: string;
  verifiedAddress?: {
    line1?: string;
    line2?: string;
    city?: string;
    provinceOrState?: string;
    postalOrZip?: string;
    country?: string;
  };
  error?: { message?: string; type?: string };
};

const AU_COUNTRIES = new Set(["AU", "AUS", "AUSTRALIA"]);

/** Verify a single postal address. Returns "unchecked" with a logged
 *  warning when the addver key isn't configured — never throws on missing
 *  config, only on real network/server errors. AU addresses route to
 *  the intl_addver endpoint; everything else to addver (US/CA). */
export async function verifyAddress(addr: PostGridAddress): Promise<VerificationResult> {
  const mode = resolveMode();
  const key = resolveKey("addver", mode);
  if (!key) {
    // No addver key — the wizard still needs to save the address so we
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

  let resp: Response;
  try {
    resp = await fetch(`https://api.postgrid.com${path}?includeDetails=true&properCase=true`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": key },
      body: JSON.stringify(body),
    });
  } catch (err) {
    console.error("postgrid addver: network failure", err);
    throw new Error("Address verification is temporarily unavailable.");
  }

  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    console.error("postgrid addver: HTTP", resp.status, txt);
    // 401 means key works but isn't a verify-product key — soft-fail to
    // unchecked so the manager isn't blocked by a config issue.
    if (resp.status === 401) {
      return { status: "unchecked", correctedAddress: null, errorMessage: "Address verification key not configured.", verificationId: null, mode };
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

  const raw = (payload.status ?? "").toLowerCase();
  const status: VerificationStatus =
    raw === "verified" || raw === "verified_with_warnings" ? "verified"
    : raw === "corrected" ? "corrected"
    : "failed";

  const v = payload.verifiedAddress;
  const correctedAddress: PostGridAddress | null =
    v && v.line1
      ? {
          line1: v.line1,
          line2: v.line2 ?? null,
          city: v.city ?? body.address.city,
          provinceOrState: v.provinceOrState ?? body.address.provinceOrState,
          postalOrZip: v.postalOrZip ?? body.address.postalOrZip,
          country: v.country ?? body.address.country,
        }
      : null;

  return {
    status,
    correctedAddress,
    errorMessage: payload.error?.message ?? null,
    verificationId: payload.id ?? null,
    mode,
  };
}

/** Format an address as one flat string for display ("123 Smith St, Hawthorn VIC 3122"). */
export function formatAddress(addr: PostGridAddress): string {
  const line2 = addr.line2 ? `, ${addr.line2}` : "";
  return `${addr.line1}${line2}, ${addr.city} ${addr.provinceOrState} ${addr.postalOrZip}`.trim();
}
