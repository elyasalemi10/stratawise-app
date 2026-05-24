import "server-only";
import { DocumentProcessorServiceClient } from "@google-cloud/documentai";

// Google Document AI , OCR processor wrapper.
//
// Reuses the same service-account JSON we use for Gemini (GEMINI_API_KEY).
// Configure the processor ID + location separately:
//   GOOGLE_DOCUMENT_AI_PROCESSOR_ID , the OCR processor ID (the cheap general
//                                     "Document OCR" at ~$1.50 / 1000 pages)
//   GOOGLE_DOCUMENT_AI_LOCATION     , region the processor lives in
//                                     ("us" or "eu" are the supported
//                                      multi-region values; pick to match
//                                      the processor you created).
//
// We never fall back to a default processor , billing is bound to a specific
// processor ID, so callers fail loudly when it's missing rather than silently
// pointing at the wrong one.

type ServiceAccount = {
  type?: string;
  project_id?: string;
  client_email?: string;
  private_key?: string;
};

let _client: DocumentProcessorServiceClient | null = null;
let _processorName: string | null = null;

function loadConfig(): { client: DocumentProcessorServiceClient; processorName: string } {
  if (_client && _processorName) return { client: _client, processorName: _processorName };

  const raw = process.env.GEMINI_API_KEY;
  if (!raw) {
    console.error("documentAi: GEMINI_API_KEY not configured");
    throw new Error("OCR is temporarily unavailable.");
  }
  const trimmed = raw.trim();
  if (!trimmed.startsWith("{")) {
    console.error("documentAi: GEMINI_API_KEY must be a service-account JSON for Document AI");
    throw new Error("OCR is temporarily unavailable.");
  }
  let credentials: ServiceAccount;
  try {
    credentials = JSON.parse(trimmed) as ServiceAccount;
  } catch {
    console.error("documentAi: GEMINI_API_KEY is not valid JSON");
    throw new Error("OCR is temporarily unavailable.");
  }
  const processorId = process.env.GOOGLE_DOCUMENT_AI_PROCESSOR_ID?.trim();
  const location = process.env.GOOGLE_DOCUMENT_AI_LOCATION?.trim() || "us";
  if (!processorId || !credentials.project_id) {
    console.error("documentAi: missing GOOGLE_DOCUMENT_AI_PROCESSOR_ID or project_id");
    throw new Error("OCR is temporarily unavailable.");
  }

  _processorName = `projects/${credentials.project_id}/locations/${location}/processors/${processorId}`;
  _client = new DocumentProcessorServiceClient({
    credentials: {
      client_email: credentials.client_email,
      private_key: credentials.private_key,
    },
    projectId: credentials.project_id,
    apiEndpoint: `${location}-documentai.googleapis.com`,
  });
  return { client: _client, processorName: _processorName };
}

const CONTROL_CHAR_THRESHOLD = 0x20;
const NUL_CODE = 0x00;
const DEL_CODE = 0x7f;
const TAB_CODE = 0x09;
const LF_CODE = 0x0a;
const CR_CODE = 0x0d;

/**
 * Strip characters that break Postgres TEXT or to_tsvector:
 *   - NUL bytes , Postgres rejects them outright.
 *   - C0 control chars except tab / LF / CR , replaced with a space so word
 *     boundaries survive.
 *   - DEL (0x7f) , same treatment.
 * Then NFC-normalise so combining-character variants index consistently and
 * tidy trailing whitespace + runs of blank lines.
 *
 * Character-by-character filter avoids regex literals that build pipelines
 * occasionally mangle when the source contains control chars. Net cost is
 * one O(n) pass , fine for OCR output up to several MB.
 */
export function sanitiseOcrText(raw: string): string {
  let out = "";
  for (let i = 0; i < raw.length; i++) {
    const code = raw.charCodeAt(i);
    if (code === NUL_CODE) continue;
    if (
      (code < CONTROL_CHAR_THRESHOLD && code !== TAB_CODE && code !== LF_CODE && code !== CR_CODE) ||
      code === DEL_CODE
    ) {
      out += " ";
      continue;
    }
    out += raw[i];
  }
  return out
    .normalize("NFC")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export type OcrResult = {
  text: string;
  pageCount: number;
};

/**
 * Run Document AI OCR on a PDF (or image) buffer. Returns the full extracted
 * text already sanitised + a page count.
 *
 * Document AI's sync `processDocument` accepts up to ~30 pages; for bigger
 * docs you'd switch to `batchProcessDocuments` (async). The caller (the
 * Trigger.dev job) is responsible for the page-cap policy , see
 * docs/document-ai-ocr-plan.md.
 */
export async function runDocumentAiOcr(bytes: Buffer, mimeType: string): Promise<OcrResult> {
  const { client, processorName } = loadConfig();
  const [response] = await client.processDocument({
    name: processorName,
    rawDocument: {
      content: bytes,
      mimeType,
    },
  });
  const doc = response.document;
  if (!doc) {
    console.error("documentAi: empty document response");
    throw new Error("OCR returned no data.");
  }
  const text = sanitiseOcrText(doc.text ?? "");
  const pageCount = doc.pages?.length ?? 0;
  return { text, pageCount };
}
