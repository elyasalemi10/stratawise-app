// Server-only Textract wrapper. Synchronous AnalyzeDocument is limited to
// single-page documents (any size for images, 1 page for PDFs), so for
// multi-page PDFs we split via pdf-lib into one PDF per page and call Textract
// per page. Async StartDocumentAnalysis would avoid this but requires putting
// the file in real S3 (Textract can't read R2). The split-and-sync path is
// simpler and covers the realistic doc sizes we deal with (≤20 pages).
//
// Cost note: AnalyzeDocument with the FORMS feature is ~$50/1000 pages. We
// only call FORMS for the settlement flow; image-only OCR can use plain
// `DetectDocumentText` which is ~10× cheaper.

import {
  TextractClient,
  AnalyzeDocumentCommand,
  type Block,
} from "@aws-sdk/client-textract";

const REGION = process.env.AWS_REGION ?? "ap-southeast-2";

let _client: TextractClient | null = null;
function client(): TextractClient {
  if (!_client) {
    _client = new TextractClient({
      region: REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? "",
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? "",
      },
    });
  }
  return _client;
}

export interface OcrResult {
  /** Lower-cased, trimmed key → trimmed value. Multi-line values joined with " ". */
  keyValuePairs: Record<string, string>;
  /** All LINE blocks across all pages, in reading order. */
  lines: string[];
  /** Total Textract pages processed (≥ 1). */
  pageCount: number;
}

/**
 * Extract key-value pairs and lines from a document. Handles single-page PDFs,
 * multi-page PDFs (via per-page split), and images (PNG/JPEG/TIFF).
 */
export async function analyzeDocument(
  buffer: Buffer,
  mimeType: string,
): Promise<OcrResult> {
  if (mimeType === "application/pdf") {
    return analyzePdfPages(buffer);
  }
  // Image — Textract handles PNG/JPEG/TIFF directly.
  return analyzeSinglePage(buffer);
}

async function analyzeSinglePage(bytes: Buffer): Promise<OcrResult> {
  const out = await client().send(
    new AnalyzeDocumentCommand({
      Document: { Bytes: new Uint8Array(bytes) },
      FeatureTypes: ["FORMS"],
    }),
  );
  return collectFromBlocks(out.Blocks ?? [], 1);
}

async function analyzePdfPages(buffer: Buffer): Promise<OcrResult> {
  const { PDFDocument } = await import("pdf-lib");

  // Open the source PDF and report page count. If single-page, skip the
  // splitting overhead — feed the bytes directly to Textract.
  const src = await PDFDocument.load(new Uint8Array(buffer), {
    updateMetadata: false,
    ignoreEncryption: true,
  });
  const pageCount = src.getPageCount();
  if (pageCount === 0) {
    return { keyValuePairs: {}, lines: [], pageCount: 0 };
  }
  if (pageCount === 1) {
    return analyzeSinglePage(buffer);
  }

  // Multi-page: copy each page into its own one-page document, then send each.
  const aggregated: OcrResult = { keyValuePairs: {}, lines: [], pageCount };
  for (let i = 0; i < pageCount; i++) {
    const single = await PDFDocument.create();
    const [copied] = await single.copyPages(src, [i]);
    single.addPage(copied);
    const pageBytes = Buffer.from(await single.save({ useObjectStreams: false }));
    const partial = await analyzeSinglePage(pageBytes);
    // Merge KV pairs (later pages don't overwrite earlier — most form fields
    // appear once and the lead page wins).
    for (const [k, v] of Object.entries(partial.keyValuePairs)) {
      if (!aggregated.keyValuePairs[k]) aggregated.keyValuePairs[k] = v;
    }
    aggregated.lines.push(...partial.lines);
  }
  return aggregated;
}

// ─── Block reassembly ─────────────────────────────────────────────

function collectFromBlocks(blocks: Block[], pageCount: number): OcrResult {
  // Index blocks by Id for lookup; KEY_VALUE_SETs reference their children
  // (the WORD blocks that make up the key/value text) and a VALUE block via
  // a Relationships entry of Type=VALUE.
  const byId = new Map<string, Block>();
  for (const b of blocks) if (b.Id) byId.set(b.Id, b);

  const lines = blocks
    .filter((b) => b.BlockType === "LINE")
    .map((b) => b.Text ?? "")
    .filter((s) => s.length > 0);

  const keyValuePairs: Record<string, string> = {};
  for (const b of blocks) {
    if (b.BlockType !== "KEY_VALUE_SET") continue;
    if (!b.EntityTypes?.includes("KEY")) continue;
    const keyText = collectChildText(b, byId);
    if (!keyText) continue;
    const valueRel = b.Relationships?.find((r) => r.Type === "VALUE");
    if (!valueRel?.Ids) continue;
    const valueText = valueRel.Ids
      .map((id) => byId.get(id))
      .filter((v): v is Block => Boolean(v))
      .map((v) => collectChildText(v, byId))
      .filter((s) => s.length > 0)
      .join(" ");
    if (!valueText) continue;
    const normKey = keyText.toLowerCase().replace(/\s+/g, " ").trim().replace(/:$/, "").trim();
    if (!keyValuePairs[normKey]) keyValuePairs[normKey] = valueText.trim();
  }

  return { keyValuePairs, lines, pageCount };
}

function collectChildText(block: Block, byId: Map<string, Block>): string {
  const childRel = block.Relationships?.find((r) => r.Type === "CHILD");
  if (!childRel?.Ids) return "";
  const parts: string[] = [];
  for (const id of childRel.Ids) {
    const child = byId.get(id);
    if (!child) continue;
    if (child.BlockType === "WORD" && child.Text) parts.push(child.Text);
    else if (child.BlockType === "SELECTION_ELEMENT" && child.SelectionStatus === "SELECTED") {
      parts.push("☑");
    }
  }
  return parts.join(" ").trim();
}
