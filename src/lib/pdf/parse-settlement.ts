// Server-only: parses a Victorian "Notice of Acquisition of an Interest in
// Land" PDF (or scan/screenshot of one) into structured fields.
//
// Strategy: Amazon Textract → key-value pairs + lines, then we map known field
// aliases onto our internal shape. KV extraction handles format variations
// (different conveyancers reorder/relabel fields); a line-based regex fallback
// catches things Textract didn't surface as KV (e.g. "Lot N on Plan of
// Subdivision XXXX." which is a sentence, not a labelled form field).

import { analyzeDocument, type OcrResult } from "@/lib/ocr/textract";

export interface ParsedTransferee {
  kind: "individual" | "organisation" | null;
  name: string | null;
  dateOfBirth: string | null;            // ISO yyyy-mm-dd
  email: string | null;
  phone: string | null;
  addressAtTransfer: string | null;
  postalAddress: string | null;          // "Address for future correspondence"
  shareHolding: string | null;
  isLeadOwner: boolean;
}

export interface ParsedTransferor {
  kind: "individual" | "organisation" | null;
  name: string | null;
}

export interface ParsedSettlement {
  ok: boolean;                           // false = couldn't parse anything useful
  rawText: string;                       // joined lines, useful for debugging
  transferor: ParsedTransferor;
  transferee: ParsedTransferee;
  additionalTransferees: ParsedTransferee[];
  lotNumber: number | null;
  planNumber: string | null;             // bare ID, e.g. "932352U"
  volume: string | null;
  folio: string | null;
  propertyAddress: string | null;
  municipality: string | null;
  settlementDate: string | null;         // ISO yyyy-mm-dd
  contractDate: string | null;           // ISO yyyy-mm-dd
  salePriceCents: number | null;
  conveyancer: {
    name: string | null;
    email: string | null;
    phone: string | null;
    reference: string | null;
  };
}

// ─── Helpers ───────────────────────────────────────────────────

const MONTHS: Record<string, number> = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
  jan: 0, feb: 1, mar: 2, apr: 3, jun: 5, jul: 6, aug: 7, sep: 8,
  sept: 8, oct: 9, nov: 10, dec: 11,
};

function parseAusDate(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  // "04 May 2026", "4 May 2026", "13 May 1995"
  const m = trimmed.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  if (m) {
    const day = Number(m[1]);
    const month = MONTHS[m[2].toLowerCase()];
    const year = Number(m[3]);
    if (month !== undefined && Number.isFinite(day) && Number.isFinite(year)) {
      const d = new Date(Date.UTC(year, month, day));
      if (d.getUTCFullYear() === year && d.getUTCMonth() === month && d.getUTCDate() === day) {
        return d.toISOString().slice(0, 10);
      }
    }
  }
  // dd/mm/yyyy or d/m/yyyy
  const slash = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (slash) {
    const day = Number(slash[1]);
    const month = Number(slash[2]) - 1;
    const year = Number(slash[3]);
    const d = new Date(Date.UTC(year, month, day));
    if (d.getUTCFullYear() === year && d.getUTCMonth() === month && d.getUTCDate() === day) {
      return d.toISOString().slice(0, 10);
    }
  }
  // yyyy-mm-dd already
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return trimmed;
  return null;
}

