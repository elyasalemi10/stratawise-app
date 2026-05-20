import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import {
  getOutlookMessage,
  listOutlookAttachments,
  getOutlookAttachmentBytes,
} from "@/lib/outlook/graph-client";
import { uploadObject } from "@/lib/storage/r2";
import { applyAutoLinkToCommLog } from "@/lib/email/auto-link";

// Microsoft Graph change-notification webhook.
//
// Two paths:
//   (a) Validation handshake: Graph hits this URL on subscription
//       creation with ?validationToken=X. We must respond 200 within
//       10s with that token as text/plain.
//   (b) Change notifications: Graph POSTs {value: [{subscriptionId,
//       resource, changeType, resourceData{id}, clientState}, …]}.
//       Auth = the clientState string we stored when creating the
//       subscription. We look it up against outlook_mailbox_subscriptions,
//       fetch each new message via Graph, insert into communication_log,
//       persist attachments to R2, and emit a notification.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_INBOUND_ATTACHMENT_BYTES = 25 * 1024 * 1024;

export async function POST(request: NextRequest) {
  // Validation handshake — Graph hits POST too with ?validationToken= for
  // the initial verification. (Some docs say GET, the real behaviour is
  // POST with a query param + empty body.)
  const validationToken = request.nextUrl.searchParams.get("validationToken");
  if (validationToken) {
    return new NextResponse(validationToken, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  let envelope: {
    value?: Array<{
      subscriptionId?: string;
      clientState?: string;
      resource?: string;
      changeType?: string;
      resourceData?: { id?: string };
    }>;
  };
  try {
    envelope = (await request.json()) as typeof envelope;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const supabase = createServerClient();

  for (const notif of envelope.value ?? []) {
    if (!notif.subscriptionId || !notif.resourceData?.id || !notif.clientState) {
      continue;
    }

    const { data: subRow } = await supabase
      .from("outlook_mailbox_subscriptions")
      .select("id, management_company_id, mailbox_email, tenant_id, manager_profile_id, subscription_id")
      .eq("subscription_id", notif.subscriptionId)
      .maybeSingle();

    const sub = subRow as
      | {
          id: string;
          management_company_id: string;
          mailbox_email: string;
          tenant_id: string;
          manager_profile_id: string | null;
          subscription_id: string;
        }
      | null;

    if (!sub) {
      console.warn("outlook-push: no subscription row for", notif.subscriptionId);
      continue;
    }

    // CSRF / auth check — the clientState we issued at subscription
    // create time should match. The token doesn't grant the row access
    // (RLS doesn't bind here — service-role client) but it stops random
    // POSTs to this URL from being ingested.
    const expectedState = process.env.OUTLOOK_PUSH_CLIENT_STATE ?? "stratawise-outlook";
    if (notif.clientState !== expectedState) {
      console.warn("outlook-push: clientState mismatch on", notif.subscriptionId);
      continue;
    }

    if (notif.changeType !== "created") continue;

    const fetched = await getOutlookMessage(
      sub.tenant_id,
      sub.mailbox_email,
      notif.resourceData.id,
    );
    if (!fetched.ok) {
      console.warn(
        "outlook-push: getOutlookMessage failed for",
        notif.resourceData.id,
        ":",
        fetched.error,
      );
      // Auth-shaped errors → persist last_error so the Email tab can
      // surface a reconnect banner (mirrors gmail-push).
      if (/unauthorized|invalid_grant|forbidden|401|403/i.test(fetched.error)) {
        await supabase
          .from("outlook_mailbox_subscriptions")
          .update({
            last_error: fetched.error.slice(0, 500),
            updated_at: new Date().toISOString(),
          })
          .eq("id", sub.id);
      }
      continue;
    }

    const msg = fetched.message;

    // Skip outbound-loop: our own sent items land in inbox too.
    if (msg.from === sub.mailbox_email.toLowerCase()) continue;

    // Auto-match the outbound thread by In-Reply-To → outbound.external_id.
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

    // Idempotency: dedupe by external_id + manager.
    const { data: existing } = await supabase
      .from("communication_log")
      .select("id")
      .eq("channel", "email")
      .eq("direction", "inbound")
      .eq("external_id", msg.inReplyTo ?? msg.id)
      .eq("recipient_id", sub.manager_profile_id ?? "")
      .maybeSingle();
    if (existing) continue;

    if (!sub.manager_profile_id) continue;

    const { data: logRow } = await supabase
      .from("communication_log")
      .insert({
        oc_id: outboundOcId,
        lot_id: outboundLotId,
        recipient_id: sub.manager_profile_id,
        channel: "email",
        type: "manager_message_reply",
        direction: "inbound",
        recipient_email: sub.mailbox_email,
        subject: msg.subject || "(no subject)",
        body_preview: (msg.bodyText || "").slice(0, 500),
        body_full: msg.bodyText || null,
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
      console.error("outlook-push: failed to insert inbound row for", msg.id);
      continue;
    }
    const commLogId = (logRow as { id: string }).id;

    // Auto-link by sender email when thread-match returned no result.
    // Same shape as gmail-push; see lib/email/auto-link.ts for the rules.
    if (!outboundOcId && msg.from && sub.manager_profile_id) {
      try {
        await applyAutoLinkToCommLog(supabase, {
          communicationLogId: commLogId,
          senderEmail: msg.from,
          managerProfileId: sub.manager_profile_id,
          sourceChannel: "outlook",
        });
      } catch (err) {
        console.warn("outlook-push: auto-link by sender failed (non-fatal)", err);
      }
    }

    // Attachments — Graph: list metadata, then download bytes per row.
    if (msg.hasAttachments) {
      const listRes = await listOutlookAttachments(
        sub.tenant_id,
        sub.mailbox_email,
        msg.id,
      );
      if (listRes.ok) {
        for (const att of listRes.attachments) {
          if (att.size > MAX_INBOUND_ATTACHMENT_BYTES) {
            console.warn(`outlook-push: skipping oversize ${att.name}`);
            continue;
          }
          const bytesRes = await getOutlookAttachmentBytes(
            sub.tenant_id,
            sub.mailbox_email,
            msg.id,
            att.id,
          );
          if (!bytesRes.ok) continue;
          const safeName = att.name.replace(/[/\\?%*:|"<>]/g, "_");
          const r2Key = `inbound-emails/${commLogId}/${safeName}`;
          try {
            const upload = await uploadObject(r2Key, bytesRes.bytes, att.contentType);
            await supabase.from("inbound_email_attachments").insert({
              communication_log_id: commLogId,
              filename: att.name,
              mime_type: att.contentType,
              size_bytes: att.size,
              r2_key: r2Key,
              r2_url: upload.publicUrl,
            });
          } catch (err) {
            console.error("outlook-push: attachment upload failed", err);
          }
        }
      }
    }

    // Clear last_error on first successful ingest after a failure.
    await supabase
      .from("outlook_mailbox_subscriptions")
      .update({ last_error: null, updated_at: new Date().toISOString() })
      .eq("id", sub.id);

    // Drop an in-app notification — same shape as Gmail's.
    const { data: notifRow } = await supabase
      .from("notifications")
      .insert({
        profile_id: sub.manager_profile_id,
        oc_id: outboundOcId,
        type: "email_reply",
        title: msg.subject
          ? outboundLogId && !/^re:\s/i.test(msg.subject)
            ? `Re: ${msg.subject}`
            : msg.subject
          : `New message from ${msg.from}`,
        body: (msg.bodyText || "").slice(0, 200),
        link: null,
        metadata: {
          communication_log_id: commLogId,
          sender_email: msg.from,
          provider: "outlook",
          outlook_message_id: msg.id,
        },
      })
      .select("id")
      .single();

    if (notifRow) {
      await supabase
        .from("notifications")
        .update({ link: `/inbox?n=${(notifRow as { id: string }).id}` })
        .eq("id", (notifRow as { id: string }).id);
    }
  }

  return NextResponse.json({ status: "ok" });
}
