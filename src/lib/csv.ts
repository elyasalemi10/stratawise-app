export interface ParsedCSV {
  headers: string[];
  rows: string[][];
}

export function parseCSV(input: string): ParsedCSV {
  const text = input.replace(/^﻿/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ",") {
      row.push(field);
      field = "";
      continue;
    }
    if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }
    field += ch;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const nonEmpty = rows.filter((r) => r.some((c) => c.trim().length > 0));
  if (nonEmpty.length === 0) return { headers: [], rows: [] };

  const headers = nonEmpty[0].map((h) => h.trim());
  return { headers, rows: nonEmpty.slice(1) };
}

// ─── Date parsing ─────────────────────────────────────────

const MONTH_ABBR: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

// Parse dates in common Australian bank export formats.
// Returns YYYY-MM-DD string or null if unparseable.
export function normaliseDate(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;

  // ISO YYYY-MM-DD
  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) return toISO(+iso[1], +iso[2], +iso[3]);

  // DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY (Australian default)
  const dmy = raw.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (dmy) {
    const day = +dmy[1];
    const month = +dmy[2];
    let year = +dmy[3];
    if (year < 100) year += year >= 70 ? 1900 : 2000;
    return toISO(year, month, day);
  }

  // DD-Mmm-YYYY (e.g. "03-Apr-2026")
  const dmyText = raw.match(/^(\d{1,2})[\s\-]([A-Za-z]{3,4})[\s\-](\d{2,4})$/);
  if (dmyText) {
    const day = +dmyText[1];
    const month = MONTH_ABBR[dmyText[2].toLowerCase()];
    let year = +dmyText[3];
    if (!month) return null;
    if (year < 100) year += year >= 70 ? 1900 : 2000;
    return toISO(year, month, day);
  }

  return null;
}

function toISO(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
}

// ─── Number parsing ────────────────────────────────────────

// Accepts "1,234.56", "-1,234.56", "$1,234.56", "(1,234.56)" (debit), "1234.56 CR"
export function parseAmount(input: string): number | null {
  const raw = input.trim();
  if (!raw) return null;

  let sign = 1;
  let working = raw;

  // Parenthesised debits
  if (/^\(.*\)$/.test(working)) {
    sign = -1;
    working = working.slice(1, -1);
  }

  // CR/DR suffix
  const crdr = working.match(/\b(CR|DR)\b\s*$/i);
  if (crdr) {
    if (crdr[1].toUpperCase() === "DR") sign = -1;
    working = working.slice(0, crdr.index).trim();
  }

  // Strip currency symbols, commas, spaces
  working = working.replace(/[$,\s]/g, "");

  if (working === "" || working === "-") return null;
  const n = Number(working);
  if (!Number.isFinite(n)) return null;
  return sign * n;
}

// ─── Column auto-detection ─────────────────────────────────

export interface ColumnMapping {
  date: number;
  description: number;
  amount: number;
  debit: number;
  credit: number;
  balance: number;
}

const HEADER_HINTS = {
  date: [/^date$/i, /^transaction\s*date$/i, /^posted\s*date$/i, /^value\s*date$/i, /^effective\s*date$/i],
  description: [/^description$/i, /^narration$/i, /^details$/i, /^transaction$/i, /^particulars$/i, /^memo$/i, /^reference$/i],
  amount: [/^amount$/i, /^transaction\s*amount$/i],
  debit: [/^debit$/i, /^withdrawal$/i, /^withdrawals?$/i, /^debits?\s*amount$/i, /^amount\s*debit$/i, /^money\s*out$/i],
  credit: [/^credit$/i, /^deposit$/i, /^deposits?$/i, /^credits?\s*amount$/i, /^amount\s*credit$/i, /^money\s*in$/i],
  balance: [/^balance$/i, /^running\s*balance$/i],
};

export function detectColumns(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = { date: -1, description: -1, amount: -1, debit: -1, credit: -1, balance: -1 };
  headers.forEach((h, i) => {
    const header = h.trim();
    (Object.keys(HEADER_HINTS) as Array<keyof typeof HEADER_HINTS>).forEach((key) => {
      if (mapping[key] !== -1) return;
      if (HEADER_HINTS[key].some((rx) => rx.test(header))) {
        mapping[key] = i;
      }
    });
  });
  return mapping;
}

// ─── Build typed rows from parsed CSV given a mapping ──────

export interface NormalisedRow {
  transaction_date: string;
  amount: number;
  description: string;
  balance: number | null;
}

export interface RowError {
  lineNumber: number;
  reason: string;
}

export function normaliseRows(
  rows: string[][],
  mapping: ColumnMapping
): { rows: NormalisedRow[]; errors: RowError[] } {
  const normalised: NormalisedRow[] = [];
  const errors: RowError[] = [];

  const hasAmount = mapping.amount >= 0;
  const hasDebitCredit = mapping.debit >= 0 || mapping.credit >= 0;
  if (!hasAmount && !hasDebitCredit) {
    errors.push({ lineNumber: 1, reason: "No amount/debit/credit column mapped" });
    return { rows: normalised, errors };
  }
  if (mapping.date < 0) {
    errors.push({ lineNumber: 1, reason: "No date column mapped" });
    return { rows: normalised, errors };
  }

  rows.forEach((row, idx) => {
    const lineNumber = idx + 2; // +1 for header, +1 for 1-indexing
    const dateRaw = row[mapping.date] ?? "";
    const date = normaliseDate(dateRaw);
    if (!date) {
      errors.push({ lineNumber, reason: `Invalid date: "${dateRaw}"` });
      return;
    }

    let amount: number | null = null;
    if (mapping.amount >= 0) {
      amount = parseAmount(row[mapping.amount] ?? "");
    } else {
      const debit = parseAmount(row[mapping.debit] ?? "") ?? 0;
      const credit = parseAmount(row[mapping.credit] ?? "") ?? 0;
      amount = credit - Math.abs(debit);
    }
    if (amount === null || amount === 0) {
      errors.push({ lineNumber, reason: `Invalid or zero amount` });
      return;
    }

    const description = (mapping.description >= 0 ? row[mapping.description] ?? "" : "").trim();
    const balanceRaw = mapping.balance >= 0 ? row[mapping.balance] ?? "" : "";
    const balance = balanceRaw ? parseAmount(balanceRaw) : null;

    normalised.push({
      transaction_date: date,
      amount: Math.round(amount * 100) / 100,
      description,
      balance: balance !== null ? Math.round(balance * 100) / 100 : null,
    });
  });

  return { rows: normalised, errors };
}
