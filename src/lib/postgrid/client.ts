import "server-only";

// PostGrid client wrapper.
//
// API docs: https://docs.postgrid.com/
// Auth: x-api-key header. Two environment keys:
//   POSTGRID_API_KEY            — production (live letters, billable)
//   POSTGRID_TEST_API_KEY       — sandbox (no postage charge, no real mail)
//
// The wrapper picks the key based on POSTGRID_MODE (default "test"). Flip
// to "live" only after the dev cycle has signed off.
//
// Address verification: POST /print-mail/v1/addver/verifications, JSON body
// shape { line1, line2?, city, provinceOrState, postalOrZip, country }.
// Returns a `status` ("verified" / "corrected" / "failed") plus a
// `details.correctedAddress` block when PostGrid found a better match.
// We expose three normalised statuses to the caller — verified / corrected
// / failed — so the UI doesn't have to know PostGrid's exact wire format.
//
// Rate-limiting note (item 2): when we later let lot owners change their
// own postal address, batch the verifications via PostGrid's
// /print-mail/v1/addver/batches endpoint rather than firing one call per
// address. Single-call mode is fine for the OC creation wizard (≤ a few
// dozen lots) but the portal-driven path can hit a 50-OC complex in one
// midnight scheduled refresh — that's a rate-limit risk on the single
// endpoint.

const POSTGRID_LIVE_BASE = "https://api.postgrid.com";
const POSTGRID_TEST_BASE = "https://api.postgrid.com";

export type PostGridMode = "test" | "live";

function resolveMode(): PostGridMode {
  const m = (process.env.POSTGRID_MODE ?? "test").trim().toLowerCase();
  return m === "live" ? "live" : "test";
}

function resolveKey(mode: PostGridMode): string {
  const key = mode === "live"
    ? process.env.POSTGRID_API_KEY
    : process.env.POSTGRID_TEST_API_KEY;
  if (!key || !key.trim()) {
    console.error(`postgrid: ${mode === "live" ? "POSTGRID_API_KEY" : "POSTGRID_TEST_API_KEY"} not configured`);
    throw new Error("Address verification is temporarily unavailable.");
  }
  return key.trim();
}

export type PostGridAddress = {
  line1: string;            // e.g. "123 Smith Street"
  line2?: string | null;
  city: string;             // suburb
  provinceOrState: string;  // "VIC"
  postalOrZip: string;      // "3000"
  country?: string;         // defaults to "AU"
};

export type VerificationStatus = "verified" | "corrected" | "failed";

export type VerificationResult = {
  status: VerificationStatus;
  /** PostGrid's corrected address. Populated when status === "corrected". */
  correctedAddress: PostGridAddress | null;
  /** Free-text reason from PostGrid (e.g. "Postal code does not match
   *  province"). Null on success. */
  errorMessage: string | null;
  /** Raw verification id PostGrid returns. Persist this with the address
   *  for the audit trail; useful when investigating a missed-delivery
   *  later down the road. */
  verificationId: string | null;
  /** Provider mode the call used. Saved so we can spot "verified under
   *  test mode" records once we cut over to live and want to re-verify. */
  mode: PostGridMode;
};

type PostGridVerifyResponse = {
  id: string;
  status: string; // "verified" | "corrected" | "failed"
  details?: {
    correctedAddress?: {
      line1?: string;
      line2?: string;
      city?: string;
      provinceOrState?: string;
      postalOrZip?: string;
      country?: string;
    };
    error?: string;
    message?: string;
  };
};

/** Verify a single Australian postal address. Throws only on transport /
 *  auth failure; a "failed" address is returned as a result, not an error.
 *  Caller decides whether to block on `failed` or surface to the user. */
export async function verifyAddress(addr: PostGridAddress): Promise<VerificationResult> {
  const mode = resolveMode();
  const key = resolveKey(mode);
  const base = mode === "live" ? POSTGRID_LIVE_BASE : POSTGRID_TEST_BASE;

  const body = {
    line1: addr.line1.trim(),
    line2: (addr.line2 ?? "").trim() || undefined,
    city: addr.city.trim(),
    provinceOrState: addr.provinceOrState.trim(),
    postalOrZip: addr.postalOrZip.trim(),
    country: (addr.country ?? "AU").trim().toUpperCase(),
  };

  let resp: Response;
  try {
    resp = await fetch(`${base}/print-mail/v1/addver/verifications`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    console.error("postgrid: network failure", err);
    throw new Error("Address verification is temporarily unavailable.");
  }

  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    console.error("postgrid: HTTP", resp.status, txt);
    throw new Error("Address verification is temporarily unavailable.");
  }

  let payload: PostGridVerifyResponse;
  try {
    payload = (await resp.json()) as PostGridVerifyResponse;
  } catch (err) {
    console.error("postgrid: JSON parse failure", err);
    throw new Error("Address verification is temporarily unavailable.");
  }

  const status: VerificationStatus =
    payload.status === "verified" ? "verified"
    : payload.status === "corrected" ? "corrected"
    : "failed";

  const corrected = payload.details?.correctedAddress;
  const correctedAddress: PostGridAddress | null =
    corrected && corrected.line1
      ? {
          line1: corrected.line1,
          line2: corrected.line2 ?? null,
          city: corrected.city ?? body.city,
          provinceOrState: corrected.provinceOrState ?? body.provinceOrState,
          postalOrZip: corrected.postalOrZip ?? body.postalOrZip,
          country: corrected.country ?? body.country,
        }
      : null;

  return {
    status,
    correctedAddress,
    errorMessage: payload.details?.error ?? payload.details?.message ?? null,
    verificationId: payload.id ?? null,
    mode,
  };
}

/** Format an address as one flat string for display ("123 Smith St, Hawthorn VIC 3122"). */
export function formatAddress(addr: PostGridAddress): string {
  const line2 = addr.line2 ? `, ${addr.line2}` : "";
  return `${addr.line1}${line2}, ${addr.city} ${addr.provinceOrState} ${addr.postalOrZip}`.trim();
}
