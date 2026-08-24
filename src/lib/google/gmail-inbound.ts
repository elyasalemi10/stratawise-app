import { createServerClient } from "@/lib/supabase";
import {
  getFullMessage,
  getMessageAttachment,
  listHistorySince,
} from "@/lib/google/gmail-client";
import { uploadObject } from "@/lib/storage/r2";
import { applyAutoLinkToCommLog } from "@/lib/email/auto-link";

// Inbound Gmail ingest, shared by the two things that can drive it:
//
//   - /api/webhooks/gmail-push , Pub/Sub push, arrives within seconds of
//     the message landing. The fast path.
//   - /api/cron/gmail-sweep , polls every watched mailbox on a schedule.
//     The safety net.
//
// The sweep exists because the push path has a silent failure mode: if the
// Pub/Sub subscription is missing, misconfigured, or its verification token
// does not match, the webhook is simply never called. Nothing errors, nothing
// is written, `last_error` stays null, and replies pile up in the mailbox
// unseen forever. That is exactly what had happened. Polling the same history
// cursor closes the gap and costs one API call per mailbox per run.
//
// Both drivers converge on syncMailboxHistory, so there is one implementation
// of "what does an inbound email become" and no chance of the two diverging.

export interface Subscription {
  id: string;
  management_company_id: string;
  manager_profile_id: string | null;
  history_id: string | null;
  mailbox_email: string;
}

interface FetchedMessageShape {
  id: string;
  threadId: string;
  from: string;
  to: string;
  subject: string;
  inReplyTo: string | null;
  text: string;
  html: string | null;
  receivedAt: string;
  attachments: Array<{
    attachmentId: string | null;
    filename: string;
    mimeType: string;
    size: number;
  }>;
}

// Cap per-attachment size at 25MB (Gmail's send cap is 25MB anyway, and
// our R2 bucket pricing is per-GB so keeping the ceiling sane keeps
// surprise costs out of inbound mail).
const MAX_INBOUND_ATTACHMENT_BYTES = 25 * 1024 * 1024;

