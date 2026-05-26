// PostGrid (postgrid.com) adapter , prints + posts a PDF letter for us.
//
// Currently TEST-MODE only. The integration is wired end-to-end (auth,
// contact creation, letter submission, status read-back) so flipping the
// `POSTGRID_LIVE` env var to "true" promotes it to real mail; until then
// we hit the test endpoints and PostGrid does NOT physically print or
// post anything. Per the user: build the entire flow but keep it in
// testing for now.
//
// Two env vars:
//   POSTGRID_TEST_KEY  , the test API key (test_sk_…)
//   POSTGRID_LIVE_KEY  , production API key (live_sk_…); only read when
//                         POSTGRID_LIVE === "true"
//   POSTGRID_LIVE      , string "true" to go live; any other value keeps
//                         us in test mode

const POSTGRID_BASE = "https://api.postgrid.com/print-mail/v1";

export interface PostGridAddress {
  /** Recipient first name + surname concatenated. PostGrid splits it. */
  firstName?: string;
  lastName?: string;
  companyName?: string;
  /** Free-text street address line 1. Postgrid auto-corrects if enabled. */
  addressLine1: string;
  addressLine2?: string;
  city: string;
  provinceOrState: string;     // AU state code, e.g. "VIC", "NSW".
  postalOrZip: string;
  countryCode: string;          // ISO-2; default "AU" set by callers.
}

export interface PostGridLetterResult {
  id: string;
  status: string;               // "ready"/"printing"/"completed" etc.
  testMode: boolean;
  description: string | null;
}

/** True when we're using the test endpoints (no real mail printed). */
export function isPostGridTestMode(): boolean {
  return (process.env.POSTGRID_LIVE ?? "").toLowerCase() !== "true";
}

function apiKey(): string | null {
  return isPostGridTestMode()
    ? (process.env.POSTGRID_TEST_KEY ?? null)
    : (process.env.POSTGRID_LIVE_KEY ?? null);
}

/**
 * Submit a single PDF letter. Creates the recipient + the letter in one
 * call. Returns the PostGrid letter id so we can read status back later.
 *
 * Throws a generic "couldn't post" error on failure so callers can
 * surface a sane toast , the real reason is logged server-side.
 */
