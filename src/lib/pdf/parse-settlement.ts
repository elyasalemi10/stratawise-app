// Server-only: parses a Victorian "Notice of Acquisition of an Interest in Land"
// PDF (the standard SAI Global / PEXA conveyancer output) into structured fields.
// The form has consistent labels, so we extract via labelled regex on the
// concatenated text layer rather than relying on positional layout.
//
// We use pdfjs-dist directly via its legacy ESM build (Node-friendly, no DOM
// globals). pdf-parse v2's worker setup doesn't survive Next.js bundling
// (it tries to import pdf.worker.mjs from a path that doesn't exist after
// Turbopack rewrites), so we run pdfjs synchronously with the worker disabled.
// The legacy build supports inline parsing via `disableWorker: true`.

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
  rawText: string;
  transferor: ParsedTransferor;
  transferee: ParsedTransferee;
  additionalTransferees: ParsedTransferee[];
  lotNumber: number | null;
  planNumber: string | null;             // e.g. "932352U"
  volume: string | null;
  folio: string | null;
  propertyAddress: string | null;
  municipality: string | null;
  settlementDate: string | null;         // ISO yyyy-mm-dd, from "Date of possession/transfer"
  contractDate: string | null;           // ISO yyyy-mm-dd
  salePriceCents: number | null;
  conveyancer: {
    name: string | null;
    email: string | null;
    phone: string | null;
    reference: string | null;
  };
}

const MONTHS: Record<string, number> = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
  jan: 0, feb: 1, mar: 2, apr: 3, jun: 5, jul: 6, aug: 7, sep: 8,
  sept: 8, oct: 9, nov: 10, dec: 11,
};

