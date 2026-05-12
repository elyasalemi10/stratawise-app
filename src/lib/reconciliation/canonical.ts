// ============================================================================
// Sender-name canonicalisation — narrow noise-strip pipeline (PP4-B)
// ----------------------------------------------------------------------------
// Reduces a free-text bank-transaction description to a canonical uppercase
// string suitable for:
//   - Strategy 3 (known_payer) exact-match lookup against bank_payer_mappings
//   - Strategy 6 (fuzzy_hint) Jaro-Winkler similarity against active mappings
//
// CONSERVATIVE BY DESIGN. Under-canonicalisation manifests as "no auto-match"
// (recoverable: manager unmatches and creates the mapping manually). Over-
// canonicalisation manifests as "wrong auto-match" (money to the wrong lot,
// only recoverable via void + manual match). Always prefer the recoverable
// failure mode; expand the noise list only with evidence from real Basiq
// sandbox descriptions (PRE_LAUNCH_CLEANUP item).
//
// Pipeline (order matters):
//   1. null/empty fast-path
//   2. uppercase
//   3. strip StrataWise levy refs (LEV-7, LEV7, LEV 7 etc.)
//   4. strip BPAY blocks (BPAY + non-uppercase chars + digit runs)
//   5. strip directional noise (TRANSFER FROM, FROM, OSKO FROM, etc.)
//   6. strip BSB strings (DDD-DDD)
//   7. strip long digit runs (6-10 contiguous digits — basiq IDs, account #)
//   8. strip dates (DD/MM/YYYY, DD-MM-YYYY)
//   9. collapse whitespace + trim
//  10. return null if remaining length < 2
//
// Replacements use " " (space), not "" — preserves word boundaries when
// stripped tokens are adjacent to letters. Final whitespace collapse
// normalises everything.
// ============================================================================

const LEVY_REF_REGEX = /\bLEV-?\s*\d+\b/g;
const BPAY_BLOCK_REGEX = /\bBPAY\b[^A-Z]*(\d+[^A-Z]*)+/g;
const DIRECTIONAL_NOISE_REGEX =
  /\b(TRANSFER\s+FROM|DIRECT\s+CREDIT|DIRECT\s+DEBIT|PAYMENT\s+FROM|PAYMENT\s+TO|OSKO\s+FROM|EFTPOS|NPP|FROM|TO)\b/g;
const BSB_REGEX = /\b\d{3}-\d{3}\b/g;
const DATE_REGEX = /\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/g;
const LONG_DIGIT_REGEX = /\b\d{6,10}\b/g;
const WHITESPACE_REGEX = /\s+/g;

const MIN_CANONICAL_LENGTH = 2;

/**
 * Canonicalise a bank-transaction description for sender-name matching.
 * Returns null when input is null/empty or the canonicalised result is
 * too short to be a meaningful sender name (< 2 chars).
 */
export function canonicaliseSender(
  raw: string | null | undefined,
): string | null {
  if (!raw) return null;
  let s = raw.toUpperCase();
  s = s.replace(LEVY_REF_REGEX, " ");
  s = s.replace(BPAY_BLOCK_REGEX, " ");
  // Dates BEFORE BSBs and LONG_DIGIT — date pattern overlaps with BSBs
  // (e.g. "12-345-678" partially) and we want the full date stripped first.
  s = s.replace(DATE_REGEX, " ");
  s = s.replace(BSB_REGEX, " ");
  s = s.replace(LONG_DIGIT_REGEX, " ");
  s = s.replace(DIRECTIONAL_NOISE_REGEX, " ");
  s = s.replace(WHITESPACE_REGEX, " ").trim();
  if (s.length < MIN_CANONICAL_LENGTH) return null;
  return s;
}
