import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

// Inbound email webhook for owner replies to manager-sent mail.
//
// External setup required to make this fire:
//   1. DNS — point MX records for the brand domain (RESEND_SUFFIX, e.g.
//      stratawise.com.au) at Resend's inbound service (or set up a separate
//      inbound parser via SES/Mailgun and have it POST here in the same
//      shape). See https://resend.com/docs/inbound for the current MX
//      values + verification token.
//   2. Resend dashboard — under "Inbound", create a forwarding rule for the
//      domain and set the webhook destination to:
//        POST {APP_URL}/api/webhooks/resend-inbound
//      Set the secret env var `RESEND_INBOUND_SECRET` to a random token and
//      configure Resend to send it as the `Authorization: Bearer <secret>`
//      header.
//
// What this handler does on every accepted inbound:
//   - parses the recipient address (e.g. "manager.username@stratawise.com.au")
//     to identify which manager the owner replied to
//   - looks up the original OUTBOUND communication_log row that triggered the
//     reply (best-effort match on sender + recipient + subject)
//   - inserts an INBOUND communication_log row so the conversation thread is
//     visible alongside the outbound on the lot detail page
//   - inserts a notification for that manager so the reply lands in their
//     in-app inbox
//
// Notes:
//   - Authorisation is via a shared-secret bearer token. Resend does not
//     sign inbound payloads the same way it signs outbound delivery events,
//     so the shared secret is what authenticates the call.
//   - Email envelopes do NOT carry a reliable "in-reply-to" linking us back
//     to a specific outbound id, so we match by (recipient, subject) within
//     the last 30 days. The header `In-Reply-To` is captured when present
//     and stored on metadata for richer threading later.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface InboundPayload {
  from?: { email?: string; name?: string } | string;
  to?: Array<{ email?: string; name?: string }> | string[];
  subject?: string;
  text?: string;
  html?: string;
  headers?: Record<string, string>;
  // Resend / SES inbound formats vary; pull what we need with defensive
  // typing so we never throw on a shape we don't recognise.
}

function pickRecipientEmail(payload: InboundPayload): string | null {
  if (!payload.to) return null;
  if (Array.isArray(payload.to)) {
    const first = payload.to[0];
    if (typeof first === "string") return first.toLowerCase().trim();
    return (first?.email ?? "").toLowerCase().trim() || null;
  }
  return null;
}

function pickSenderEmail(payload: InboundPayload): string | null {
  if (!payload.from) return null;
  if (typeof payload.from === "string") return payload.from.toLowerCase().trim();
  return (payload.from.email ?? "").toLowerCase().trim() || null;
}

