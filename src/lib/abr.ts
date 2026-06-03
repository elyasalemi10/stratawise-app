// Australian Business Register (ABR) ABN Lookup. Framework-agnostic helper.
// Uses the free public JSON web service; requires a registration GUID stored
// in ABR_GUID. The endpoint returns JSONP (a callback wrapper), so we strip it.

export interface AbnLookupResult {
  abn: string;
  entityName: string | null;
  businessName: string | null; // trading name if present, else entity name
  gstRegistered: boolean;
  postcode: string | null;
  state: string | null;
}

export function normaliseAbn(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, 11);
}

export function isValidAbnFormat(abn: string): boolean {
  return /^\d{11}$/.test(normaliseAbn(abn));
}

export async function lookupAbn(rawAbn: string): Promise<AbnLookupResult | null> {
  const abn = normaliseAbn(rawAbn);
  if (!isValidAbnFormat(abn)) return null;
  const guid = process.env.ABR_GUID;
  if (!guid) {
    // Not configured , caller treats null as "unavailable" and stays manual.
    return null;
  }

  const url = `https://abr.business.gov.au/json/AbnDetails.aspx?abn=${abn}&guid=${guid}`;
  let text: string;
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    text = await res.text();
  } catch (err) {
    console.error("[abr] lookup failed:", err);
    return null;
  }

  // Response is JSONP: callback({...}). Strip the wrapper to get the JSON.
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }

  // ABR error responses carry an Exception field.
  if (data.Exception) return null;

  const entityName = (data.EntityName as string) || null;
  const businessNames = Array.isArray(data.BusinessName) ? (data.BusinessName as string[]) : [];
  const gst = (data.Gst as string) || "";

  return {
    abn,
    entityName,
    businessName: businessNames[0] || entityName,
    gstRegistered: gst.trim().length > 0, // Gst holds the registration-from date when registered
    postcode: (data.AddressPostcode as string) || null,
    state: (data.AddressState as string) || null,
  };
}
