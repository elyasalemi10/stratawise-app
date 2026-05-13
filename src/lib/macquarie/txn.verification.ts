/**
 * Macquarie TXN parser verification.
 *
 * Pure-function tests against synthetic fixed-width records. Covers:
 *   - Single header + single transaction + trailer round-trip.
 *   - DRN extraction from ReferenceNumber bytes 120-130.
 *   - Indicator + transactionCode signage (DR → negative).
 *   - Amount: ASCII-decimal + integer-cents both parse to the same cents.
 *   - Trailer count + total cross-checks emit warnings on mismatch.
 *   - CRLF line endings.
 *
 * Usage:
 *   npx tsx src/lib/macquarie/txn.verification.ts
 *
 * Exit code 0 = all scenarios pass; non-zero = at least one failed.
 */

import { parseTxnFile } from "./txn";

type Result = { scenario: string; passed: boolean; detail: string };
const results: Result[] = [];

function record(scenario: string, passed: boolean, detail: string) {
  results.push({ scenario, passed, detail });
  // eslint-disable-next-line no-console
  console.log(`  ${passed ? "PASS" : "FAIL"}  ${scenario}${detail ? " — " + detail : ""}`);
}

// Field-padding helpers.
function padR(s: string, n: number): string { return (s + " ".repeat(n)).slice(0, n); }
function padL(s: string, n: string | number, fill = " "): string {
  const len = typeof n === "string" ? parseInt(n, 10) : n;
  return (String(fill).repeat(len) + s).slice(-len);
}

// Header per the spec at src/lib/macquarie/txn.ts:
//   byte 0:     recordType '0'
//   1-10:       customerNumber (9 chars, right-padded)
//   10-45:      customerName   (35)
//   45-64:      remitterName   (19)
//   64-72:      fileCreated    (YYYYMMDD)
//   72-80:      processingDate (YYYYMMDD)
//   80-100:     description    (20)
//   100-170:    padding
function buildHeader(): string {
  return (
    "0" +
    padR("123456789", 9) +
    padR("AB STRATA TEST CUSTOMER", 35) +
    padR("MACQUARIE BANK", 19) +
    "20260513" +
    "20260513" +
    padR("ACCOUNT TRANSACTIONS", 20) +
    " ".repeat(70)
  );
}

// Transaction per spec:
//   byte 0:    recordType '2'
//   1-8:       bsb        (7) — XXX-XXX
//   8-17:      accountNo  (9)
//   17-52:     accountName(35)
//   52-60:     date       (8) YYYYMMDD
//   60-76:     amount     (16) — accepts integer cents OR ASCII decimal
//   76-78:     indicator  (2) DR/CR
//   78-80:     code       (2) 13=DR, 50=CR
//   80-120:    description(40)
//   120-130:   reference  (10)  ← DRN for DEFT
//   130-140:   secondaryRef(10)
//   140-148:   chequeNo   (8)
//   148-170:   padding    (22)
function buildTxn(opts: {
  bsb?: string;
  accountNumber?: string;
  accountName?: string;
  date?: string;
  amountField?: string;
  indicator?: "DR" | "CR";
  code?: string;
  description?: string;
  drn?: string;
  secondary?: string;
  cheque?: string;
}): string {
  const {
    bsb = "183-001",
    accountNumber = "012345678",
    accountName = "OC TRUST ACCOUNT",
    date = "20260513",
    amountField = padL("0000000012345", 16, "0"),
    indicator = "CR",
    code = "50",
    description = "BPAY PAYMENT DEFT 9100200000",
    drn = "9100200000",
    secondary = "LOT3",
    cheque = "",
  } = opts;
  return (
    "2" +
    padR(bsb, 7) +
    padR(accountNumber, 9) +
    padR(accountName, 35) +
    padR(date, 8) +
    padL(amountField, 16, " ") +
    padR(indicator, 2) +
    padR(code, 2) +
    padR(description, 40) +
    padR(drn, 10) +
    padR(secondary, 10) +
    padR(cheque, 8) +
    " ".repeat(22)
  );
}

// Trailer reuses bytes 0-80 of the txn layout; from byte 80 it diverges:
//   80-86  ReferenceNumber (6)
//   86-92  TotalDebitTransactions (6)
//   92-98  TotalCreditTransactions (6)
//   98-114 TotalDebitAmount   (16) — integer cents
//   114-130 TotalCreditAmount (16)
//   130-170 padding (40)
// Trailer layout (per parser): bytes 0-80 follow the txn layout; from byte 80
// onwards the trailer-specific totals begin.
function buildTrailer(opts: {
  drCount: number;
  crCount: number;
  drCents: number;
  crCents: number;
}): string {
  return (
    "2" +
    padR("183-001", 7) +                 // 1-8
    padR("000000000", 9) +               // 8-17
    padR("BATCH TOTALS", 35) +           // 17-52
    "20260513" +                         // 52-60
    " ".repeat(16) +                     // 60-76 amount blank
    padR("BT", 2) +                      // 76-78 indicator
    padR("99", 2) +                      // 78-80 batch code
    padR("000000", 6) +                  // 80-86  reference
    padL(String(opts.drCount), 6, "0") + // 86-92  tDr count
    padL(String(opts.crCount), 6, "0") + // 92-98  tCr count
    padL(String(opts.drCents), 16, "0") +// 98-114 dr total cents
    padL(String(opts.crCents), 16, "0") +// 114-130 cr total cents
    " ".repeat(40)                       // 130-170 padding
  );
}

