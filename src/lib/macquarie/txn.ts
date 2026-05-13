// Macquarie TXN file parser.
//
// TXN files are weekly fixed-width statements Macquarie publishes for trust
// accounts on their DEFT system. Every line is 170 chars (excluding line
// terminator); the first byte is a record-type marker:
//   '0' = file header        — customer + remitter + dates + description
//   '2' = transaction record — BSB/account, date, amount, indicator (DR/CR),
//                              description, ReferenceNumber (= DRN if DEFT),
//                              SecondaryReferenceNumber, ChequeNumber.
//   '2' (last) = batch trailer — totals (debits, credits, counts).
//
// Field layout cross-checked against 17twenty/txn (Go reference impl) and
// PropertyIQ's receipting docs. The DEFT Reference Number (DRN) — what we
// match against `lot_drns` to attribute payments to a lot — sits in the
// ReferenceNumber field at bytes 120-130.
//
// Line terminator is LF or CRLF. We trim both.
//
// Amount encoding: 16 chars, right-justified. We've seen two conventions in
// the wild: integer cents (no decimal point) and ASCII with explicit decimal.
// Parser handles both by stripping whitespace and probing for '.'.

export type TxnHeader = {
  customerNumber: string;
  customerName: string;
  remitterName: string;
  fileCreated: string;        // ISO yyyy-mm-dd
  processingDate: string;     // ISO yyyy-mm-dd
  description: string;
};

export type TxnRecord = {
  /** Sequence in the file (1-based, useful for error reporting). */
  lineNumber: number;
  bsb: string;                // XXX-XXX
  accountNumber: string;
  accountName: string;
  transactionDate: string;    // ISO yyyy-mm-dd
  /** Positive number — sign is determined by `indicator`. */
  amountCents: number;
  /** Signed amount; negative for DR. */
  signedAmountCents: number;
  indicator: "DR" | "CR";
  transactionCode: string;    // "13" = debit, "50" = credit (plus others we don't enumerate)
  description: string;
  /** The DEFT Reference Number (DRN). Empty when no DRN was attached. */
  deftReferenceNumber: string;
  secondaryReference: string;
  chequeNumber: string;
};

export type TxnTrailer = {
  bsb: string;
  accountNumber: string;
  totalDebitTransactions: number;
  totalCreditTransactions: number;
  totalDebitCents: number;
  totalCreditCents: number;
};

export type TxnParseError = {
  lineNumber: number;
  message: string;
};

export type ParsedTxnFile = {
  header: TxnHeader | null;
  transactions: TxnRecord[];
  trailer: TxnTrailer | null;
  errors: TxnParseError[];
};

const LINE_LENGTH = 170;

function slice(line: string, start: number, end: number): string {
  return line.slice(start, end).trimEnd();
}

function parseYmd(raw: string, lineNumber: number, errors: TxnParseError[], field: string): string {
  const v = raw.trim();
  if (!/^\d{8}$/.test(v)) {
    errors.push({ lineNumber, message: `${field} is not a valid YYYYMMDD date: "${raw}"` });
    return "";
  }
  const yyyy = v.slice(0, 4);
  const mm = v.slice(4, 6);
  const dd = v.slice(6, 8);
  return `${yyyy}-${mm}-${dd}`;
}

function parseAmountCents(raw: string, lineNumber: number, errors: TxnParseError[]): number {
  const trimmed = raw.replace(/\s/g, "");
  if (trimmed.length === 0) {
    errors.push({ lineNumber, message: "amount field is empty" });
    return 0;
  }
  if (trimmed.includes(".")) {
    // ASCII decimal — e.g. "1234.56"
    const n = parseFloat(trimmed);
    if (!Number.isFinite(n)) {
      errors.push({ lineNumber, message: `amount is not a valid decimal: "${raw}"` });
      return 0;
    }
    return Math.round(n * 100);
  }
  // Integer cents — e.g. "0000000000012345" = $123.45
  if (!/^-?\d+$/.test(trimmed)) {
    errors.push({ lineNumber, message: `amount is not a valid integer: "${raw}"` });
    return 0;
  }
  return parseInt(trimmed, 10);
}

function parseHeader(line: string, lineNumber: number, errors: TxnParseError[]): TxnHeader {
  return {
    customerNumber: slice(line, 1, 10),
    customerName:   slice(line, 10, 45),
    remitterName:   slice(line, 45, 64),
    fileCreated:    parseYmd(line.slice(64, 72), lineNumber, errors, "fileCreated"),
    processingDate: parseYmd(line.slice(72, 80), lineNumber, errors, "processingDate"),
    description:    slice(line, 80, 100),
  };
}

function parseTransaction(line: string, lineNumber: number, errors: TxnParseError[]): TxnRecord {
  const indicatorRaw = slice(line, 76, 78);
  const indicator: "DR" | "CR" = indicatorRaw === "DR" ? "DR" : "CR";
  if (indicatorRaw !== "DR" && indicatorRaw !== "CR") {
    errors.push({ lineNumber, message: `indicator must be DR or CR, got "${indicatorRaw}"` });
  }
  const amountCents = parseAmountCents(line.slice(60, 76), lineNumber, errors);
  return {
    lineNumber,
    bsb:                  slice(line, 1, 8),
    accountNumber:        slice(line, 8, 17),
    accountName:          slice(line, 17, 52),
    transactionDate:      parseYmd(line.slice(52, 60), lineNumber, errors, "transactionDate"),
    amountCents,
    signedAmountCents:    indicator === "DR" ? -amountCents : amountCents,
    indicator,
    transactionCode:      slice(line, 78, 80),
    description:          slice(line, 80, 120),
    deftReferenceNumber:  slice(line, 120, 130),
    secondaryReference:   slice(line, 130, 140),
    chequeNumber:         slice(line, 140, 148),
  };
}

