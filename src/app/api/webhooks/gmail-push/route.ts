import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import {
  getFullMessage,
  listHistorySince,
} from "@/lib/google/gmail-client";

// Gmail Push notification webhook.
//
// Triggered by Google Cloud Pub/Sub. The push subscription is configured
// to POST here whenever the Pub/Sub topic (GMAIL_PUBSUB_TOPIC) gets a new
// message — which Gmail publishes every time a watched mailbox changes.
//
// Pub/Sub auth: we accept either
//   (a) `?token=<GMAIL_PUBSUB_VERIFY_TOKEN>` in the query string
//       (the simplest setup — configure the verification token on the
//       push subscription) — OR
//   (b) any of the standard Google-signed JWT headers if you opt to
//       configure OIDC auth on the subscription instead.
//
// Body shape (Google docs):
//   {
//     "message": {
//       "data": "<base64 of {emailAddress, historyId}>",
//       "messageId": "...",
//       "publishTime": "..."
//     },
//     "subscription": "projects/.../subscriptions/..."
//   }
//
// Per-message flow:
//   1. Decode the payload → mailbox email + new historyId.
//   2. Look up the gmail_mailbox_subscriptions row by mailbox_email.
//   3. listHistorySince(stored_history_id) → new message ids.
//   4. For each new id: getFullMessage → write inbound communication_log
//      row + auto-match by In-Reply-To header + drop a notification.
//   5. Persist the new historyId so the next push diffs from there.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface PubSubPushPayload {
  message?: {
    data?: string;
    messageId?: string;
    publishTime?: string;
  };
  subscription?: string;
}

interface GmailPushData {
  emailAddress?: string;
  historyId?: number | string;
}

function unauthorized(reason: string) {
  console.warn("gmail-push: rejected:", reason);
  return NextResponse.json({ error: reason }, { status: 401 });
}

export async function POST(request: NextRequest) {
  // Auth — shared-token mode. We compare the configured verify token to
  // the `?token=` query string. Empty / missing token means we treat
  // every push as unauthorised; configure the env var on the same row
  // you create the Pub/Sub push subscription with.
  const verifyToken = process.env.GMAIL_PUBSUB_VERIFY_TOKEN;
  if (!verifyToken) {
    return unauthorized("GMAIL_PUBSUB_VERIFY_TOKEN is not configured");
  }
  const incomingToken = request.nextUrl.searchParams.get("token") ?? "";
  if (incomingToken !== verifyToken) {
    return unauthorized("Invalid push token");
  }

  let envelope: PubSubPushPayload;
  try {
    envelope = (await request.json()) as PubSubPushPayload;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const dataB64 = envelope.message?.data;
  if (!dataB64) {
    // Pub/Sub sometimes sends empty acks during topic setup. Ack with 200.
    return NextResponse.json({ status: "noop" });
  }

  let pushData: GmailPushData;
  try {
    pushData = JSON.parse(
      Buffer.from(dataB64, "base64").toString("utf-8"),
    ) as GmailPushData;
  } catch (err) {
    console.error("gmail-push: failed to decode message.data", err);
    return NextResponse.json({ error: "bad_payload" }, { status: 400 });
  }

  const mailbox = pushData.emailAddress?.toLowerCase().trim();
  const incomingHistoryId = pushData.historyId
    ? String(pushData.historyId)
    : null;
  if (!mailbox || !incomingHistoryId) {
    return NextResponse.json({ status: "missing_fields" });
  }

  const supabase = createServerClient();

  const { data: subRow } = await supabase
    .from("gmail_mailbox_subscriptions")
    .select(
      "id, management_company_id, manager_profile_id, history_id, mailbox_email",
    )
    .eq("mailbox_email", mailbox)
    .maybeSingle();

  const sub = subRow as {
    id: string;
    management_company_id: string;
    manager_profile_id: string | null;
    history_id: string | null;
    mailbox_email: string;
  } | null;

  if (!sub) {
    console.warn("gmail-push: no subscription row for", mailbox);
    return NextResponse.json({ status: "no_subscription" });
  }

  const startHistoryId = sub.history_id ?? incomingHistoryId;

  const diff = await listHistorySince(mailbox, startHistoryId);
  if (!diff.ok) {
    console.error("gmail-push: history list failed for", mailbox, diff.error);
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
    return NextResponse.json({ status: "history_failed", error: diff.error });
  }

  for (const messageId of diff.messageIds) {
    const fetched = await getFullMessage(mailbox, messageId);
    if (!fetched.ok) {
      console.warn(
        "gmail-push: skip message",
        messageId,
        "for",
        mailbox,
        "—",
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

  return NextResponse.json({
    status: "ok",
    processed: diff.messageIds.length,
  });
}

interface Subscription {
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
}

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
      "gmail-push: subscription has no manager_profile_id; skipping ingest for",
      sub.mailbox_email,
    );
    return;
  }

  // Auto-match the outbound thread by In-Reply-To → outbound.external_id.
  let outboundOcId: string | null = null;
  let outboundLogId: string | null = null;
  let outboundLotId: string | null = null;
  if (msg.inReplyTo) {
    const { data: outbound } = await supabase
      .from("communication_log")
      .select("id, oc_id, lot_id")
      .eq("channel", "email")
      .eq("direction", "outbound")
      .eq("external_id", msg.inReplyTo)
      .maybeSingle();
    if (outbound) {
      outboundLogId = outbound.id as string;
      outboundOcId = (outbound.oc_id as string | null) ?? null;
      outboundLotId = (outbound.lot_id as string | null) ?? null;
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
    })
    .select("id")
    .single();

  if (!logRow) {
    console.error("gmail-push: failed to insert inbound row for", msg.id);
    return;
  }

  const { data: notif } = await supabase
    .from("notifications")
    .insert({
      profile_id: managerProfileId,
      oc_id: outboundOcId,
      type: "email_reply",
      title: msg.subject ? `Re: ${msg.subject}` : `Reply from ${msg.from}`,
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