function parseAusDate(input: string | null): string | null {
  if (!input) return null;
  // Accepts "04 May 2026", "4 May 2026", "13 May 1995"
  const m = input.trim().match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = MONTHS[m[2].toLowerCase()];
  const year = Number(m[3]);
  if (month === undefined || !Number.isFinite(day) || !Number.isFinite(year)) return null;
  const d = new Date(Date.UTC(year, month, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month || d.getUTCDate() !== day) return null;
  return d.toISOString().slice(0, 10);
}

function parsePriceCents(input: string | null): number | null {
  if (!input) return null;
  const cleaned = input.replace(/[$,\s]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

function emptyTransferee(): ParsedTransferee {
  return {
    kind: null, name: null, dateOfBirth: null, email: null, phone: null,
    addressAtTransfer: null, postalAddress: null, shareHolding: null, isLeadOwner: false,
  };
}

function takeSection(text: string, startLabel: RegExp, endLabel: RegExp): string | null {
  const start = text.search(startLabel);
  if (start < 0) return null;
  const after = text.slice(start);
  const endRel = after.slice(1).search(endLabel);
  if (endRel < 0) return after;
  return after.slice(0, endRel + 1);
}

function firstMatch(text: string, re: RegExp): string | null {
  const m = text.match(re);
  return m ? (m[1] ?? "").trim() || null : null;
}

function parseTransfereeBlock(block: string): ParsedTransferee {
  const out = emptyTransferee();

  const indiv = firstMatch(block, /Individual:\s*([^\n]+)/i);
  const org = firstMatch(block, /Organisation:\s*([^\n]+)/i);
  if (indiv) {
    out.kind = "individual";
    out.name = indiv;
  } else if (org) {
    out.kind = "organisation";
    out.name = org;
  }

  out.dateOfBirth = parseAusDate(firstMatch(block, /Date of Birth:\s*([^\n]+)/i));
  out.shareHolding = firstMatch(block, /Share Holding:\s*([^\n]+)/i);
  out.isLeadOwner = /Lead Owner:\s*Yes/i.test(block);

  // Same line: "Phone: 0421 448 689 \tEmail: foo@bar.com" — phone may be empty.
  // Non-greedy phone capture stops at the "Email:" label whether there's a tab,
  // multiple spaces, or just a single space between them.
  const phoneEmail = block.match(/Phone:\s*([^\n]*?)\s*(?:\t|\s)+Email:\s*([^\s\n]*)/i);
  if (phoneEmail) {
    const phone = phoneEmail[1].trim();
    const email = phoneEmail[2].trim();
    if (phone) out.phone = phone;
    if (email) out.email = email;
  } else {
    const phoneOnly = firstMatch(block, /Phone:\s*([^\n\t]+)/i);
    if (phoneOnly && !/Email:/i.test(phoneOnly)) out.phone = phoneOnly;
    out.email = firstMatch(block, /Email:\s*([^\s\n]+)/i);
  }

  // Two address fields: at-time-of-transfer and future correspondence.
  const addrAtTransfer = block.match(/Address at time of transfer:\s*([^\n]+)/i);
  if (addrAtTransfer) out.addressAtTransfer = addrAtTransfer[1].trim();
  const postal = block.match(/Address for future correspondence:\s*([^\n]+)/i);
  if (postal) out.postalAddress = postal[1].trim();

  return out;
}

export async function parseSettlementPdf(buffer: Buffer): Promise<ParsedSettlement> {
  const result = emptyResult();
  let text = "";
  try {
    text = await extractText(buffer);
  } catch (err) {
    // Corrupt or scanned PDF — return ok:false; callers surface a manual-fill prompt.
    console.error("parseSettlementPdf: pdfjs-dist failed:", err);
    result.rawText = "";
    return result;
  }

  result.rawText = text;
  if (!text.trim()) return result;

  // ─ Sections ────────────────────────────────────────────────
  const transferorBlock = takeSection(text, /Transferor\(s\):/i, /Transferee\(s\):/i) ?? "";
  const transfereeBlock = takeSection(text, /Transferee\(s\):/i, /Details of Title:/i) ?? "";
  const titleBlock = takeSection(text, /Details of Title:/i, /Details of Transaction:/i) ?? "";
  const transactionBlock = takeSection(text, /Details of Transaction:/i, /Certification:/i) ?? "";
  const certificationBlock = takeSection(text, /Certification:/i, /Subscriber Certifications:/i) ?? text.slice(text.search(/Certification:/i));

  // ─ Transferor ─────────────────────────────────────────────
  if (transferorBlock) {
    const indiv = firstMatch(transferorBlock, /Individual:\s*([^\n]+)/i);
    const org = firstMatch(transferorBlock, /Organisation:\s*([^\n]+)/i);
    if (indiv) result.transferor = { kind: "individual", name: indiv };
    else if (org) result.transferor = { kind: "organisation", name: org };
  }

  // ─ Transferees (one or many, all under the same heading) ───
  if (transfereeBlock) {
    // Split into per-transferee chunks at each Individual:/Organisation: header.
    const chunks: string[] = [];
    const headerRe = /(?:^|\n)(?:Individual|Organisation):/gi;
    const indices: number[] = [];
    let m: RegExpExecArray | null;
    while ((m = headerRe.exec(transfereeBlock))) indices.push(m.index);
    if (indices.length === 0) {
      chunks.push(transfereeBlock);
    } else {
      for (let i = 0; i < indices.length; i++) {
        const start = indices[i];
        const end = i + 1 < indices.length ? indices[i + 1] : transfereeBlock.length;
        chunks.push(transfereeBlock.slice(start, end));
      }
    }
    const parsed = chunks.map(parseTransfereeBlock).filter((t) => t.name);
    if (parsed.length > 0) {
      const lead = parsed.find((p) => p.isLeadOwner) ?? parsed[0];
      result.transferee = lead;
      result.additionalTransferees = parsed.filter((p) => p !== lead);
    }
  }

  // ─ Title ──────────────────────────────────────────────────
  if (titleBlock) {
    const lotPlan = titleBlock.match(/Lot\s+(\d+)\s+on\s+Plan\s+of\s+Subdivision\s+([A-Za-z0-9]+)/i);
    if (lotPlan) {
      result.lotNumber = Number(lotPlan[1]);
      result.planNumber = lotPlan[2];
    }
    const volFolio = titleBlock.match(/Volume\s+(\w+)\s+Folio\s+(\w+)/i);
    if (volFolio) {
      result.volume = volFolio[1];
      result.folio = volFolio[2];
    }
    result.propertyAddress = firstMatch(titleBlock, /Address of property:\s*([^\n]+)/i);
    result.municipality = firstMatch(titleBlock, /Municipality:\s*([^\n]+)/i);
    // Sale price sometimes appears here on its own line as "Sale Price:\n$615000.00".
    const inlinePrice = titleBlock.match(/Sale Price:\s*\$?([\d,.]+)/i);
    if (inlinePrice) result.salePriceCents = parsePriceCents(inlinePrice[1]);
  }

  // ─ Transaction ────────────────────────────────────────────
  if (transactionBlock) {
    const totalPrice = transactionBlock.match(/Total Sale Price[^:]*:\s*\$?([\d,.]+)/i);
    if (totalPrice) result.salePriceCents = parsePriceCents(totalPrice[1]);
    result.contractDate = parseAusDate(firstMatch(transactionBlock, /Date of Contract:\s*([^\n]+)/i));
    result.settlementDate = parseAusDate(firstMatch(transactionBlock, /Date of possession\/transfer:\s*([^\n]+)/i));
  }

  // ─ Conveyancer (transferee solicitor/agent) ───────────────
  if (certificationBlock) {
    result.conveyancer.name = firstMatch(certificationBlock, /Name:\s*([^\n]+)/i);
    const phoneEmail = certificationBlock.match(/Phone:\s*([^\n]*?)\s*(?:\t|\s)+Email:\s*([^\s\n]*)/i);
    if (phoneEmail) {
      result.conveyancer.phone = phoneEmail[1].trim() || null;
      result.conveyancer.email = phoneEmail[2].trim() || null;
    } else {
      result.conveyancer.phone = firstMatch(certificationBlock, /Phone:\s*([^\n\t]+)/i);
      result.conveyancer.email = firstMatch(certificationBlock, /Email:\s*([^\s\n]+)/i);
    }
    result.conveyancer.reference = firstMatch(certificationBlock, /Reference:\s*([^\n]+)/i);
  }

  result.ok = Boolean(
    result.transferee.name || result.lotNumber || result.settlementDate || result.salePriceCents,
  );
  return result;
}

async function extractText(buffer: Buffer): Promise<string> {
  // Legacy ESM build is the Node-compatible distribution. Lazy-imported so the
  // lot detail page (which pulls in this action module transitively) doesn't
  // load pdfjs at all — it's >2MB. pdfjs-dist is listed in
  // next.config.ts#serverExternalPackages so Turbopack leaves it as a plain
  // Node import and the worker file resolves correctly from node_modules.
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");

  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
    useWorkerFetch: false,
  });

  const doc = await loadingTask.promise;
  try {
    const pages: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      // Reassemble lines from positioned text items. pdfjs gives each glyph
      // run a position; items with hasEOL or significant Y-jumps end the line.
      let line = "";
      const lines: string[] = [];
      let lastY: number | null = null;
      for (const item of content.items) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const it = item as any;
        if (typeof it.str !== "string") continue;
        const y = it.transform?.[5];
        if (lastY !== null && y !== undefined && Math.abs(y - lastY) > 1) {
          if (line.length) lines.push(line);
          line = "";
        }
        line += it.str;
        if (it.hasEOL) {
          lines.push(line);
          line = "";
          lastY = null;
        } else if (y !== undefined) {
          lastY = y;
        }
      }
      if (line.length) lines.push(line);
      pages.push(lines.join("\n"));
      page.cleanup();
    }
    return pages.join("\n");
  } finally {
    await doc.destroy();
  }
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
