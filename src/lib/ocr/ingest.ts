import "server-only";
import { createServerClient } from "@/lib/supabase";
import { fetchObject } from "@/lib/storage/r2";
import { runDocumentAiOcr } from "@/lib/google/document-ai";

// Document OCR pipeline.
//
// Called from the upload route's `after()` (Next.js 15 post-response hook) so
// it doesn't block the manager's upload. Pulls the file bytes from R2, runs
// Document AI OCR, sanitises, and stores `ocr_text` on the document row.
// Status transitions are linear:
//   pending → complete  (happy path)
//   pending → failed    (any error along the way , message goes to ocr_error)
//   pending → skipped   (mime type isn't OCR-able)
//
// The function never throws , failures land on the row as `failed`. The
// upload still succeeds even if OCR breaks.

const OCR_MIME_TYPES = new Set<string>([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/tiff",
  "image/gif",
  "image/webp",
]);

// Document AI sync endpoint accepts up to 30 pages for "Document OCR".
// Page count comes back AFTER the call, so we can't pre-check; instead the
// processDocument call will error with INVALID_ARGUMENT for oversize PDFs,
// which we trap and mark `failed` with a useful error.
const MAX_OCR_PAGES = 30;

export function isOcrable(mimeType: string | null | undefined): boolean {
  if (!mimeType) return false;
  return OCR_MIME_TYPES.has(mimeType.toLowerCase());
}

export async function ingestDocumentOcr(documentId: string): Promise<void> {
  const supabase = createServerClient();
  const { data: doc, error: fetchErr } = await supabase
    .from("documents")
    .select("id, file_path, mime_type, ocr_status")
    .eq("id", documentId)
    .single();

  if (fetchErr || !doc) {
    console.error(`ingestDocumentOcr: document ${documentId} not found`, fetchErr);
    return;
  }
  if (doc.ocr_status === "complete") {
    return; // idempotent: already done
  }
  if (!isOcrable(doc.mime_type)) {
    await supabase.from("documents").update({ ocr_status: "skipped" }).eq("id", documentId);
    return;
  }

  await supabase
    .from("documents")
    .update({ ocr_status: "pending", ocr_started_at: new Date().toISOString(), ocr_error: null })
    .eq("id", documentId);

  let bytes: Buffer;
  try {
    bytes = await fetchObject(doc.file_path);
  } catch (err) {
    console.error(`ingestDocumentOcr: R2 fetch failed for ${documentId}`, err);
    await supabase
      .from("documents")
      .update({ ocr_status: "failed", ocr_error: "Couldn't read the uploaded file from storage." })
      .eq("id", documentId);
    return;
  }

  try {
    const { text, pageCount } = await runDocumentAiOcr(bytes, doc.mime_type!);
    if (pageCount > MAX_OCR_PAGES) {
      await supabase
        .from("documents")
        .update({
          ocr_status: "failed",
          ocr_error: `Document is ${pageCount} pages , auto-OCR is capped at ${MAX_OCR_PAGES}. Indexed by filename only.`,
          ocr_page_count: pageCount,
          ocr_provider: "document_ai",
          ocr_completed_at: new Date().toISOString(),
        })
        .eq("id", documentId);
      return;
    }
    await supabase
      .from("documents")
      .update({
        ocr_status: "complete",
        ocr_text: text,
        ocr_page_count: pageCount,
        ocr_provider: "document_ai",
        ocr_completed_at: new Date().toISOString(),
        ocr_error: null,
      })
      .eq("id", documentId);
  } catch (err) {
    console.error(`ingestDocumentOcr: Document AI failed for ${documentId}`, err);
    const message = err instanceof Error ? err.message : String(err);
    // Surface a generic message on the row; the real reason goes to logs.
    await supabase
      .from("documents")
      .update({
        ocr_status: "failed",
        ocr_error: message.includes("INVALID_ARGUMENT")
          ? "Document AI rejected this file (too large or unsupported)."
          : "OCR failed , the file is indexed by filename only.",
        ocr_completed_at: new Date().toISOString(),
      })
      .eq("id", documentId);
  }
}