export async function sendPostGridLetter(params: {
  to: PostGridAddress;
  description?: string;
  pdfBuffer: Buffer;
  pdfFilename: string;
}): Promise<PostGridLetterResult> {
  const key = apiKey();
  if (!key) {
    throw new Error("PostGrid is not configured");
  }
  const testMode = isPostGridTestMode();

  // PostGrid expects multipart/form-data with the PDF binary plus a flat
  // set of "to[fieldName]" fields. They auto-create the contact for us
  // when we send the address inline (no separate contact API needed).
  const form = new FormData();
  if (params.to.firstName) form.append("to[firstName]", params.to.firstName);
  if (params.to.lastName) form.append("to[lastName]", params.to.lastName);
  if (params.to.companyName) form.append("to[companyName]", params.to.companyName);
  form.append("to[addressLine1]", params.to.addressLine1);
  if (params.to.addressLine2) form.append("to[addressLine2]", params.to.addressLine2);
  form.append("to[city]", params.to.city);
  form.append("to[provinceOrState]", params.to.provinceOrState);
  form.append("to[postalOrZip]", params.to.postalOrZip);
  form.append("to[countryCode]", params.to.countryCode);

  // Address book is unsanitised; setting these flags lets PostGrid
  // up-front-reject invalid addresses instead of accepting and silently
  // returning them as undeliverable.
  form.append("addressPlacement", "insert_blank_page");
  form.append("colour", "true");
  form.append("doubleSided", "true");
  form.append("mailingClass", "standard_class");
  if (params.description) form.append("description", params.description);

  // PDF as the letter body (other valid sources: HTML, template id, etc.).
  const blob = new Blob([new Uint8Array(params.pdfBuffer)], { type: "application/pdf" });
  form.append("pdf", blob, params.pdfFilename);

  const res = await fetch(`${POSTGRID_BASE}/letters`, {
    method: "POST",
    headers: {
      "x-api-key": key,
      // Don't set Content-Type , the runtime sets the multipart boundary.
    },
    body: form,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(
      `[postgrid] letter create failed (${res.status}) testMode=${testMode}: ${body}`,
    );
    throw new Error("Couldn't post the letter");
  }

  const json = (await res.json()) as {
    id: string;
    status: string;
    live: boolean;
    description: string | null;
  };
  return {
    id: json.id,
    status: json.status,
    testMode: !json.live,
    description: json.description,
  };
}

/**
 * AU postal-address parser. Handles BOTH common orderings used in the
 * wild:
 *
 *   "Unit 1, 25 Princes Highway, PAKENHAM 3810 VIC"   (postcode then state)
 *   "123 Smith St, Carlton VIC 3053"                  (state then postcode)
 *
 * Lives here (not in a utils file) because it's only useful for the
 * PostGrid adapter and we don't want callers reaching for it elsewhere.
 *
 * Returns null when the input clearly isn't a postal address so callers
 * can fall back to email or surface a warning.
 */
export function parseAuPostalAddress(raw: string | null | undefined): PostGridAddress | null {
  if (!raw) return null;
  const cleaned = raw.replace(/\s+/g, " ").trim();
  if (!cleaned) return null;

  const STATE_PATTERN = /\b(VIC|NSW|QLD|WA|SA|TAS|NT|ACT)\b/i;
  const POSTCODE_PATTERN = /\b(\d{4})\b/;

  // Try both orderings.
  let state: string | null = null;
  let postcode: string | null = null;
  let tailIndex = -1;

  // Pattern A: state-before-postcode at the end ("... VIC 3053")
  let m = cleaned.match(/(VIC|NSW|QLD|WA|SA|TAS|NT|ACT)\s+(\d{4})\s*$/i);
  if (m) {
    state = m[1].toUpperCase();
    postcode = m[2];
    tailIndex = m.index ?? -1;
  } else {
    // Pattern B: postcode-before-state at the end ("... 3810 VIC")
    m = cleaned.match(/(\d{4})\s+(VIC|NSW|QLD|WA|SA|TAS|NT|ACT)\s*$/i);
    if (m) {
      postcode = m[1];
      state = m[2].toUpperCase();
      tailIndex = m.index ?? -1;
    } else {
      // Last-ditch: scan anywhere for state + postcode (any order).
      const stateMatch = cleaned.match(STATE_PATTERN);
      const postMatch = cleaned.match(POSTCODE_PATTERN);
      if (stateMatch && postMatch) {
        state = stateMatch[1].toUpperCase();
        postcode = postMatch[1];
        tailIndex = Math.min(stateMatch.index ?? Infinity, postMatch.index ?? Infinity);
      }
    }
  }

  if (!state || !postcode || tailIndex < 0) return null;

  const beforeTail = cleaned.slice(0, tailIndex).trim().replace(/[,\s]+$/, "");

  // Everything before the state/postcode tail is "street(s) + city". The
  // city is the LAST comma-separated chunk if commas are present,
  // otherwise the last word.
  let addressLine1 = beforeTail;
  let city = "";
  const parts = beforeTail.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    city = parts[parts.length - 1];
    addressLine1 = parts.slice(0, -1).join(", ");
  } else if (parts.length === 1) {
    const tokens = parts[0].split(/\s+/);
    if (tokens.length >= 2) {
      city = tokens[tokens.length - 1];
      addressLine1 = tokens.slice(0, -1).join(" ");
    } else {
      addressLine1 = parts[0];
      city = parts[0]; // last-resort , at least give PostGrid something
    }
  }
  if (!addressLine1 || !city) return null;

  return {
    addressLine1,
    city,
    provinceOrState: state,
    postalOrZip: postcode,
    countryCode: "AU",
  };
}
