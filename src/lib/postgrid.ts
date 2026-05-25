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
 * Very loose AU postal-address parser. Splits "123 Smith St, Carlton VIC 3053"
 * into the fields PostGrid wants. Lives here (not in a utils file) because
 * it's only useful for the PostGrid adapter and we don't want callers
 * reaching for it elsewhere.
 *
 * Returns null when the input clearly isn't a postal address (no postcode,
 * no city, etc.) so callers can fall back to email or surface a warning.
 */
export function parseAuPostalAddress(raw: string | null | undefined): PostGridAddress | null {
  if (!raw) return null;
  const cleaned = raw.replace(/\s+/g, " ").trim();
  if (!cleaned) return null;

  // Expect a 4-digit postcode at the end. Without it we can't reliably
  // send to PostGrid (they require provinceOrState + postalOrZip).
  const postcodeMatch = cleaned.match(/(\d{4})\s*$/);
  if (!postcodeMatch) return null;
  const postcode = postcodeMatch[1];
  const beforePostcode = cleaned.slice(0, postcodeMatch.index).trim().replace(/[,\s]+$/, "");

  // State sits immediately before the postcode.
  const stateMatch = beforePostcode.match(/\b(VIC|NSW|QLD|WA|SA|TAS|NT|ACT)\s*$/i);
  if (!stateMatch) return null;
  const state = stateMatch[1].toUpperCase();
  const beforeState = beforePostcode.slice(0, stateMatch.index).trim().replace(/[,\s]+$/, "");

  // Everything before the state is "street + city". Split on the last
  // comma if present , otherwise treat the last word block as the city.
  let addressLine1 = beforeState;
  let city = "";
  const lastComma = beforeState.lastIndexOf(",");
  if (lastComma !== -1) {
    addressLine1 = beforeState.slice(0, lastComma).trim();
    city = beforeState.slice(lastComma + 1).trim();
  } else {
    const tokens = beforeState.split(/\s+/);
    if (tokens.length >= 2) {
      city = tokens[tokens.length - 1];
      addressLine1 = tokens.slice(0, -1).join(" ");
    } else {
      addressLine1 = beforeState;
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
