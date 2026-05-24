/**
 * Canonicaliser verification (Prompt 4 PP4-B).
 *
 * Pure-function tests , no DB required. Exercises the noise-strip pipeline
 * against synthetic descriptions covering each noise pattern + edge cases
 * (null, empty, short result, legitimate names with punctuation).
 *
 * Usage:
 *   npx tsx src/lib/reconciliation/canonical.verification.ts
 *
 * Exit code 0 = all scenarios pass; non-zero = at least one failed.
 */

import { canonicaliseSender } from "./canonical";

type Result = { scenario: string; passed: boolean; detail: string };
const results: Result[] = [];

function record(scenario: string, passed: boolean, detail: string) {
  results.push({ scenario, passed, detail });
  console.log(
    `  ${passed ? "PASS" : "FAIL"}  ${scenario}${detail ? " , " + detail : ""}`,
  );
}

function check(
  scenario: string,
  raw: string | null | undefined,
  expected: string | null,
) {
  const actual = canonicaliseSender(raw);
  const passed = actual === expected;
  const detail = passed
    ? `canonicalise(${JSON.stringify(raw)}) → ${JSON.stringify(actual)}`
    : `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)} for input ${JSON.stringify(raw)}`;
  record(scenario, passed, detail);
}

console.log("Canonical verification , PP4-B scenarios\n");

// CAN-1: null → null
check("CAN-1: null input returns null", null, null);

// CAN-2: empty string → null
check("CAN-2: empty string returns null", "", null);

// CAN-3: input that canonicalises to <2 chars → null
check(
  "CAN-3: result-too-short returns null (only noise tokens)",
  "BPAY 12345678",
  null,
);

// CAN-4: simple owner name uppercased
check(
  "CAN-4: simple owner name → uppercase",
  "Jane Brown",
  "JANE BROWN",
);

// CAN-5: StrataWise levy reference stripped
check(
  "CAN-5: levy reference 'LEV-7' stripped",
  "TRANSFER LEV-7 FROM JANE BROWN",
  "JANE BROWN",
);

// CAN-6: BPAY block stripped
check(
  "CAN-6: BPAY block stripped",
  "BPAY 12345678 from Jane Brown",
  "JANE BROWN",
);

// CAN-7: BSB string stripped (paired with DIRECT CREDIT, which IS in
// the directional noise list , "TRANSFER" alone is not stripped)
check(
  "CAN-7: BSB string '062-001' stripped",
  "DIRECT CREDIT 062-001 JANE BROWN",
  "JANE BROWN",
);

// CAN-8: long digit run stripped
check(
  "CAN-8: long digit run (9999999) stripped",
  "DIRECT CREDIT 9999999 JANE",
  "JANE",
);

// CAN-9: date stripped
check(
  "CAN-9: date '12/04/2026' stripped",
  "PAYMENT FROM JANE BROWN 12/04/2026",
  "JANE BROWN",
);

// CAN-10: case insensitive uppercase
check(
  "CAN-10: lowercase input → UPPERCASE output",
  "jane brown",
  "JANE BROWN",
);

// CAN-11: legitimate punctuation preserved (dashes, apostrophes)
check(
  "CAN-11: punctuation in legitimate names preserved",
  "JOHN-PAUL O'CONNOR",
  "JOHN-PAUL O'CONNOR",
);

// CAN-12: composite multi-noise input
check(
  "CAN-12: composite multi-noise → JANE BROWN",
  "TRANSFER FROM JANE BROWN BPAY 12345678 LEV-7 062-001 12/04/2026",
  "JANE BROWN",
);

const passed = results.filter((r) => r.passed).length;
const failed = results.length - passed;
console.log(
  `\nResults: ${passed} passed, ${failed} failed, ${results.length} total`,
);

process.exit(failed > 0 ? 1 : 0);
