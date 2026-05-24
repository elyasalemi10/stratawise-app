import { randomBytes } from "crypto";

// Crockford base-32 alphabet (no 0/O/1/I/L) , typeable & speakable.
// 32^10 ≈ 1.13×10^15 combinations.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 32 chars
const LENGTH = 10;

/**
 * Generate a 10-char invite code using a CSPRNG. Bias is statistically
 * negligible (256 mod 32 == 0, so each byte maps cleanly).
 */
export function generateInviteCode(length = LENGTH): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
}

/** Normalise user-typed input: uppercase, strip whitespace + dashes. */
export function normaliseInviteCode(input: string): string {
  return input.toUpperCase().replace(/[\s-]/g, "");
}

/** Whether a normalised input is a structurally valid invite code. */
export function isInviteCodeShape(s: string): boolean {
  return s.length === LENGTH && /^[A-Z2-9]+$/.test(s);
}
