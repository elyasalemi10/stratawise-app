/**
 * Jaro-Winkler verification (Prompt 4 PP4-B).
 *
 * Pure-function tests , no DB required. Three canonical vectors with
 * tolerance < 0.001 plus edge cases. Per R2 resolution: if test vectors
 * don't pass at this tolerance, halt and surface immediately. Do not
 * paper over with a higher tolerance threshold.
 *
 * Usage:
 *   npx tsx src/lib/reconciliation/similarity.verification.ts
 */

import { jaroWinkler } from "./similarity";

type Result = { scenario: string; passed: boolean; detail: string };
const results: Result[] = [];

function record(scenario: string, passed: boolean, detail: string) {
  results.push({ scenario, passed, detail });
  console.log(
    `  ${passed ? "PASS" : "FAIL"}  ${scenario}${detail ? " , " + detail : ""}`,
  );
}

function checkClose(
  scenario: string,
  a: string,
  b: string,
  expected: number,
  tolerance = 0.001,
) {
  const actual = jaroWinkler(a, b);
  const diff = Math.abs(actual - expected);
  const passed = diff < tolerance;
  const detail = `jw(${JSON.stringify(a)}, ${JSON.stringify(b)}) = ${actual.toFixed(4)} (expected ${expected}, diff ${diff.toFixed(5)})`;
  record(scenario, passed, detail);
}

function checkExact(
  scenario: string,
  a: string,
  b: string,
  expected: number,
) {
  const actual = jaroWinkler(a, b);
  const passed = actual === expected;
  const detail = `jw(${JSON.stringify(a)}, ${JSON.stringify(b)}) = ${actual} (expected ${expected})`;
  record(scenario, passed, detail);
}

console.log("Jaro-Winkler verification , PP4-B canonical vectors + edges\n");

// SIM-1, SIM-2, SIM-3: canonical vectors at tolerance < 0.001.
checkClose("SIM-1: MARTHA / MARHTA",   "MARTHA", "MARHTA",   0.9611);
checkClose("SIM-2: DWAYNE / DUANE",    "DWAYNE", "DUANE",    0.8400);
checkClose("SIM-3: DIXON / DICKSONX",  "DIXON",  "DICKSONX", 0.8133);

// Edge cases.
checkExact("SIM-4: identical strings → 1.0",                        "ABC", "ABC", 1.0);
checkExact("SIM-5: empty / empty → 1.0 (identical)",                "",    "",    1.0);
checkExact("SIM-6: 'A' / '' → 0.0 (one empty)",                     "A",   "",    0.0);
checkExact("SIM-7: no common chars → 0.0",                          "ABC", "XYZ", 0.0);
checkClose("SIM-8: prefix bonus working ('CAT' / 'CATS' ≈ 0.9417)", "CAT", "CATS", 0.9417);

const passed = results.filter((r) => r.passed).length;
const failed = results.length - passed;
console.log(
  `\nResults: ${passed} passed, ${failed} failed, ${results.length} total`,
);

process.exit(failed > 0 ? 1 : 0);
