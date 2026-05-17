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

function pickAllRecipientEmails(payload: InboundPayload): string[] {
  const d = payload.data ?? {};
  const out: string[] = [];

  if (Array.isArray(d.to)) {
    for (const entry of d.to) {
      if (typeof entry === "string") {
        const clean = entry.toLowerCase().trim();
        if (clean) out.push(clean);
      } else if (entry?.email) {
        const clean = entry.email.toLowerCase().trim();
        if (clean) out.push(clean);
      }
    }
  }
  if (typeof d.email === "string") {
    const clean = d.email.toLowerCase().trim();
    if (clean) out.push(clean);
  }
  const headerTo = d.headers?.to;
  if (typeof headerTo === "string") {
    // Split multi-address To header ("a@x.com, b@x.com") and strip any
    // "Name <addr>" wrappers.
    for (const part of headerTo.split(",")) {
      const m = part.match(/<([^>]+)>/);
      const clean = (m ? m[1] : part).toLowerCase().trim();
      if (clean) out.push(clean);
    }
  }
  return Array.from(new Set(out));
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

  // Resend may push the same email to several `to[]` entries (cc/bcc folding
  // depending on the inbound rule). We try every recipient address until one
  // resolves to a known manager — the first match wins.
  const recipients = pickAllRecipientEmails(payload);
  const sender = pickSenderEmail(payload);
  if (recipients.length === 0 || !sender) {
    console.warn("resend-inbound: missing addresses", {
      recipients,
      sender,
      rawTo: payload.data?.to,
      rawHeadersTo: payload.data?.headers?.to,
    });
    return NextResponse.json({ status: "missing_addresses" });
  }

  const supabase = createServerClient();

  // Recipient lookup: "<email_username>@<brand-domain>" → manager profile.
  // Falls back to scanning profile_username_aliases so legacy usernames keep
  // working after a manager renames themselves. Both lookups use ILIKE so
  // case differences in the inbound recipient never matter.
  let managerProfileId: string | null = null;
  let matchedRecipient: string | null = null;
  const triedUsernameParts: string[] = [];

  for (const recipient of recipients) {
    const usernamePart = recipient.split("@")[0]?.toLowerCase().trim() ?? "";
    if (!usernamePart) continue;
    triedUsernameParts.push(usernamePart);

    const { data: profile } = await supabase
      .from("profiles")
      .select("id, management_company_id")
      .ilike("email_username", usernamePart)
      .maybeSingle();
    if ((profile as { id: string } | null)?.id) {
      managerProfileId = (profile as { id: string }).id;
      matchedRecipient = recipient;
      break;
    }

    const { data: alias } = await supabase
      .from("profile_username_aliases")
      .select("profile_id")
      .ilike("username", usernamePart)
      .is("retired_at", null)
      .maybeSingle();
    if ((alias as { profile_id: string } | null)?.profile_id) {
      managerProfileId = (alias as { profile_id: string }).profile_id;
      matchedRecipient = recipient;
      break;
    }
  }

  if (!managerProfileId) {
    console.warn(
      "resend-inbound: no manager matched",
      JSON.stringify({
        recipients,
        triedUsernameParts,
        sender,
      }),
    );
    return NextResponse.json({
      status: "no_manager",
      tried: triedUsernameParts,
    });
  }
  const recipient = matchedRecipient!;

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