export async function POST(request: NextRequest) {
  const expectedAuth = process.env.RESEND_INBOUND_SECRET;
  if (!expectedAuth) {
    console.error("resend-inbound: RESEND_INBOUND_SECRET is not configured");
    return NextResponse.json({ error: "unconfigured" }, { status: 503 });
  }

  const authHeader = request.headers.get("authorization") ?? "";
  if (authHeader !== `Bearer ${expectedAuth}`) {
    return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  }

  let payload: InboundPayload;
  try {
    payload = (await request.json()) as InboundPayload;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const recipient = pickRecipientEmail(payload);
  const sender = pickSenderEmail(payload);
  if (!recipient || !sender) {
    return NextResponse.json({ error: "missing_addresses" }, { status: 400 });
  }

  const supabase = createServerClient();

  // Recipient lookup: "<email_username>@<brand-domain>" → manager profile.
  // Falls back to scanning profile_username_aliases so legacy usernames keep
  // working after a manager renames themselves.
  const usernamePart = recipient.split("@")[0]?.toLowerCase() ?? "";
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, management_company_id")
    .ilike("email_username", usernamePart)
    .maybeSingle();

  let managerProfileId: string | null =
    (profile as { id: string } | null)?.id ?? null;

  if (!managerProfileId) {
    const { data: alias } = await supabase
      .from("profile_username_aliases")
      .select("profile_id")
      .ilike("username", usernamePart)
      .is("retired_at", null)
      .maybeSingle();
    managerProfileId =
      (alias as { profile_id: string } | null)?.profile_id ?? null;
  }

  if (!managerProfileId) {
    // Unknown recipient — log and bail with 200 so the inbound service
    // doesn't endlessly retry. The owner's email is dropped.
    console.warn(
      `resend-inbound: no manager found for recipient ${recipient}`,
    );
    return NextResponse.json({ status: "no_manager" });
  }

  const subject = (payload.subject ?? "").trim();
  const body = payload.text ?? stripHtml(payload.html ?? "");
  const inReplyToHeader = payload.headers?.["in-reply-to"] ?? null;

  // Try to find the outbound email this is a reply to. Best-effort —
  // recipient on the OUTBOUND row equals the inbound SENDER, plus a
  // subject match (stripping the leading "Re:"). 30-day window keeps the
  // query cheap.
  const sinceIso = new Date(
    Date.now() - 30 * 24 * 60 * 60 * 1000,
  ).toISOString();
  const normalisedSubject = subject.replace(/^\s*(re|fw|fwd):\s*/i, "");
  let outboundOcId: string | null = null;
  let outboundLogId: string | null = null;
  let outboundLotId: string | null = null;
  if (normalisedSubject) {
    const { data: outbound } = await supabase
      .from("communication_log")
      .select("id, oc_id, lot_id, subject")
      .eq("sender_profile_id", managerProfileId)
      .eq("channel", "email")
      .eq("direction", "outbound")
      .eq("recipient_email", sender)
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .limit(20);
    const match = (outbound ?? []).find((row) => {
      const s = String(row.subject ?? "").replace(/^\s*(re|fw|fwd):\s*/i, "");
      return s.toLowerCase() === normalisedSubject.toLowerCase();
    });
    if (match) {
      outboundLogId = match.id as string;
      outboundOcId = (match.oc_id as string | null) ?? null;
      outboundLotId = (match.lot_id as string | null) ?? null;
    }
  }

  // Log the inbound communication row. direction='inbound' is the marker.
  const { data: logRow, error: logErr } = await supabase
    .from("communication_log")
    .insert({
      oc_id: outboundOcId,
      lot_id: outboundLotId,
      recipient_id: managerProfileId,
      channel: "email",
      type: "manager_message_reply",
      direction: "inbound",
      recipient_email: recipient,
      subject: subject || "(no subject)",
      body_preview: (body || "").slice(0, 500),
      body_full: body || null,
      status: "delivered",
      sent_at: new Date().toISOString(),
      delivered_at: new Date().toISOString(),
      related_entity_type: outboundLogId ? "communication_log" : null,
      related_entity_id: outboundLogId,
      external_id: inReplyToHeader,
    })
    .select("id")
    .single();

  if (logErr || !logRow) {
    console.error("resend-inbound: communication_log insert failed", logErr);
    return NextResponse.json({ error: "log_insert_failed" }, { status: 500 });
  }

  // Drop a notification in the manager's in-app inbox.
  await supabase.from("notifications").insert({
    profile_id: managerProfileId,
    oc_id: outboundOcId,
    type: "email_reply",
    title: `Reply from ${sender}`,
    body: subject
      ? `Re: ${subject}`
      : (body || "").slice(0, 140),
    link:
      outboundOcId && outboundLotId
        ? `/ocs/${outboundOcId}/lots/${outboundLotId}?tab=communications`
        : "/inbox",
  });

  return NextResponse.json({ status: "logged", id: logRow.id });
}

// Cheap HTML-strip for clients that send html-only inbound. Strips tags,
// collapses runs of whitespace. Not bullet-proof but good enough for a
// preview snippet; the original HTML stays in payload.html for later.
function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
