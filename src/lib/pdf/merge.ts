// ============================================================================
// PDF merge helper (PP7-A) — pdf-lib concatenation.
// ----------------------------------------------------------------------------
// Combines a final-notice cover page rendered via @react-pdf/renderer with
// the original levy notice PDF (also @react-pdf/renderer) into a single
// PDF document for email attachment. pdf-lib (installed at 1.17.1) handles
// the page concatenation across documents from different sources.
// ============================================================================

import { PDFDocument } from "pdf-lib";
import { renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";
import {
  FinalNoticeCover,
  type FinalNoticeCoverProps,
} from "@/lib/pdf/templates/final-notice-cover";

/**
 * Render the final-notice cover page to a Buffer.
 */
export async function renderFinalNoticeCoverPdf(
  props: FinalNoticeCoverProps,
): Promise<Buffer> {
  const element = createElement(FinalNoticeCover, props);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return await renderToBuffer(element as any);
}

/**
 * Merge two PDFs (cover page first, then trailing document) into one.
 *
 * Both inputs are PDF byte buffers. Output is a fresh PDFDocument with the
 * cover page first followed by all pages of `trailing`.
 */
export async function mergePdfs(
  cover: Buffer,
  trailing: Buffer,
): Promise<Buffer> {
  const out = await PDFDocument.create();

  const coverDoc = await PDFDocument.load(new Uint8Array(cover));
  const coverPages = await out.copyPages(coverDoc, coverDoc.getPageIndices());
  for (const p of coverPages) out.addPage(p);

  const trailingDoc = await PDFDocument.load(new Uint8Array(trailing));
  const trailingPages = await out.copyPages(
    trailingDoc,
    trailingDoc.getPageIndices(),
  );
  for (const p of trailingPages) out.addPage(p);

  const bytes = await out.save();
  return Buffer.from(bytes);
}
