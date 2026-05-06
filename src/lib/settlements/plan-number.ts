/**
 * Subdivisions store plan_number with mixed conventions: "932352U", "Plan
 * 932352U", "Plan of Subdivision 932352U", "PS 932352U", etc. The PDF/OCR
 * always quotes the bare ID. Normalise both sides to the same canonical form
 * before comparing so the prefix doesn't break matching.
 */
export function normalizePlanNumber(input: string | null | undefined): string | null {
  if (!input) return null;
  const upper = input.toUpperCase();
  const matches = upper.match(/[A-Z0-9]+/g);
  if (!matches || matches.length === 0) return null;
  const PREFIX_TOKENS = new Set(["PLAN", "OF", "SUBDIVISION", "PS", "LP", "RP", "TP"]);
  const filtered = matches.filter((t) => !PREFIX_TOKENS.has(t));
  const tokens = filtered.length > 0 ? filtered : matches;
  return tokens[tokens.length - 1] || null;
}