// ─── Scenarios ────────────────────────────────────────────────────────────

(function happyPath() {
  // Single $123.45 credit + matching trailer.
  const content = [buildHeader(), buildTxn({}), buildTrailer({
    drCount: 0, crCount: 1, drCents: 0, crCents: 12345,
  })].join("\n");
  const r = parseTxnFile(content);
  record(
    "happy path: header parsed",
    r.header?.remitterName === "MACQUARIE BANK",
    `remitter=${r.header?.remitterName}`,
  );
  record(
    "happy path: 1 transaction",
    r.transactions.length === 1,
    `count=${r.transactions.length}`,
  );
  const t = r.transactions[0];
  record(
    "happy path: amount cents",
    !!t && t.amountCents === 12345,
    `cents=${t?.amountCents}`,
  );
  record(
    "happy path: CR sign positive",
    !!t && t.signedAmountCents === 12345,
    `signed=${t?.signedAmountCents}`,
  );
  record(
    "happy path: DRN extracted",
    !!t && t.deftReferenceNumber === "9100200000",
    `drn=${t?.deftReferenceNumber}`,
  );
  record(
    "happy path: secondary ref",
    !!t && t.secondaryReference === "LOT3",
    `secondary=${t?.secondaryReference}`,
  );
  record(
    "happy path: trailer totals match (no warnings except line 0 none)",
    r.errors.filter((e) => e.message.includes("trailer")).length === 0,
    `trailerWarns=${r.errors.filter((e) => e.message.includes("trailer")).length}`,
  );
})();

(function debitSign() {
  const content = [
    buildHeader(),
    buildTxn({ amountField: padL("5000", 16, "0"), indicator: "DR", code: "13", description: "BANK FEE" }),
    buildTrailer({ drCount: 1, crCount: 0, drCents: 5000, crCents: 0 }),
  ].join("\n");
  const r = parseTxnFile(content);
  const t = r.transactions[0];
  record(
    "DR transaction signs negative",
    !!t && t.signedAmountCents === -5000 && t.indicator === "DR",
    `signed=${t?.signedAmountCents} indicator=${t?.indicator}`,
  );
})();

(function asciiDecimal() {
  // ASCII decimal format "        99.99" — leading spaces.
  const content = [
    buildHeader(),
    buildTxn({ amountField: padL("99.99", 16, " "), description: "TEST ASCII" }),
    buildTrailer({ drCount: 0, crCount: 1, drCents: 0, crCents: 9999 }),
  ].join("\n");
  const r = parseTxnFile(content);
  record(
    "ASCII decimal amount parses to same cents as integer encoding",
    r.transactions[0]?.amountCents === 9999,
    `cents=${r.transactions[0]?.amountCents}`,
  );
})();

(function crlfLineEndings() {
  const content = [
    buildHeader(),
    buildTxn({}),
    buildTrailer({ drCount: 0, crCount: 1, drCents: 0, crCents: 12345 }),
  ].join("\r\n");
  const r = parseTxnFile(content);
  record(
    "CRLF line endings: 1 transaction parsed",
    r.transactions.length === 1,
    `count=${r.transactions.length}`,
  );
})();

(function trailerMismatchWarnings() {
  // Trailer claims 2 CR transactions but file only has 1.
  const content = [
    buildHeader(),
    buildTxn({}),
    buildTrailer({ drCount: 0, crCount: 2, drCents: 0, crCents: 99999 }),
  ].join("\n");
  const r = parseTxnFile(content);
  record(
    "trailer mismatch surfaces ≥1 warning",
    r.errors.some((e) => e.message.includes("trailer")),
    `warnings=${r.errors.length}`,
  );
})();

(function noDrn() {
  // Transaction with no DRN → deftReferenceNumber empty.
  const content = [
    buildHeader(),
    buildTxn({ drn: "" }),
    buildTrailer({ drCount: 0, crCount: 1, drCents: 0, crCents: 12345 }),
  ].join("\n");
  const r = parseTxnFile(content);
  record(
    "missing DRN: deftReferenceNumber is empty string",
    r.transactions[0]?.deftReferenceNumber === "",
    `drn=${JSON.stringify(r.transactions[0]?.deftReferenceNumber)}`,
  );
})();

// ─── Report + exit ────────────────────────────────────────────────────────
const fails = results.filter((r) => !r.passed);
// eslint-disable-next-line no-console
console.log(`\n  ${results.length - fails.length}/${results.length} passed`);
if (fails.length > 0) process.exit(1);
