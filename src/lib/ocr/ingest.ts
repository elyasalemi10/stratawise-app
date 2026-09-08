import "server-only";
import { createServerClient } from "@/lib/supabase";
import { fetchObject } from "@/lib/storage/r2";
import { runDocumentAiOcr, sanitiseOcrText } from "@/lib/google/document-ai";
import { uploadObject } from "@/lib/storage/r2";
import { renderPdfFirstPage } from "@/lib/images/pdf-thumbnail";
import { isDownscalableImage, makeThumbnail } from "@/lib/images/downscale";
import {
  convertToPdf,
  isConversionConfigured,
  needsPdfConversion,
} from "./convert-to-pdf";

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
//
// Office files take one extra step first. Document AI does not accept a
// .docx or .pptx, so before this pipeline existed they were marked `skipped`
// and became invisible to search. They are rendered to PDF (see
// convert-to-pdf.ts), the PDF is kept in R2 for the viewer, and OCR then runs
// against the PDF exactly as it would for one the manager uploaded directly.

/** Files whose text IS the file. A .txt or .csv needs no OCR and no
 *  conversion: decoding the bytes is the whole job. They were accepted for
 *  upload and then marked `skipped`, so a manager could upload a bank export
 *  or a note and never find it by searching its contents. */
const PLAIN_TEXT_MIME_TYPES = new Set<string>(["text/plain", "text/csv"]);

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

/** Anything the pipeline can end up with searchable text for, by any route:
 *  read directly, rendered to PDF first, or sent to Document AI. This is
 *  what decides whether a row goes into the queue at all. */
export function isIndexable(mimeType: string | null | undefined): boolean {
  if (!mimeType) return false;
  const m = mimeType.toLowerCase();
  return PLAIN_TEXT_MIME_TYPES.has(m) || OCR_MIME_TYPES.has(m);
}

export async function ingestDocumentOcr(documentId: string): Promise<void> {
  const supabase = createServerClient();
  const { data: doc, error: fetchErr } = await supabase
    .from("documents")
    .select("id, file_path, file_name, mime_type, ocr_status, pdf_status, pdf_storage_key")
    .eq("id", documentId)
    .single();

  if (fetchErr || !doc) {
    console.error(`ingestDocumentOcr: document ${documentId} not found`, fetchErr);
    return;
  }
  if (doc.ocr_status === "complete") {
    return; // idempotent: already done
  }
  // A plain-text file is already readable. No conversion, no Document AI,
  // no page count, and no cost.
  if (PLAIN_TEXT_MIME_TYPES.has((doc.mime_type ?? "").toLowerCase())) {
    try {
      const bytes = await fetchObject(doc.file_path);
      await supabase
        .from("documents")
        .update({
          ocr_status: "complete",
          ocr_text: sanitiseOcrText(bytes.toString("utf8")),
          ocr_provider: "plain_text",
          ocr_completed_at: new Date().toISOString(),
          ocr_error: null,
          pdf_status: "skipped",
        })
        .eq("id", documentId);
    } catch (err) {
      console.error(`ingestDocumentOcr: plain-text read failed for ${documentId}`, err);
      const message = err instanceof Error ? err.message : String(err);
      await supabase
        .from("documents")
        .update({ ocr_status: "failed", ocr_error: message.slice(0, 240), pdf_status: "skipped" })
        .eq("id", documentId);
    }
    return;
  }

  // An Office file has to become a PDF before anything else can read it.
  // Everything downstream then works on `sourceKey` / `sourceMime`, which
  // for a converted document point at the rendition rather than the upload.
  let sourceKey = doc.file_path;
  let sourceMime = doc.mime_type;

  if (needsPdfConversion(doc.mime_type)) {
    const rendition = await renderToPdf(documentId, doc);
    if (!rendition) {
      // Conversion is off or it failed. renderToPdf has already recorded
      // why on the row; the document stays download-only rather than
      // sitting in `pending` forever.
      await supabase.from("documents").update({ ocr_status: "skipped" }).eq("id", documentId);
      return;
    }
    sourceKey = rendition;
    sourceMime = "application/pdf";
  } else if (!isOcrable(doc.mime_type)) {
    await supabase
      .from("documents")
      .update({ ocr_status: "skipped", pdf_status: "skipped" })
      .eq("id", documentId);
    return;
  } else {
    // Already readable as-is. Nothing to render, and saying so is different
    // from saying a conversion was never considered.
    await supabase.from("documents").update({ pdf_status: "skipped" }).eq("id", documentId);
  }

  await supabase
    .from("documents")
    .update({ ocr_status: "pending", ocr_started_at: new Date().toISOString(), ocr_error: null })
    .eq("id", documentId);

  let bytes: Buffer;
  try {
    bytes = await fetchObject(sourceKey);
  } catch (err) {
    console.error(`ingestDocumentOcr: R2 fetch failed for ${documentId}`, err);
    // Surface the real R2 error code (NoSuchKey, AccessDenied, missing
    // env var, etc.) instead of a generic message so the operator can
    // diagnose env-var skew between Vercel and Trigger.dev without
    // having to scrape logs.
    const errMsg = err instanceof Error ? err.message : String(err);
    await supabase
      .from("documents")
      .update({
        ocr_status: "failed",
        ocr_error: `Couldn't read the uploaded file from storage: ${errMsg.slice(0, 240)}`,
      })
      .eq("id", documentId);
    return;
  }

  try {
    const { text, pageCount } = await runDocumentAiOcr(bytes, sourceMime!);
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
    // Surface the real Document AI / loader error in ocr_error so env-var
    // skew between Vercel and Trigger.dev (e.g. missing GEMINI_API_KEY or
    // GOOGLE_DOCUMENT_AI_PROCESSOR_ID) shows up directly in the row
    // instead of behind a generic message.
    const friendly = message.includes("INVALID_ARGUMENT")
      ? "Document AI rejected this file (too large or unsupported)."
      : `OCR failed: ${message.slice(0, 240)}`;
    await supabase
      .from("documents")
      .update({
        ocr_status: "failed",
        ocr_error: friendly,
        ocr_completed_at: new Date().toISOString(),
      })
      .eq("id", documentId);
  }
}

