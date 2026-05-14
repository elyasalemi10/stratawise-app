import { NextRequest, NextResponse } from "next/server";
import { Webhook } from "svix";
import { createServerClient } from "@/lib/supabase";

// HMAC verification needs Node's crypto + raw body access — force Node runtime.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============================================================================
// POST /api/webhooks/resend
// ----------------------------------------------------------------------------
// Resend webhooks (Standard Webhooks format, svix-signed). The handler:
//
//   1. Verifies signature via svix.Webhook.verify on raw body. On failure,
//      audits the rejection and returns 400.
//   2. Switches on event.type and updates communication_log idempotently
//      via WHERE external_id = event.data.email_id.
//   3. Status-priority guard prevents out-of-order events from regressing
//      state. Priority: queued(0) < sent(1) < delivered(2) < opened(3).
//      bounced/failed are TERMINAL — no transitions out.
//   4. email.complained → status='bounced' + auto opt-out write to
//      notification_preferences (channel='email', enabled=false).
//   5. Unknown / clicked / orphan-external_id events → 200 OK no-op.
//
// Resend retries on non-2xx, so all 200 paths are deliberate. 4xx
// (signature) signals "stop retrying"; 5xx signals "retry".
// ============================================================================

const STATUS_PRIORITY: Record<string, number> = {
  queued: 0,
  sent: 1,
  delivered: 2,
  opened: 3,
  // bounced + failed are terminal; not in the priority chain.
};

const TERMINAL_STATUSES = new Set(["bounced", "failed"]);

interface ResendEventBase {
  type: string;
  created_at?: string;
  data: {
    email_id: string;
    [key: string]: unknown;
  };
}

interface ResendBouncePayload {
  bounce?: {
    message?: string;
    type?: string;
    subType?: string;
  };
}

async function verifyWebhook(
  request: NextRequest,
): Promise<ResendEventBase | { invalid: true; reason: string }> {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    return { invalid: true, reason: "RESEND_WEBHOOK_SECRET not set" };
  }

  const svixId = request.headers.get("svix-id");
  const svixTimestamp = request.headers.get("svix-timestamp");
  const svixSignature = request.headers.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    return { invalid: true, reason: "Missing svix-* headers" };
  }

  const rawBody = await request.text();
  try {
    const wh = new Webhook(secret);
    const payload = wh.verify(rawBody, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as ResendEventBase;
    return payload;
  } catch (err) {
    const reason = err instanceof Error ? err.message : "verify threw";
    return { invalid: true, reason };
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  const supabase = createServerClient();

  const result = await verifyWebhook(request);
  if ("invalid" in result) {
    await supabase.from("audit_log").insert({
      profile_id: null,
      oc_id: null,
      action: "communication.webhook_invalid_signature",
      entity_type: "resend_webhook",
      entity_id: null,
      metadata: { reason: result.reason },
    });
    return NextResponse.json(
      { error: "Webhook verification failed" },
      { status: 400 },
    );
  }

  const event = result;
  const externalId = event.data?.email_id;
  if (!externalId) {
    console.warn("resend-webhook: event missing data.email_id", event.type);
    return NextResponse.json({ ok: true, ignored: "no_email_id" });
  }

  // Look up the communication_log row this event refers to.
  const { data: logRow } = await supabase
    .from("communication_log")
    .select("id, status, recipient_id, type, oc_id")
    .eq("external_id", externalId)
    .maybeSingle();
  if (!logRow) {
    console.warn(
      `resend-webhook: orphan external_id ${externalId} (event.type=${event.type})`,
    );
    return NextResponse.json({ ok: true, ignored: "orphan_external_id" });
  }
  const log = logRow as {
    id: string;
    status: string;
    recipient_id: string | null;
    type: string;
    oc_id: string | null;
  };

  switch (event.type) {
    case "email.sent":
      // No-op — emit-time already wrote status='sent'.
      return NextResponse.json({ ok: true, applied: "no_op" });

    case "email.delivered":
      if (canAdvanceTo(log.status, "delivered")) {
        await supabase
          .from("communication_log")
          .update({ status: "delivered", delivered_at: new Date().toISOString() })
          .eq("id", log.id);
      }
      return NextResponse.json({ ok: true, applied: "delivered" });

    case "email.opened":
      if (canAdvanceTo(log.status, "opened")) {
        await supabase
          .from("communication_log")
          .update({ status: "opened", opened_at: new Date().toISOString() })
          .eq("id", log.id);
      }
      return NextResponse.json({ ok: true, applied: "opened" });

    case "email.bounced": {
      if (TERMINAL_STATUSES.has(log.status)) {
        return NextResponse.json({ ok: true, applied: "no_op_terminal" });
      }
      const bouncePayload = event.data as unknown as ResendBouncePayload;
      const reason =
        bouncePayload.bounce?.message ??
        bouncePayload.bounce?.subType ??
        bouncePayload.bounce?.type ??
        "Bounce reported";
      await supabase
        .from("communication_log")
        .update({ status: "bounced", error_message: reason.slice(0, 500) })
        .eq("id", log.id);
      return NextResponse.json({ ok: true, applied: "bounced" });
    }

    case "email.complained": {
      if (TERMINAL_STATUSES.has(log.status)) {
        return NextResponse.json({ ok: true, applied: "no_op_terminal" });
      }
      await supabase
        .from("communication_log")
        .update({
          status: "bounced",
          error_message: "Spam complaint received",
        })
        .eq("id", log.id);

      // Auto-opt-out (channel='email') so the recipient stops receiving
      // this notification_type via email. Recipient still gets in-app
      // notifications unless they opt out separately.
      if (log.recipient_id) {
        await supabase.from("notification_preferences").upsert(
          {
            profile_id: log.recipient_id,
            notification_type: log.type,
            channel: "email",
            enabled: false,
          },
          { onConflict: "profile_id,notification_type,channel" },
        );

        await supabase.from("audit_log").insert({
          profile_id: log.recipient_id,
          oc_id: log.oc_id,
          action: "communication.opt_out_auto",
          entity_type: "communication_log",
          entity_id: log.id,
          metadata: {
            reason: "spam_complaint",
            notification_type: log.type,
            channel: "email",
          },
        });
      }
      return NextResponse.json({ ok: true, applied: "complained" });
    }

    case "email.clicked":
      // No schema slot for click tracking. Acknowledged for telemetry.
      return NextResponse.json({ ok: true, applied: "no_op_clicked" });

    default:
      // Unknown event types are 200-OK'd without action — Resend may add
      // events later and we don't want to trigger retries for them.
      return NextResponse.json({ ok: true, applied: "no_op_unknown" });
  }
}

// ─── Internal helpers ────────────────────────────────────────────────────

function canAdvanceTo(currentStatus: string, targetStatus: string): boolean {
  if (TERMINAL_STATUSES.has(currentStatus)) return false;
  const current = STATUS_PRIORITY[currentStatus];
  const target = STATUS_PRIORITY[targetStatus];
  if (current === undefined || target === undefined) return false;
  return target > current;
}