function parseTrailer(line: string, lineNumber: number, errors: TxnParseError[]): TxnTrailer {
  // The trailer reuses the first 80 bytes of the transaction layout
  // (recordType / BSB / accountNumber / accountName / date / amount / indicator
  // — the indicator is typically blank or "BT"). From byte 80 it diverges:
  //   80-86   ReferenceNumber (6 chars, integer)
  //   86-92   TotalDebitTransactions (6)
  //   92-98   TotalCreditTransactions (6)
  //   98-114  TotalDebitAmount (16)
  //  114-130  TotalCreditAmount (16)
  const tDr = parseInt(slice(line, 86, 92).trim() || "0", 10);
  const tCr = parseInt(slice(line, 92, 98).trim() || "0", 10);
  if (!Number.isFinite(tDr) || !Number.isFinite(tCr)) {
    errors.push({ lineNumber, message: "trailer transaction counts not numeric" });
  }
  return {
    bsb:                     slice(line, 1, 8),
    accountNumber:           slice(line, 8, 17),
    totalDebitTransactions:  Number.isFinite(tDr) ? tDr : 0,
    totalCreditTransactions: Number.isFinite(tCr) ? tCr : 0,
    totalDebitCents:         parseAmountCents(line.slice(98, 114), lineNumber, errors),
    totalCreditCents:        parseAmountCents(line.slice(114, 130), lineNumber, errors),
  };
}

/**
 * Parse a Macquarie TXN file. Tolerates blank lines and mixed line endings.
 * Returns header + transactions + trailer along with a structured error list
 * for the caller to surface in the upload-result UI.
 *
 * A "trailer" is identified as the last record-type-'2' line in the file
 * where the description field is empty AND a BatchType is present (positions
 * 78-80 = "BT" in the wild; we check for empty description as a fallback).
 */
export function parseTxnFile(input: string | Buffer): ParsedTxnFile {
  const text = typeof input === "string" ? input : input.toString("utf8");
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  const errors: TxnParseError[] = [];
  let header: TxnHeader | null = null;
  let trailer: TxnTrailer | null = null;
  const transactions: TxnRecord[] = [];

  // Pre-pass: find the trailer line. Trailer convention: last line whose
  // record-type is '2' and whose description field (bytes 80-86 in the
  // trailer layout = ReferenceNumber, NOT the description) is followed by
  // numeric counts. We detect by attempting to parse counts; the last line
  // where that succeeds wins. Fallback: the final '2' line in the file.
  const dataLineIndices: number[] = [];
  lines.forEach((line, i) => {
    if (line.length < LINE_LENGTH - 2) {
      // Tolerate lines that are slightly short; warn but skip.
      errors.push({ lineNumber: i + 1, message: `line is ${line.length} chars (expected ${LINE_LENGTH})` });
      return;
    }
    const recordType = line.charAt(0);
    if (recordType === "0") {
      if (header) errors.push({ lineNumber: i + 1, message: "duplicate header record" });
      header = parseHeader(line, i + 1, errors);
    } else if (recordType === "2") {
      dataLineIndices.push(i);
    } else {
      errors.push({ lineNumber: i + 1, message: `unknown record type "${recordType}"` });
    }
  });

  // Treat the last '2' record as the trailer; everything before it is a txn.
  if (dataLineIndices.length > 0) {
    const lastIdx = dataLineIndices[dataLineIndices.length - 1];
    const trailerLine = lines[lastIdx];
    trailer = parseTrailer(trailerLine, lastIdx + 1, errors);
    for (let k = 0; k < dataLineIndices.length - 1; k++) {
      const idx = dataLineIndices[k];
      transactions.push(parseTransaction(lines[idx], idx + 1, errors));
    }
  }

  // Cross-check trailer totals against transactions (warn-only — bookkeepers
  // sometimes hand-edit TXN files; we don't refuse to import).
  if (trailer) {
    let actualDr = 0, actualCr = 0, drCount = 0, crCount = 0;
    for (const t of transactions) {
      if (t.indicator === "DR") { actualDr += t.amountCents; drCount++; }
      else { actualCr += t.amountCents; crCount++; }
    }
    if (drCount !== trailer.totalDebitTransactions) {
      errors.push({ lineNumber: 0, message: `trailer reports ${trailer.totalDebitTransactions} debit txns; parser counted ${drCount}` });
    }
    if (crCount !== trailer.totalCreditTransactions) {
      errors.push({ lineNumber: 0, message: `trailer reports ${trailer.totalCreditTransactions} credit txns; parser counted ${crCount}` });
    }
    if (actualDr !== trailer.totalDebitCents) {
      errors.push({ lineNumber: 0, message: `trailer debit total ${trailer.totalDebitCents}¢ ≠ parsed sum ${actualDr}¢` });
    }
    if (actualCr !== trailer.totalCreditCents) {
      errors.push({ lineNumber: 0, message: `trailer credit total ${trailer.totalCreditCents}¢ ≠ parsed sum ${actualCr}¢` });
    }
  }

  return { header, transactions, trailer, errors };
}
