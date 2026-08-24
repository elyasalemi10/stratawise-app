import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { syncMailboxHistory, type Subscription } from "@/lib/google/gmail-inbound";

// Gmail Push notification webhook.
//
// Triggered by Google Cloud Pub/Sub. The push subscription is configured
// to POST here whenever the Pub/Sub topic (GMAIL_PUBSUB_TOPIC) gets a new
// message , which Gmail publishes every time a watched mailbox changes.
//
// Pub/Sub auth: the push subscription must carry
// `?token=<GMAIL_PUBSUB_VERIFY_TOKEN>` in its endpoint URL. Anything else
// is rejected.
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
// This is the LOW-LATENCY path only. If the Pub/Sub subscription is missing
// or its token does not match, this route is simply never called and nothing
// anywhere reports a problem, so /api/cron/gmail-sweep polls the same
// mailboxes as a safety net. Both call syncMailboxHistory, which is
// idempotent, so the two racing over one message produce one row.

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
  const incomingHistoryId = pushData.historyId ? String(pushData.historyId) : null;
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

  const sub = subRow as Subscription | null;
  if (!sub) {
    console.warn("gmail-push: no subscription row for", mailbox);
    return NextResponse.json({ status: "no_subscription" });
  }

  const result = await syncMailboxHistory(supabase, sub, incomingHistoryId);
  if (!result.ok) {
    console.error("gmail-push: history sync failed for", mailbox, result.error);
    return NextResponse.json({ status: "history_failed", error: result.error });
  }

  return NextResponse.json({ status: "ok", processed: result.processed });
}
