// How a lot is named, everywhere: screens, PDFs, emails, subject lines.
//
// The lot number is the legal identifier (levies, liability, certificates and
// votes all attach to it). What an owner recognises is where they live, and in
// an OC that can be either of two things:
//
//   - a unit inside one building:    Lot 3, Unit 3B   ->  3B/12 Example St
//   - a separate street address:     Lot 8, 2 Sooty Lane
//
// The second case is why this file exists. Townhouse OCs have no units, and
// when the only per-lot field was `unit_number` (and it was mandatory),
// managers typed the lot number into it. Notices then printed "Lot 8 Unit 8"
// for a house at 2 Sooty Lane, and an owner disputed a correct levy because
// "Unit 8" read as 8 Sooty Lane.
//
// Rules:
//   - Never hand-roll "Lot ${n} Unit ${u}" at a call site. Use these.
//   - A street address wins over a unit: a lot with its own address is
//     identified by that address.
//   - A unit equal to the lot number is noise left over from the old
//     mandatory field, so it is not printed. "Lot 8" is honest; "Lot 8,
//     Unit 8" claims something nobody has checked.

export type LotIdentity = {
  lot_number: number | string | null | undefined;
  unit_number?: string | null;
  street_address?: string | null;
};

/** The unit worth printing, or null. Drops one that just repeats the lot number. */
function meaningfulUnit(lot: LotIdentity): string | null {
  const unit = lot.unit_number?.trim();
  if (!unit) return null;
  if (lot.lot_number != null && unit === String(lot.lot_number).trim()) return null;
  return unit;
}

/**
 * Where the lot is, as an owner would say it: "2 Sooty Lane", "Unit 3B", or
 * "". For a table column next to the lot number.
 */
export function lotPlace(lot: LotIdentity): string {
  const street = lot.street_address?.trim();
  if (street) return street;
  const unit = meaningfulUnit(lot);
  if (unit) return `Unit ${unit}`;
  return "";
}

/**
 * What follows "Lot N", including its leading separator: ", 2 Sooty Lane",
 * ", Unit 3B", or "". For call sites that render "Lot N" themselves (bold
 * number, link, etc.) and append the rest.
 */
export function lotSuffix(lot: LotIdentity): string {
  const place = lotPlace(lot);
  return place ? `, ${place}` : "";
}

/** "Lot 8, 2 Sooty Lane" | "Lot 3, Unit 3B" | "Lot 8". */
export function lotLabel(lot: LotIdentity): string {
  if (lot.lot_number == null || String(lot.lot_number).trim() === "") {
    return lotPlace(lot);
  }
  return `Lot ${lot.lot_number}${lotSuffix(lot)}`;
}

/**
 * The locality half of an OC address: "1-8 Sooty Lane, Pakenham 3810" gives
 * "Pakenham 3810". Everything after the first comma.
 */
function locality(ocAddress: string): string {
  const i = ocAddress.indexOf(",");
  return i === -1 ? "" : ocAddress.slice(i + 1).trim();
}

/**
 * The postal-style address of one lot, or null when nothing is known.
 *
 *   street_address set:  "2 Sooty Lane, Pakenham 3810"
 *   unit set:            "3B/12 Example St, Suburb 3000"
 *   neither:             "Lot 8, 12 Example St, Suburb 3000"
 *
 * `bare: true` returns the plain OC address in the "neither" case, for
 * surfaces that already print "Lot 8" on another line or need something
 * postable (a levy notice's owner box, a seeded postal address).
 */
export function lotAddress(
  lot: LotIdentity,
  ocAddress: string | null | undefined,
  opts: { bare?: boolean } = {},
): string | null {
  const address = ocAddress?.trim() || "";
  const street = lot.street_address?.trim();
  if (street) {
    const loc = address ? locality(address) : "";
    return loc ? `${street}, ${loc}` : street;
  }
  const unit = meaningfulUnit(lot);
  if (unit && address) return `${unit}/${address}`;
  if (address && lot.lot_number != null && !opts.bare) return `Lot ${lot.lot_number}, ${address}`;
  if (address) return address;
  if (unit) return `Unit ${unit}`;
  if (lot.lot_number != null) return `Lot ${lot.lot_number}`;
  return null;
}

/**
 * True when every lot's unit is just its lot number. That almost always means
 * the field was filled in to get past an old required check rather than read
 * off the plan, so the street-to-lot mapping has never been verified.
 */
export function unitsMirrorLotNumbers(lots: LotIdentity[]): boolean {
  const withUnit = lots.filter((l) => l.unit_number?.trim());
  if (withUnit.length < 2) return false;
  if (lots.some((l) => l.street_address?.trim())) return false;
  return withUnit.length === lots.length &&
    withUnit.every((l) => l.unit_number!.trim() === String(l.lot_number).trim());
}
