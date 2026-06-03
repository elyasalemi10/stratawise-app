import { renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";
import { MeetingNotice } from "@/lib/pdf/templates/meeting-notice";
import type { MeetingNoticeProps } from "@/lib/pdf/types";
import { uploadObject } from "@/lib/storage/r2";

/**
 * Render a meeting-notice PDF and upload it to R2 (confidential bucket).
 * Returns the object KEY (stored on meetings.notice_pdf_url) , the bulk-email
 * task fetches it back via fetchObject to attach to each owner's email.
 */
export async function generateAndUploadMeetingNotice(
  props: MeetingNoticeProps,
  ocId: string,
  referenceNumber: string,
): Promise<string> {
  const element = createElement(MeetingNotice, props);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buffer = await renderToBuffer(element as any);
  const safeRef = referenceNumber.replace(/[^a-zA-Z0-9_-]/g, "_");
  const key = `meetings/${ocId}/${safeRef}.pdf`;
  await uploadObject(key, buffer, "application/pdf");
  return key;
}

/** Render a meeting-notice PDF to a buffer (for preview, no upload). */
export async function generateMeetingNoticeBuffer(props: MeetingNoticeProps): Promise<Buffer> {
  const element = createElement(MeetingNotice, props);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return await renderToBuffer(element as any);
}
