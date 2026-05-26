import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@/lib/supabase";
import crypto from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PostGrid webhook receiver. Subscribed to letter.* events on the
// PostGrid dashboard; updates the matching communication_log row so the
// lot's communications tab shows the latest delivery state without
// requiring the manager to poll.
//
// PostGrid signs every request with the X-PostGrid-Signature header:
//   sig = hex( HMAC_SHA256(secret, raw_body) )
// We verify it against POSTGRID_WEBHOOK_SECRET; mismatches return 401.
//
// Payload shape (subset we care about):
//   {
//     "type": "letter.printing" | "letter.completed" | "letter.failed" | ...,
//     "data": { "id": "letter_xxx", "status": "...", "send_date": "..." }
//   }

function mapPostGridStatus(eventType: string, payloadStatus: string | null): {
  status: "queued" | "sent" | "delivered" | "bounced" | "failed";
  setDeliveredAt: boolean;
} {
  const t = eventType.toLowerCase();
  if (t.includes("completed") || t.includes("delivered")) {
    return { status: "delivered", setDeliveredAt: true };
  }
  if (t.includes("failed") || t.includes("cancelled") || t.includes("returned")) {
    return { status: "failed", setDeliveredAt: false };
  }
  if (t.includes("printing") || t.includes("processed_for_delivery")) {
    return { status: "sent", setDeliveredAt: false };
  }
  // Fall back to the payload's own status string when the event name
  // is one we haven't mapped (PostGrid adds new ones occasionally).
  if (payloadStatus === "completed") return { status: "delivered", setDeliveredAt: true };
  if (payloadStatus === "failed" || payloadStatus === "cancelled") return { status: "failed", setDeliveredAt: false };
  return { status: "sent", setDeliveredAt: false };
}

export async function POST(req: NextRequest) {
  const secret = process.env.POSTGRID_WEBHOOK_SECRET;
  const sigHeader = req.headers.get("postgrid-signature") ?? req.headers.get("x-postgrid-signature");
  const raw = await req.text();

  // Allow the endpoint to run without verification in dev (no secret
  // configured) so local testing isn't blocked, but ALWAYS verify in
  // prod , a real secret is mandatory once the integration goes live.
  if (secret) {
    if (!sigHeader) {
      return NextResponse.json({ error: "Missing signature" }, { status: 401 });
    }
    const expected = crypto.createHmac("sha256", secret).update(raw).digest("hex");
    const ok = crypto.timingSafeEqual(
      Buffer.from(expected),
      Buffer.from(sigHeader.trim()),
    );
    if (!ok) {
      console.warn("[postgrid-webhook] signature mismatch");
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  } else {
    console.warn("[postgrid-webhook] POSTGRID_WEBHOOK_SECRET not configured , skipping verification (dev only)");
  }

  let payload: { type?: string; data?: { id?: string; status?: string } } = {};
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Bad JSON" }, { status: 400 });
  }

  const externalId = payload.data?.id;
  if (!externalId) {
    return NextResponse.json({ error: "Missing letter id" }, { status: 400 });
  }

  const { status, setDeliveredAt } = mapPostGridStatus(
    payload.type ?? "",
    payload.data?.status ?? null,
  );

  const supabase = createServerClient();
  const update: Record<string, string> = { status };
  if (setDeliveredAt) update.delivered_at = new Date().toISOString();

  const { error } = await supabase
    .from("communication_log")
    .update(update)
    .eq("external_id", externalId)
    .eq("channel", "letter");

  if (error) {
    console.error("[postgrid-webhook] update failed:", error);
    // 200 still , PostGrid retries 4xx/5xx and we don't want a noisy
    // outage if the row hasn't landed yet.
  }

  return NextResponse.json({ ok: true });
}
