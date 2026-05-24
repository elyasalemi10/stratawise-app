// ============================================================================
// Jaro-Winkler similarity , hand-rolled (PP4-B)
// ----------------------------------------------------------------------------
// Used by Strategy 6 (fuzzy_hint) to surface "did you mean X?" hints on
// otherwise-unmatched bank transactions when the canonicalised sender
// name resembles an active bank_payer_mapping. Hint surfacing threshold
// is 0.75 (set in Strategy 6); Strategy 6 NEVER auto-matches regardless
// of score. Auto-match requires exact canonical-name equality (Strategy 3).
//
// ALGORITHM:
//   1. Match window = floor(max(len1, len2) / 2) - 1, clamped at >= 0.
//   2. Walk left-to-right through s1; for each char, scan s2 within the
//      window for an unmatched equal char. Mark both as matched.
//   3. m = total matches.
//   4. Transpositions: walk matched chars in s1 and s2 in order, count
//      pairs where the chars differ. t = transposition_count / 2.
//   5. Jaro = (m/len1 + m/len2 + (m-t)/m) / 3   (or 0 when m == 0).
//   6. Common prefix L = matching chars from start, capped at 4.
//   7. Jaro-Winkler = Jaro + L * p * (1 - Jaro), with p = 0.1.
//
// CANONICAL TEST VECTORS (verified from first principles, not the
// 2-decimal published rounded values):
//   MARTHA / MARHTA   → 0.9611  (m=6, t=1, prefix=3 → 0.94444 + 0.01667)
//   DWAYNE / DUANE    → 0.8400  (m=4, t=0, prefix=1 → 0.82222 + 0.01778)
//   DIXON  / DICKSONX → 0.8133  (m=4, t=0, prefix=2 → 0.76667 + 0.04667)
//
// The verification preflight tests these with tolerance < 0.001. If the
// preflight diverges, halt , do not paper over with a higher tolerance.
// ============================================================================

const PREFIX_SCALING_FACTOR = 0.1;
const MAX_PREFIX_LENGTH = 4;

/**
 * Jaro-Winkler similarity between two strings. Returns a value in [0, 1]
 * where 1.0 means identical strings and 0.0 means no character match.
 * Both arguments are compared character-by-character; callers should
 * canonicalise / uppercase / trim before passing if they want
 * case-insensitive whitespace-insensitive comparison.
 */
export function jaroWinkler(s1: string, s2: string): number {
  if (s1 === s2) return 1.0;
  if (s1.length === 0 || s2.length === 0) return 0.0;

  const len1 = s1.length;
  const len2 = s2.length;
  const matchWindow = Math.max(0, Math.floor(Math.max(len1, len2) / 2) - 1);

  const s1Matches = new Array<boolean>(len1).fill(false);
  const s2Matches = new Array<boolean>(len2).fill(false);

  // Pass 1: count matches inside the window.
  let matches = 0;
  for (let i = 0; i < len1; i++) {
    const start = Math.max(0, i - matchWindow);
    const end = Math.min(i + matchWindow + 1, len2);
    for (let j = start; j < end; j++) {
      if (s2Matches[j]) continue;
      if (s1[i] !== s2[j]) continue;
      s1Matches[i] = true;
      s2Matches[j] = true;
      matches++;
      break;
    }
  }

  if (matches === 0) return 0.0;

  // Pass 2: count transpositions by walking matched chars in order.
  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < len1; i++) {
    if (!s1Matches[i]) continue;
    while (k < len2 && !s2Matches[k]) k++;
    if (k >= len2) break;
    if (s1[i] !== s2[k]) transpositions++;
    k++;
  }

  const jaro =
    (matches / len1 +
      matches / len2 +
      (matches - transpositions / 2) / matches) /
    3;

  // Common prefix length, capped at MAX_PREFIX_LENGTH.
  let prefix = 0;
  const prefixLimit = Math.min(len1, len2, MAX_PREFIX_LENGTH);
  for (let i = 0; i < prefixLimit; i++) {
    if (s1[i] === s2[i]) prefix++;
    else break;
  }

  return jaro + prefix * PREFIX_SCALING_FACTOR * (1 - jaro);
}