async function ingestInboundMessage(
  supabase: ReturnType<typeof createServerClient>,
  sub: Subscription,
  msg: FetchedMessageShape,
): Promise<void> {
  // Skip outbound-loop: messages WE just sent show up in INBOX too because
  // Gmail mirrors sent items. The from-mailbox check filters them out so
  // we don't log our own sends a second time as "inbound replies".
  if (msg.from === sub.mailbox_email.toLowerCase()) return;

  const managerProfileId = sub.manager_profile_id;
  if (!managerProfileId) {
    console.warn(
      "gmail-inbound: subscription has no manager_profile_id; skipping ingest for",
      sub.mailbox_email,
    );
    return;
  }

  // Auto-match the outbound thread by In-Reply-To → outbound.external_id.
  // We also inherit (a) the lot owner snapshot and (b) the confidential
  // flag so the reply stays consistent with the original send , a reply
  // to a confidential email is still confidential, and pins to the same
  // owner so future owners can't read either side of the thread.
  let outboundOcId: string | null = null;
  let outboundLogId: string | null = null;
  let outboundLotId: string | null = null;
  let inheritedConfidential = false;
  let inheritedLotOwnerId: string | null = null;
  if (msg.inReplyTo) {
    const { data: outbound } = await supabase
      .from("communication_log")
      .select("id, oc_id, lot_id, confidential, lot_owner_id_at_creation")
      .eq("channel", "email")
      .eq("direction", "outbound")
      .eq("external_id", msg.inReplyTo)
      .maybeSingle();
    if (outbound) {
      outboundLogId = outbound.id as string;
      outboundOcId = (outbound.oc_id as string | null) ?? null;
      outboundLotId = (outbound.lot_id as string | null) ?? null;
      inheritedConfidential = !!(outbound as { confidential?: boolean }).confidential;
      inheritedLotOwnerId =
        ((outbound as { lot_owner_id_at_creation?: string | null }).lot_owner_id_at_creation) ?? null;
    }
  }

  // Idempotency: Pub/Sub can deliver a single message more than once.
  // We bail if an inbound row already exists for this Gmail message id.
  const { data: existing } = await supabase
    .from("communication_log")
    .select("id")
    .eq("channel", "email")
    .eq("direction", "inbound")
    .eq("external_id", msg.inReplyTo ?? msg.id)
    .eq("recipient_id", managerProfileId)
    .maybeSingle();
  if (existing) return;

  const { data: logRow } = await supabase
    .from("communication_log")
    .insert({
      oc_id: outboundOcId,
      lot_id: outboundLotId,
      recipient_id: managerProfileId,
      channel: "email",
      type: "manager_message_reply",
      direction: "inbound",
      recipient_email: sub.mailbox_email,
      subject: msg.subject || "(no subject)",
      body_preview: (msg.text || "").slice(0, 500),
      body_full: msg.text || null,
      status: "delivered",
      sent_at: msg.receivedAt,
      delivered_at: msg.receivedAt,
      related_entity_type: outboundLogId ? "communication_log" : null,
      related_entity_id: outboundLogId,
      external_id: msg.inReplyTo ?? msg.id,
      confidential: inheritedConfidential,
      lot_owner_id_at_creation: inheritedLotOwnerId,
    })
    .select("id")
    .single();

  if (!logRow) {
    console.error("gmail-inbound: failed to insert inbound row for", msg.id);
    return;
  }

  // Pull + persist attachments. Each one is its own Gmail API call so we
  // sequence them rather than parallelise (also keeps R2 upload load
  // predictable). Skip anything over 25MB to bound storage cost; the
  // user can still see it in Gmail via the deep link.
  const commLogId = (logRow as { id: string }).id;

  // Auto-link by sender email when the thread-match cascade above
  // returned no match. Single hit on the manager's portfolio → link
  // silently; the inbox UI looks the same as a manager-linked row. The
  // audit_log entry records it as auto_link_by_sender_email.
  if (!outboundOcId && msg.from) {
    try {
      await applyAutoLinkToCommLog(supabase, {
        communicationLogId: commLogId,
        senderEmail: msg.from,
        managerProfileId,
        sourceChannel: "gmail",
      });
    } catch (err) {
      console.warn("gmail-inbound: auto-link by sender failed (non-fatal)", err);
    }
  }
  console.log(
    `gmail-inbound: msg ${msg.id} carries ${msg.attachments.length} attachment(s)`,
  );
  for (const att of msg.attachments) {
    if (!att.attachmentId) continue;
    if (att.size > MAX_INBOUND_ATTACHMENT_BYTES) {
      console.warn(
        `gmail-inbound: skipping oversize attachment ${att.filename} (${att.size}b) on msg ${msg.id}`,
      );
      continue;
    }
    const fetched = await getMessageAttachment(
      sub.mailbox_email,
      msg.id,
      att.attachmentId,
    );
    if (!fetched.ok) {
      console.warn(
        `gmail-inbound: attachment fetch failed for ${att.filename}:`,
        fetched.error,
      );
      continue;
    }
    // Sanitise filename for the R2 key , strip path separators, keep
    // visible chars only. The original filename stays on the DB row.
    const safeName = att.filename.replace(/[/\\?%*:|"<>]/g, "_");
    const r2Key = `inbound-emails/${commLogId}/${safeName}`;
    try {
      const upload = await uploadObject(r2Key, fetched.bytes, att.mimeType);
      await supabase.from("inbound_email_attachments").insert({
        communication_log_id: commLogId,
        filename: att.filename,
        mime_type: att.mimeType,
        size_bytes: att.size,
        r2_key: r2Key,
        r2_url: upload.publicUrl,
      });
    } catch (err) {
      console.error(
        `gmail-inbound: R2 upload / row insert failed for ${att.filename}:`,
        err,
      );
    }
  }

  const { data: notif } = await supabase
    .from("notifications")
    .insert({
      profile_id: managerProfileId,
      oc_id: outboundOcId,
      type: "email_reply",
      // Use the raw subject as the notification title , only prepend "Re:"
      // when this inbound was actually matched to one of OUR outbound rows
      // via In-Reply-To. A first-time fresh email shouldn't show up as a
      // reply.
      title: msg.subject
        ? outboundLogId && !/^re:\s/i.test(msg.subject)
          ? `Re: ${msg.subject}`
          : msg.subject
        : `New message from ${msg.from}`,
      body: (msg.text || "").slice(0, 200),
      link: null,
      metadata: {
        communication_log_id: (logRow as { id: string }).id,
        sender_email: msg.from,
        // Provider + Gmail-internal ids so the inbox can show the Gmail
        // glyph (regardless of sender domain) and deep-link the
        // "Open in Gmail" action straight to the message instead of a
        // search query.
        provider: "gmail",
        gmail_message_id: msg.id,
        gmail_thread_id: msg.threadId,
      },
    })
    .select("id")
    .single();

  if (notif) {
    await supabase
      .from("notifications")
      .update({ link: `/inbox?n=${(notif as { id: string }).id}` })
      .eq("id", (notif as { id: string }).id);
  }
}


/**
 * Pull everything that landed in `mailbox` since its stored history cursor,
 * ingest each message, and advance the cursor.
 *
 * Safe to call concurrently with itself: ingestInboundMessage is idempotent
 * on the Gmail message id, so a push and a sweep racing over the same message
 * produce one row.
 */
export async function syncMailboxHistory(
  supabase: ReturnType<typeof createServerClient>,
  sub: Subscription,
  /** History id from the push payload, used only when the row has no cursor
   *  yet. The sweep has no such hint and passes null. */
  fallbackHistoryId: string | null = null,
): Promise<
  | { ok: true; processed: number; latestHistoryId: string }
  | { ok: false; error: string }
> {
  const startHistoryId = sub.history_id ?? fallbackHistoryId;
  if (!startHistoryId) {
    return { ok: false, error: "No history cursor for this mailbox" };
  }

  const diff = await listHistorySince(sub.mailbox_email, startHistoryId);
  if (!diff.ok) {
    // Persist the error onto the subscription so Settings → Email can
    // surface an actionable banner. Auth-shaped failures
    // (unauthorized_client / invalid_grant / 401 / 403) usually mean the
    // Workspace admin removed our DWD entry; the banner prompts a re-add.
    await supabase
      .from("gmail_mailbox_subscriptions")
      .update({
        last_error: diff.error.slice(0, 500),
        updated_at: new Date().toISOString(),
      })
      .eq("id", sub.id);
    return { ok: false, error: diff.error };
  }

  for (const messageId of diff.messageIds) {
    const fetched = await getFullMessage(sub.mailbox_email, messageId);
    if (!fetched.ok) {
      console.warn(
        "gmail-inbound: skip message",
        messageId,
        "for",
        sub.mailbox_email,
        ",",
        fetched.error,
      );
      continue;
    }
    await ingestInboundMessage(supabase, sub, fetched.message);
  }

  await supabase
    .from("gmail_mailbox_subscriptions")
    .update({
      history_id: diff.latestHistoryId,
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", sub.id);

  return {
    ok: true,
    processed: diff.messageIds.length,
    latestHistoryId: diff.latestHistoryId,
  };
}
