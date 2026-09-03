// What a management company is called, and when.
//
// Three fields, three different jobs, and they are not interchangeable:
//
//   name            The brand. "MyOCM". A nickname the firm picked, with no
//                   legal standing. This is what the PLATFORM shows , the
//                   sidebar, headers, tables, toasts, everything a manager
//                   reads while working.
//   registered_name The legal entity on ASIC. "Perfect Design and
//                   Constructions Pty Ltd". This is what a DOCUMENT names.
//   trading_as      The registered business name it trades under, when that
//                   differs from the entity's own name.
//
// The legal form is "<registered_name> trading as <trading_as>", and the
// "trading as" half only appears when there genuinely is one and it is not
// just the entity's name repeated. "MyOCM trading as MyOCM" is the failure
// this file exists to prevent.

export interface CompanyNameParts {
  /** The brand / nickname the platform displays. */
  name?: string | null;
  /** The ASIC-registered entity name. */
  registered_name?: string | null;
  /** The registered business name, when it differs from the entity. */
  trading_as?: string | null;
}

function clean(v: string | null | undefined): string {
  return (v ?? "").trim();
}

/** What the platform shows: the brand. Never used on a document. */
export function companyDisplayName(c: CompanyNameParts): string {
  return clean(c.name) || clean(c.trading_as) || clean(c.registered_name) || "";
}

/**
 * What a document names: the legal entity, with its trading name only when
 * that adds something.
 *
 * Falls back to the brand when no registered name has been captured yet,
 * because a notice with a blank sender is worse than one naming the firm the
 * way its clients know it.
 */
export function companyLegalName(c: CompanyNameParts): string {
  const registered = clean(c.registered_name);
  const trading = clean(c.trading_as);
  const brand = clean(c.name);

  const entity = registered || brand;
  if (!entity) return trading;

  // Nothing to add when there is no trading name, or when it is the entity
  // (or the brand) said twice.
  if (!trading) return entity;
  if (trading.toLowerCase() === entity.toLowerCase()) return entity;
  if (!registered && trading.toLowerCase() === brand.toLowerCase()) return entity;

  return `${entity} trading as ${trading}`;
}
