import { NextRequest, NextResponse } from "next/server";
import { Webhook } from "svix";
import { createServerClient } from "@/lib/supabase";

// Inbound email webhook for owner replies to manager-sent mail.
//
// External setup required to make this fire:
//   1. DNS — point MX records for the brand domain (RESEND_SUFFIX, e.g.
//      stratawise.com.au) at Resend's inbound service. See
//      https://resend.com/docs/inbound for the current MX values.
//   2. Resend dashboard — under "Webhooks", create a webhook with the
//      endpoint URL `{APP_URL}/api/webhooks/resend-inbound`, subscribed to
//      the "email.received" event. Copy the webhook signing secret
//      (starts with `whsec_`).
//   3. App env — set `RESEND_INBOUND_WEBHOOK_SECRET` to the `whsec_` value
//      from the dashboard. Resend signs every inbound webhook with the
//      Standard Webhooks format (Svix); we verify the signature using
//      that secret, NOT a bearer token.
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

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface InboundPayload {
  type?: string;
  data?: {
    from?: { email?: string; name?: string } | string;
    to?: Array<{ email?: string; name?: string }> | string[];
    // Resend may surface the destination address on different fields
    // depending on the event shape. We probe `to[]` first, then `email`,
    // then `headers.to`.
    email?: string;
    subject?: string;
    text?: string;
    html?: string;
    headers?: Record<string, string>;
    in_reply_to?: string;
  };
}

function pickRecipientEmail(payload: InboundPayload): string | null {
  const d = payload.data ?? {};
  if (Array.isArray(d.to)) {
    const first = d.to[0];
    if (typeof first === "string") return first.toLowerCase().trim() || null;
    return (first?.email ?? "").toLowerCase().trim() || null;
  }
  if (typeof d.email === "string") return d.email.toLowerCase().trim() || null;
  const headerTo = d.headers?.to;
  if (typeof headerTo === "string") {
    // Strip any "Name <addr>" wrapper.
    const m = headerTo.match(/<([^>]+)>/);
    return (m ? m[1] : headerTo).toLowerCase().trim() || null;
  }
  return null;
}

function pickSenderEmail(payload: InboundPayload): string | null {
  const d = payload.data ?? {};
  if (!d.from) {
    const fromHeader = d.headers?.from;
    if (typeof fromHeader === "string") {
      const m = fromHeader.match(/<([^>]+)>/);
      return (m ? m[1] : fromHeader).toLowerCase().trim() || null;
    }
    return null;
  }
  if (typeof d.from === "string") return d.from.toLowerCase().trim() || null;
  return (d.from.email ?? "").toLowerCase().trim() || null;
}

export async function POST(request: NextRequest) {
  const secret = process.env.RESEND_INBOUND_WEBHOOK_SECRET;
  if (!secret) {
    console.error(
      "resend-inbound: RESEND_INBOUND_WEBHOOK_SECRET is not set; cannot verify signatures",
    );
    return NextResponse.json({ error: "unconfigured" }, { status: 503 });
  }

  const svixId = request.headers.get("svix-id");
  const svixTimestamp = request.headers.get("svix-timestamp");
  const svixSignature = request.headers.get("svix-signature");
  if (!svixId || !svixTimestamp || !svixSignature) {
    console.warn("resend-inbound: missing svix-* headers; rejecting");
    return NextResponse.json({ error: "missing_signature" }, { status: 401 });
  }

  // svix.Webhook.verify requires the RAW body — calling request.json()
  // first would consume the stream and break HMAC.
  const rawBody = await request.text();

  let payload: InboundPayload;
  try {
    const wh = new Webhook(secret);
    payload = wh.verify(rawBody, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as InboundPayload;
  } catch (err) {
    console.error("resend-inbound: signature verification failed", err);
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  // Resend's only inbound-relevant event today is "email.received". Anything
  // else (delivery callbacks etc.) is accepted but ignored.
  if (payload.type && payload.type !== "email.received") {
    return NextResponse.json({ status: "ignored", type: payload.type });
  }

  const recipient = pickRecipientEmail(payload);
  const sender = pickSenderEmail(payload);
  if (!recipient || !sender) {
    console.warn("resend-inbound: missing addresses", { recipient, sender });
    return NextResponse.json({ status: "missing_addresses" });
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
    console.warn(
      `resend-inbound: no manager found for recipient ${recipient}`,
    );
    return NextResponse.json({ status: "no_manager" });
  }

  const d = payload.data ?? {};
  const subject = (d.subject ?? "").trim();
  const body = d.text ?? stripHtml(d.html ?? "");
  const inReplyToHeader = d.in_reply_to ?? d.headers?.["in-reply-to"] ?? null;

  // Try to find the outbound email this is a reply to.
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
// preview snippet; the original HTML stays in payload.data.html for later.
function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
