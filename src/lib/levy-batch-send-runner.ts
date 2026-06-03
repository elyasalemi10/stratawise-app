// Framework-agnostic runner for the background levy-batch send. Safe to call
// from a Trigger.dev task. Fetches the manager's extra attachments back from
// R2 (passed as keys, not bytes, through the queue) and delegates to the
// existing send/resend actions with a system performer id so they skip the
// Clerk auth check.

import { fetchObject } from "@/lib/storage/r2";
import { sendBatchEmailsCustom, resendBatchEmailsCustom } from "@/lib/actions/levy";

export interface LevyBatchSendPayload {
  ocId: string;
  batchId: string;
  mode: "send" | "resend";
  emailOverrides?: Record<string, string>;
  attachmentKeys?: Array<{ key: string; filename: string; contentType: string }>;
  fromAddress?: string | null;
  performerId: string;
}

export async function runLevyBatchSend(p: LevyBatchSendPayload): Promise<{ sentCount?: number; error?: string }> {
  const extraAttachments: Array<{ filename: string; contentBase64: string; contentType: string }> = [];
  for (const a of p.attachmentKeys ?? []) {
    try {
      const buf = await fetchObject(a.key);
      extraAttachments.push({ filename: a.filename, contentBase64: buf.toString("base64"), contentType: a.contentType });
    } catch (err) {
      console.error("runLevyBatchSend: could not fetch attachment", a.key, err);
    }
  }

  const options = {
    emailOverrides: p.emailOverrides,
    extraAttachments,
    fromAddress: p.fromAddress ?? undefined,
    _systemPerformerId: p.performerId,
  };

  return p.mode === "resend"
    ? await resendBatchEmailsCustom(p.ocId, p.batchId, options)
    : await sendBatchEmailsCustom(p.ocId, p.batchId, options);
}
