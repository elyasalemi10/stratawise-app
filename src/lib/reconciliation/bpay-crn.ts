// ============================================================================
// BPAY CRN — MOD10V01 generator + validator
// ----------------------------------------------------------------------------
// Strata Wise-issued CRN format: 8 digits = 7-digit zero-padded levy number + 1
// MOD10V01 check digit. Generated at notice creation time (createLevyBatch)
// regardless of whether the OC has registered a biller code; opt-in BPAY
// later requires no backfill.
//
// MOD10V01 algorithm (per BPAY developer references; resolved Gap 2):
//   - Iterate digits right-to-left.
//   - Odd-position digits (rightmost is position 1) multiplied by 2.
//   - Even-position digits multiplied by 1 (passthrough).
//   - For products >= 10, sum the digits (e.g. 18 → 1 + 8 = 9).
//   - Check digit = (10 - (sum % 10)) % 10.
//
// Round-trip self-consistency is exercised by the orchestrator verification
// preflight on n in [1, 42, 100, 999, 9999999] before any scenarios run.
// PRE_LAUNCH_CLEANUP.md flags ground-truthing this implementation against
// real BPAY-issued CRNs once an OC registers a biller code.
//
// No `"use server"` directive — pure helpers, callable from anywhere.
// ============================================================================

const MAX_LEVY_NUMBER = 9_999_999; // 7 digits

/**
 * Generate the 8-digit Strata Wise BPAY CRN for a given levy number.
 * Throws if the levy number is non-integer, < 1, or > 9,999,999.
 */
export function generateCrn(levyNumber: number): string {
  if (
    !Number.isInteger(levyNumber) ||
    levyNumber < 1 ||
    levyNumber > MAX_LEVY_NUMBER
  ) {
    throw new Error(
      `generateCrn: levyNumber must be integer in [1, ${MAX_LEVY_NUMBER}], got ${levyNumber}`,
    );
  }
  const data = String(levyNumber).padStart(7, "0");
  return data + computeMod10V01CheckDigit(data);
}

/**
 * Validate that an 8-digit string is a well-formed Strata Wise BPAY CRN.
 * Returns false on malformed input or check-digit mismatch.
 */
export function validateCrn(crn: string): boolean {
  if (!/^\d{8}$/.test(crn)) return false;
  const data = crn.slice(0, 7);
  const checkSupplied = crn.slice(7);
  return computeMod10V01CheckDigit(data) === checkSupplied;
}

/**
 * Internal: compute the MOD10V01 check digit for a digit string of any
 * length. Right-to-left, odd-position×2 + even-position×1, sum digits of
 * any double-digit products, check = (10 − sum%10) % 10.
 */
function computeMod10V01CheckDigit(data: string): string {
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    const posFromRight = data.length - i; // 1-indexed
    const digit = data.charCodeAt(i) - 48; // ASCII '0' = 48
    if (digit < 0 || digit > 9) {
      throw new Error(`computeMod10V01CheckDigit: non-digit at index ${i}`);
    }
    let product = digit * (posFromRight % 2 === 1 ? 2 : 1);
    if (product >= 10) product = Math.floor(product / 10) + (product % 10);
    sum += product;
  }
  return String((10 - (sum % 10)) % 10);
}