/**
 * Render an Office document to PDF and store it in R2 beside the original.
 * Returns the rendition's storage key, or null if there isn't one, having
 * already written the reason to `pdf_status` / `pdf_error`.
 *
 * Never throws. A conversion that fails must not stop the upload from having
 * succeeded, and must not leave the row stuck in `pending`.
 */
async function renderToPdf(
  documentId: string,
  doc: { file_path: string; file_name: string; mime_type: string | null; pdf_storage_key: string | null; pdf_status: string },
): Promise<string | null> {
  const supabase = createServerClient();

  // Idempotent: a retry after an OCR failure must not pay for the render a
  // second time.
  if (doc.pdf_status === "complete" && doc.pdf_storage_key) return doc.pdf_storage_key;

  if (!isConversionConfigured()) {
    console.error(
      `renderToPdf: ${documentId} needs conversion but no conversion credentials are configured`,
    );
    await supabase
      .from("documents")
      .update({
        pdf_status: "failed",
        pdf_error: "Converting this file type isn't available on this deployment yet.",
      })
      .eq("id", documentId);
    return null;
  }

  await supabase
    .from("documents")
    .update({ pdf_status: "pending", pdf_error: null })
    .eq("id", documentId);

  try {
    const original = await fetchObject(doc.file_path);
    const pdf = await convertToPdf(original, doc.mime_type!, doc.file_name);

    // Sits next to the original under the same prefix, with a suffix rather
    // than a separate folder, so the two travel together when an OC's
    // documents are listed or cleaned up.
    const key = `${doc.file_path.replace(/\.[^./]+$/, "")}.converted.pdf`;
    await uploadObject(key, pdf, "application/pdf");

    // The card can show a real page now that one exists. An Office file has
    // no image of its own until this point, so this is the only chance to
    // make its thumbnail.
    let thumbnailKey: string | null = null;
    const pageOne = await renderPdfFirstPage(pdf);
    if (pageOne) {
      thumbnailKey = `${doc.file_path.replace(/\.[^./]+$/, "")}.thumb.webp`;
      await uploadObject(thumbnailKey, pageOne, "image/webp");
    }

    await supabase
      .from("documents")
      .update({
        pdf_status: "complete",
        pdf_storage_key: key,
        pdf_converted_at: new Date().toISOString(),
        pdf_error: null,
        ...(thumbnailKey ? { thumbnail_storage_key: thumbnailKey } : {}),
      })
      .eq("id", documentId);
    return key;
  } catch (err) {
    console.error(`renderToPdf: conversion failed for ${documentId}`, err);
    const message = err instanceof Error ? err.message : String(err);
    await supabase
      .from("documents")
      .update({
        pdf_status: "failed",
        pdf_error: message.slice(0, 240),
        pdf_converted_at: new Date().toISOString(),
      })
      .eq("id", documentId);
    return null;
  }
}

/**
 * Give a document a thumbnail if it is missing one.
 *
 * Documents uploaded before thumbnails existed show an extension plate
 * ("PDF", "PNG") in the grid instead of the page. Rather than a one-off
 * script, the sweep does this too, so the grid heals itself and a
 * conversion that produced a PDF after the fact also gets its page.
 *
 * Never throws. A file we cannot render keeps its plate, which is what it
 * has now.
 */
export async function backfillThumbnail(documentId: string): Promise<boolean> {
  const supabase = createServerClient();
  const { data: doc } = await supabase
    .from("documents")
    .select("id, file_path, mime_type, thumbnail_storage_key, pdf_storage_key")
    .eq("id", documentId)
    .maybeSingle();
  if (!doc || doc.thumbnail_storage_key) return false;

  const mime = (doc.mime_type ?? "").toLowerCase();
  // An Office file has no page of its own; its rendition does.
  const sourceKey = mime === "application/pdf" ? doc.file_path : (doc.pdf_storage_key ?? doc.file_path);
  const sourceIsPdf = mime === "application/pdf" || Boolean(doc.pdf_storage_key);
  if (!sourceIsPdf && !isDownscalableImage(mime)) return false;

  try {
    const bytes = await fetchObject(sourceKey);
    const thumb = sourceIsPdf
      ? await renderPdfFirstPage(bytes)
      : await makeThumbnail(bytes, mime);
    if (!thumb) return false;

    const key = `${doc.file_path.replace(/\.[^./]+$/, "")}.thumb.webp`;
    await uploadObject(key, thumb, "image/webp");
    await supabase
      .from("documents")
      .update({ thumbnail_storage_key: key })
      .eq("id", documentId);
    return true;
  } catch (err) {
    console.error(`backfillThumbnail: failed for ${documentId}`, err);
    return false;
  }
}
