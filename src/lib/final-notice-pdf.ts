import { renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";
import { FinalNotice } from "@/lib/pdf/templates/final-notice";
import type { FinalNoticeProps } from "@/lib/pdf/types";
import { uploadObject } from "@/lib/storage/r2";

// Render the s.32 final fee notice and upload to R2 (confidential). Returns the
// object KEY (stored on escalation_instances.final_notice_pdf_url). Reused by
// the VCAT pack (s.32 document).
export async function generateAndUploadFinalNotice(
  props: FinalNoticeProps,
  ocId: string,
  referenceNumber: string,
): Promise<string> {
  const element = createElement(FinalNotice, props);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buffer = await renderToBuffer(element as any);
  const safeRef = referenceNumber.replace(/[^a-zA-Z0-9_-]/g, "_");
  const key = `levies/${ocId}/final-notices/${safeRef}.pdf`;
  await uploadObject(key, buffer, "application/pdf");
  return key;
}
