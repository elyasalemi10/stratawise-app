// Macquarie Business Online DRN export CSV parser.
//
// When a strata manager sets up DEFT for a trust account, Macquarie issues
// one DEFT Reference Number per payer (≈ one per lot). The full list is
// exported from Macquarie Business Online as a CSV with these columns
// (header names vary slightly between vintages — we normalise):
//
//   DEFT Reference Number   - the actual DRN (digits)
//   Account Number          - which Macquarie trust account it's linked to
//   Primary ID              - usually the payer name (lot owner)
//   Secondary ID            - usually the lot number / unit number
//   Reference / Description - optional free-text
//
// Onboarding flow: parse the CSV, match each row to a `lots` row by
// Secondary ID (lot_number) first, falling back to Primary ID (payer name)
// fuzzy-matching against the lot's owner record. Unmatched rows surface in
// the wizard for manual resolution.

export type DrnCsvRow = {
  rowNumber: number;                // 1-based, header is row 1
  drn: string;
  accountNumber: string | null;
  primaryId: string | null;         // payer name
  secondaryId: string | null;       // lot number
  reference: string | null;
};

export type DrnCsvParseResult = {
  rows: DrnCsvRow[];
  errors: { rowNumber: number; message: string }[];
};

// Header aliases — same logical column under different export-tool vintages.
const HEADER_ALIASES: Record<string, keyof Omit<DrnCsvRow, "rowNumber">> = {
  "deft reference number": "drn",
  "deft reference": "drn",
  "drn": "drn",
  "reference number": "drn",
  "account number": "accountNumber",
  "account": "accountNumber",
  "primary id": "primaryId",
  "primary": "primaryId",
  "payer name": "primaryId",
  "payer": "primaryId",
  "secondary id": "secondaryId",
  "secondary": "secondaryId",
  "lot number": "secondaryId",
  "lot": "secondaryId",
  "reference": "reference",
  "description": "reference",
  "narrative": "reference",
};

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') { inQ = false; }
      else { cur += c; }
    } else {
      if (c === ",") { out.push(cur); cur = ""; }
      else if (c === '"') { inQ = true; }
      else { cur += c; }
    }
  }
  out.push(cur);
  return out;
}

function normaliseDrn(raw: string): string {
  // DRNs from Macquarie are typically all-digit. Strip everything else.
  return raw.replace(/\D/g, "");
}

export function parseDrnCsv(text: string): DrnCsvParseResult {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const errors: DrnCsvParseResult["errors"] = [];
  if (lines.length < 2) {
    errors.push({ rowNumber: 0, message: "CSV is empty or has no data rows" });
    return { rows: [], errors };
  }
  const headerRow = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  // Build a column-index → logical-field map.
  const colMap: Record<number, keyof Omit<DrnCsvRow, "rowNumber">> = {};
  headerRow.forEach((h, idx) => {
    const field = HEADER_ALIASES[h];
    if (field) colMap[idx] = field;
  });
  if (!Object.values(colMap).includes("drn")) {
    errors.push({ rowNumber: 1, message: "CSV is missing a DRN / DEFT Reference Number column" });
    return { rows: [], errors };
  }

  const rows: DrnCsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const rowNumber = i + 1;
    const cols = parseCsvLine(lines[i]);
    const row: DrnCsvRow = {
      rowNumber,
      drn: "",
      accountNumber: null,
      primaryId: null,
      secondaryId: null,
      reference: null,
    };
    for (const [colIdxStr, field] of Object.entries(colMap)) {
      const colIdx = Number(colIdxStr);
      const raw = (cols[colIdx] ?? "").trim();
      if (!raw) continue;
      if (field === "drn") row.drn = normaliseDrn(raw);
      else (row as Record<typeof field, string>)[field] = raw;
    }
    if (!row.drn) {
      errors.push({ rowNumber, message: "missing DRN" });
      continue;
    }
    rows.push(row);
  }
  return { rows, errors };
}

// ─── Auto-match against the OC's lots ─────────────────────────────

export type LotForMatch = {
  id: string;
  lot_number: number;
  unit_number?: string | null;
};

export type LotOwnerForMatch = {
  lot_id: string;
  name: string;
};

export type DrnMatchResult = {
  drnRow: DrnCsvRow;
  lotId: string | null;
  matchedBy: "secondary_id_lot_number" | "secondary_id_unit_number" | "primary_id_owner_name" | null;
  confidence: "exact" | "fuzzy" | "none";
  note?: string;
};

function normaliseName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
}

// Jaro-Winkler-lite for short names: token-set Jaccard, good enough for
// "John Smith" vs "Smith, John" vs "Smith Mr J".
function nameSimilarity(a: string, b: string): number {
  const ta = new Set(normaliseName(a).split(" ").filter((t) => t.length > 1));
  const tb = new Set(normaliseName(b).split(" ").filter((t) => t.length > 1));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / Math.max(ta.size, tb.size);
}

export function matchDrnsToLots(
  drnRows: DrnCsvRow[],
  lots: LotForMatch[],
  owners: LotOwnerForMatch[],
): DrnMatchResult[] {
  const lotByNumber = new Map<number, LotForMatch>();
  const lotByUnit = new Map<string, LotForMatch>();
  for (const l of lots) {
    lotByNumber.set(l.lot_number, l);
    if (l.unit_number) lotByUnit.set(l.unit_number.trim().toLowerCase(), l);
  }
  const ownersByLot = new Map<string, string[]>();
  for (const o of owners) {
    const list = ownersByLot.get(o.lot_id) ?? [];
    list.push(o.name);
    ownersByLot.set(o.lot_id, list);
  }

  return drnRows.map((drnRow) => {
    // 1) Secondary ID — exact lot number match.
    if (drnRow.secondaryId) {
      const asInt = parseInt(drnRow.secondaryId.replace(/\D/g, ""), 10);
      if (Number.isFinite(asInt)) {
        const lot = lotByNumber.get(asInt);
        if (lot) return { drnRow, lotId: lot.id, matchedBy: "secondary_id_lot_number", confidence: "exact" };
      }
      // 2) Secondary ID — unit number match (case-insensitive).
      const unitKey = drnRow.secondaryId.trim().toLowerCase();
      const byUnit = lotByUnit.get(unitKey);
      if (byUnit) return { drnRow, lotId: byUnit.id, matchedBy: "secondary_id_unit_number", confidence: "exact" };
    }
    // 3) Primary ID — fuzzy match against owners. Threshold 0.6 = at least
    // 60% of name tokens overlap. Higher threshold for short names.
    if (drnRow.primaryId) {
      let best: { lotId: string; score: number } | null = null;
      for (const [lotId, names] of ownersByLot.entries()) {
        for (const n of names) {
          const s = nameSimilarity(drnRow.primaryId, n);
          if (!best || s > best.score) best = { lotId, score: s };
        }
      }
      if (best && best.score >= 0.6) {
        return {
          drnRow, lotId: best.lotId, matchedBy: "primary_id_owner_name",
          confidence: best.score >= 0.9 ? "exact" : "fuzzy",
          note: `name similarity ${(best.score * 100).toFixed(0)}%`,
        };
      }
    }
    return { drnRow, lotId: null, matchedBy: null, confidence: "none" };
  });
}