function parsePriceCents(input: string | null | undefined): number | null {
  if (!input) return null;
  const cleaned = input.replace(/[$,\s]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

/**
 * Look up a field value using a list of possible label aliases. Returns the
 * first non-empty match. Keys are lowercased + space-collapsed in OcrResult,
 * so aliases here should be in that same canonical form.
 */
function pickField(kv: Record<string, string>, aliases: string[]): string | null {
  for (const alias of aliases) {
    const v = kv[alias];
    if (v && v.trim().length > 0) return v.trim();
  }
  // Fuzzy fallback: any key that *contains* one of the aliases.
  for (const alias of aliases) {
    for (const [k, v] of Object.entries(kv)) {
      if (k.includes(alias) && v && v.trim().length > 0) return v.trim();
    }
  }
  return null;
}

function emptyTransferee(): ParsedTransferee {
  return {
    kind: null, name: null, dateOfBirth: null, email: null, phone: null,
    addressAtTransfer: null, postalAddress: null, shareHolding: null, isLeadOwner: false,
  };
}

function emptyResult(): ParsedSettlement {
  return {
    ok: false,
    rawText: "",
    transferor: { kind: null, name: null },
    transferee: emptyTransferee(),
    additionalTransferees: [],
    lotNumber: null,
    planNumber: null,
    volume: null,
    folio: null,
    propertyAddress: null,
    municipality: null,
    settlementDate: null,
    contractDate: null,
    salePriceCents: null,
    conveyancer: { name: null, email: null, phone: null, reference: null },
  };
}

// ─── Main ─────────────────────────────────────────────────────

export async function parseSettlementPdf(
  buffer: Buffer,
  mimeType: string = "application/pdf",
): Promise<ParsedSettlement> {
  const result = emptyResult();

  let ocr: OcrResult;
  try {
    ocr = await analyzeDocument(buffer, mimeType);
  } catch (err) {
    console.error("parseSettlementPdf: Textract failed:", err);
    return result;
  }

  result.rawText = ocr.lines.join("\n");
  if (ocr.lines.length === 0 && Object.keys(ocr.keyValuePairs).length === 0) {
    return result;
  }

  const kv = ocr.keyValuePairs;
  const text = result.rawText;

  // ─── Transferee ───────────────────────────────────────────
  // KV-first, then fall back to scanning the text under the "Transferee(s):"
  // section header.
  result.transferee.name = pickField(kv, [
    "individual",
    "transferee individual",
    "transferee name",
    "buyer name",
    "purchaser name",
    "purchaser",
    "buyer",
  ]);
  if (result.transferee.name) {
    result.transferee.kind = "individual";
  } else {
    const orgName = pickField(kv, [
      "organisation",
      "organization",
      "transferee organisation",
      "transferee organization",
      "company",
    ]);
    if (orgName) {
      result.transferee.name = orgName;
      result.transferee.kind = "organisation";
    }
  }

  // If KV missed the transferee name, slice the section out of the lines and
  // pull the first "Individual:" / "Organisation:" line under "Transferee(s):".
  if (!result.transferee.name) {
    const transfereeBlock = sliceSection(text, /Transferee\(s\)/i, /(Details of Title|Property|Certification)/i);
    if (transfereeBlock) {
      const indiv = transfereeBlock.match(/Individual\s*:\s*([^\n]+)/i);
      const org = transfereeBlock.match(/Organisation\s*:\s*([^\n]+)/i);
      if (indiv) {
        result.transferee.kind = "individual";
        result.transferee.name = indiv[1].trim();
      } else if (org) {
        result.transferee.kind = "organisation";
        result.transferee.name = org[1].trim();
      }
    }
  }

  result.transferee.email = pickField(kv, ["email", "transferee email", "buyer email"])
    ?? extractEmailNear(text, /Transferee\(s\)/i);
  result.transferee.phone = pickField(kv, ["phone", "telephone", "mobile", "transferee phone"])
    ?? extractPhoneNear(text, /Transferee\(s\)/i);
  result.transferee.dateOfBirth = parseAusDate(pickField(kv, ["date of birth", "dob"]));
  result.transferee.addressAtTransfer = pickField(kv, [
    "address at time of transfer",
    "current address",
  ]);
  result.transferee.postalAddress = pickField(kv, [
    "address for future correspondence",
    "postal address",
    "future correspondence address",
    "correspondence address",
  ]);
  result.transferee.shareHolding = pickField(kv, ["share holding", "share"]);
  const lead = pickField(kv, ["lead owner"]);
  result.transferee.isLeadOwner = lead != null && /yes/i.test(lead);

  // ─── Transferor ───────────────────────────────────────────
  const transferorIndiv = pickField(kv, ["transferor individual", "vendor name", "seller name"]);
  const transferorOrg = pickField(kv, [
    "transferor organisation", "transferor organization", "vendor organisation", "seller",
  ]);
  if (transferorIndiv) {
    result.transferor = { kind: "individual", name: transferorIndiv };
  } else if (transferorOrg) {
    result.transferor = { kind: "organisation", name: transferorOrg };
  } else {
    const transferorBlock = sliceSection(text, /Transferor\(s\)/i, /Transferee\(s\)/i);
    if (transferorBlock) {
      const indiv = transferorBlock.match(/Individual\s*:\s*([^\n]+)/i);
      const org = transferorBlock.match(/Organisation\s*:\s*([^\n]+)/i);
      if (indiv) result.transferor = { kind: "individual", name: indiv[1].trim() };
      else if (org) result.transferor = { kind: "organisation", name: org[1].trim() };
    }
  }

  // ─── Lot / Plan ───────────────────────────────────────────
  // "Lot 4 on Plan of Subdivision 932352U." appears as a sentence in the
  // "Parts of Title" block, not a KV pair. Scan all lines.
  const lotPlan = text.match(/Lot\s+(\d+)\s+on\s+Plan(?:\s+of\s+Subdivision)?\s+([A-Za-z0-9]+)/i);
  if (lotPlan) {
    result.lotNumber = Number(lotPlan[1]);
    result.planNumber = lotPlan[2].toUpperCase();
  }
  // KV fallback if the sentence form isn't there.
  if (result.lotNumber == null) {
    const lotKv = pickField(kv, ["lot number", "lot", "lot no"]);
    if (lotKv) {
      const n = Number(lotKv.replace(/\D/g, ""));
      if (Number.isFinite(n)) result.lotNumber = n;
    }
  }
  if (!result.planNumber) {
    const planKv = pickField(kv, [
      "plan of subdivision", "plan number", "plan", "ps", "lp",
    ]);
    if (planKv) {
      const tail = planKv.match(/[A-Za-z0-9]+$/);
      result.planNumber = (tail?.[0] ?? planKv).toUpperCase();
    }
  }

  // Volume / Folio
  const volFolio = text.match(/Volume\s+(\w+)\s+Folio\s+(\w+)/i);
  if (volFolio) {
    result.volume = volFolio[1];
    result.folio = volFolio[2];
  }

  // ─── Property ─────────────────────────────────────────────
  result.propertyAddress = pickField(kv, [
    "address of property", "property address", "address",
  ]) ?? extractAfterLabel(text, /Address of property\s*:?/i);
  result.municipality = pickField(kv, ["municipality", "council"])
    ?? extractAfterLabel(text, /Municipality\s*:?/i);

  // ─── Dates ─────────────────────────────────────────────────
  result.settlementDate = parseAusDate(pickField(kv, [
    "date of possession/transfer",
    "date of possession / transfer",
    "date of possession",
    "settlement date",
    "possession date",
    "date of transfer",
    "transfer date",
  ]));
  result.contractDate = parseAusDate(pickField(kv, [
    "date of contract", "contract date",
  ]));
  // Regex fallback on the text in case Textract truncated the slash.
  if (!result.settlementDate) {
    const m = text.match(/(?:Date of possession[^:\n]*|Settlement\s+Date|Possession\s+Date)\s*:?\s*([^\n]+)/i);
    result.settlementDate = parseAusDate(m?.[1]);
  }
  if (!result.contractDate) {
    const m = text.match(/(?:Date of Contract|Contract\s+Date)\s*:?\s*([^\n]+)/i);
    result.contractDate = parseAusDate(m?.[1]);
  }

  // ─── Sale price ────────────────────────────────────────────
  const priceStr = pickField(kv, [
    "total sale price (gst inclusive)",
    "total sale price",
    "sale price",
    "purchase price",
    "price",
  ]);
  result.salePriceCents = parsePriceCents(priceStr);
  if (result.salePriceCents == null) {
    const m = text.match(/(?:Total Sale Price[^:]*|Sale Price)\s*:?\s*\$?\s*([\d,.]+)/i);
    result.salePriceCents = parsePriceCents(m?.[1]);
  }

  // ─── Conveyancer ──────────────────────────────────────────
  const certBlock = sliceSection(text, /Certification\b|Subscriber\s+Certifications/i, /$/);
  if (certBlock) {
    result.conveyancer.name = pickField(kv, ["name"])
      ?? extractAfterLabel(certBlock, /Name\s*:?/i);
    result.conveyancer.email = pickField(kv, ["email"])
      ?? extractEmail(certBlock);
    result.conveyancer.phone = pickField(kv, ["phone"])
      ?? extractPhone(certBlock);
    result.conveyancer.reference = pickField(kv, ["reference", "ref"])
      ?? extractAfterLabel(certBlock, /Reference\s*:?/i);
  }

  result.ok = Boolean(
    result.transferee.name ||
    result.lotNumber ||
    result.settlementDate ||
    result.salePriceCents,
  );
  return result;
}

// ─── Text-extraction helpers ─────────────────────────────────

function sliceSection(text: string, start: RegExp, end: RegExp): string | null {
  const startIdx = text.search(start);
  if (startIdx < 0) return null;
  const after = text.slice(startIdx);
  const endRel = after.slice(1).search(end);
  if (endRel < 0) return after;
  return after.slice(0, endRel + 1);
}

function extractAfterLabel(text: string, label: RegExp): string | null {
  const re = new RegExp(label.source + "\\s*([^\\n]+)", label.flags);
  const m = text.match(re);
  return m?.[1]?.trim() || null;
}

function extractEmail(text: string): string | null {
  const m = text.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
  return m?.[0] ?? null;
}

function extractPhone(text: string): string | null {
  // AU phone: 04xx xxx xxx, +61 ..., (03) ...
  const m = text.match(/(?:\+61\s*)?(?:\(0\d\)\s*)?\d[\d\s-]{6,}\d/);
  return m?.[0]?.trim() ?? null;
}

function extractEmailNear(text: string, anchor: RegExp): string | null {
  const idx = text.search(anchor);
  if (idx < 0) return extractEmail(text);
  // Look in the 800 chars after the anchor — that's roughly one section.
  return extractEmail(text.slice(idx, idx + 800)) ?? extractEmail(text);
}

function extractPhoneNear(text: string, anchor: RegExp): string | null {
  const idx = text.search(anchor);
  if (idx < 0) return extractPhone(text);
  return extractPhone(text.slice(idx, idx + 800)) ?? extractPhone(text);
}
