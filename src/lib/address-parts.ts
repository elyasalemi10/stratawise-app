import type { ParsedAddress } from "@/components/shared/vic-address-autocomplete";

// An address is stored as one string and edited as five fields, so these two
// have to agree, and there was one copy of them buried in the OC creation
// wizard. Every other place that wanted the same editor either had to import
// from a wizard page or write its own split, which is how two screens end up
// disagreeing about where the suburb ends.

/**
 * Best-effort split of a stored address back into parts, so opening the
 * editor on an address typed earlier does not start from blank. Anything it
 * cannot place stays in the street line, which is the field the manager is
 * most likely to correct anyway.
 */
export function splitAddress(stored: string): ParsedAddress {
  const empty: ParsedAddress = {
    street_number: "",
    street_name: "",
    suburb: "",
    state: "VIC",
    postcode: "",
    formatted: stored,
  };
  const text = stored.trim();
  if (!text) return { ...empty, formatted: "" };

  const parts = text.split(",").map((p) => p.trim()).filter(Boolean);
  const street = parts[0] ?? "";
  const tail = parts.slice(1).join(" ");
  const postcode = tail.match(/\b(\d{4})\b/)?.[1] ?? "";
  const suburb = tail.replace(/\bVIC\b/i, "").replace(/\b\d{4}\b/, "").trim();
  const streetMatch = street.match(/^(\S+)\s+(.*)$/);

  return {
    street_number: streetMatch?.[1] ?? "",
    street_name: streetMatch?.[2] ?? street,
    suburb,
    state: "VIC",
    postcode,
    formatted: text,
  };
}

export function joinAddress(p: ParsedAddress): string {
  const street = `${p.street_number} ${p.street_name}`.replace(/\s+/g, " ").trim();
  const tail = `${p.suburb} ${p.postcode}`.replace(/\s+/g, " ").trim();
  return [street, tail].filter(Boolean).join(", ");
}
