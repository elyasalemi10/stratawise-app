import { renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";
import { LevyNotice } from "@/lib/pdf/templates/levy-notice";
import type { LevyNoticeProps } from "@/lib/pdf/types";
import { uploadObject } from "@/lib/storage/r2";

/**
 * Generate a levy notice PDF, upload to R2, return the public URL.
 *
 * Caller is responsible for persisting the URL to levy_notices.pdf_url +
 * stamping pdf_generated_at. Use renderLevyNoticePdf in src/lib/pdf/render.ts
 * for the idempotent wrapper.
 */
export async function generateAndUploadLevyPDF(
  props: LevyNoticeProps,
  ocId: string,
  referenceNumber: string,
): Promise<string> {
  const element = createElement(LevyNotice, props);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buffer = await renderToBuffer(element as any);

  const key = `levies/${ocId}/${referenceNumber}.pdf`;
  const { publicUrl } = await uploadObject(key, buffer, "application/pdf");
  return publicUrl;
}

/**
 * Generate a levy notice PDF buffer (for email attachment, no R2 upload).
 */
export async function generateLevyPDFBuffer(props: LevyNoticeProps): Promise<Buffer> {
  const element = createElement(LevyNotice, props);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return await renderToBuffer(element as any);
}
