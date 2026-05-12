import { NextResponse } from "next/server";
import { handleBasiqEvent } from "@/lib/actions/basiq";
import { verifyBasiqWebhookSignature } from "@/lib/basiq/webhook-signature";
import { createServerClient } from "@/lib/supabase";

// HMAC verification needs Node's crypto + raw body access — force Node runtime.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============================================================================
// POST /api/basiq/webhook
// ----------------------------------------------------------------------------
// Verifies the HMAC-SHA256 signature on `webhook-id.webhook-timestamp.rawBody`
// (see src/lib/basiq/webhook-signature.ts) and dispatches recognised events
// to handleBasiqEvent. Unknown events are 200-OK'd without action — Basiq
// retries on non-2xx and we don't want to trigger retries for events we
// simply don't care about yet.
//
// Bad signatures → 401 AND an audit_log entry (potential attack surface).
// ============================================================================

export async function POST(req: Request): Promise<Response> {
  const rawBody = await req.text();

  const id = req.headers.get("webhook-id");
  const timestamp = req.headers.get("webhook-timestamp");
  const signatureHeader = req.headers.get("webhook-signature");
  const secret = process.env.BASIQ_WEBHOOK_SECRET ?? "";

  const verify = verifyBasiqWebhookSignature({
    id,
    timestamp,
    signatureHeader,
    rawBody,
    secret,
  });

  if (!verify.valid) {
    // Audit potential tampering. Use a service-role client so we don't need
    // an authenticated profile.
    try {
      const supabase = createServerClient();
      await supabase.from("audit_log").insert({
        profile_id: null,
        oc_id: null,
        action: "basiq_webhook.signature_rejected",
        entity_type: "basiq_webhook",
        entity_id: null,
        metadata: {
          reason: verify.reason,
          id,
          timestamp,
        },
      });
    } catch {
      // best effort — don't mask the 401
    }
    return NextResponse.json(
      { error: "Invalid webhook signature" },
      { status: 401 },
    );
  }

  // Parse the body. Bad JSON still gets 200 — we don't want Basiq to retry
  // forever on a malformed payload.
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: true, note: "non-json body" });
  }

  // Basiq's webhook body uses either { type, data } or has the type at the
  // top level under "type". We tolerate both.
  const eventType = extractEventType(payload);
  if (!eventType) {
    return NextResponse.json({ ok: true, note: "no event type present" });
  }

  const result = await handleBasiqEvent({ eventType, payload });
  return NextResponse.json({ ok: true, handled: result.handled });
}

function extractEventType(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  if (typeof p.type === "string") return p.type;
  if (typeof p.eventType === "string") return p.eventType;
  if (
    p.data &&
    typeof p.data === "object" &&
    typeof (p.data as Record<string, unknown>).type === "string"
  ) {
    return (p.data as { type: string }).type;
  }
  return null;
}
