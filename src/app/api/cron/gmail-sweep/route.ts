import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { isGmailConfigured, watchMailbox } from "@/lib/google/gmail-client";
import { syncMailboxHistory, type Subscription } from "@/lib/google/gmail-inbound";

// ============================================================================
// GET /api/cron/gmail-sweep , Vercel Cron
// ----------------------------------------------------------------------------
// Two jobs, both of which the inbox silently depended on and neither of which
// anything was doing:
//
//   1. RENEW THE WATCH. A Gmail users.watch registration lasts 7 days. When it
//      lapses Gmail stops publishing to the topic and inbound mail stops
//      arriving, with no error raised anywhere, because nothing ran to raise
//      one. Any watch inside the renewal window is re-registered here.
//
//   2. SWEEP FOR MISSED MESSAGES. Pub/Sub push is the low-latency path, but it
//      has a silent failure mode: if the subscription is missing, points at
//      the wrong URL, or its verification token does not match, the webhook is
//      never called at all. Nothing errors, last_error stays null, and replies
//      sit unread in the mailbox indefinitely. Polling the same history cursor
//      the webhook uses makes the inbox correct regardless, at the cost of one
//      Gmail API call per watched mailbox per run.
//
// The sweep is a safety net, not a replacement: with push working, it finds
// nothing and returns immediately. Both paths call syncMailboxHistory, which
// is idempotent on the Gmail message id, so a push and a sweep racing over the
// same message produce one row.
//
// Auth: Vercel sends `Authorization: Bearer $CRON_SECRET` on every cron
// invocation. We reject anything else so the endpoint isn't publicly runnable.
// ============================================================================

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Re-register a watch once it is inside this window of expiring. Gmail's
 *  registration lasts 7 days; renewing with two to spare means a couple of
 *  failed runs in a row still cannot let one lapse. */
const RENEW_WHEN_EXPIRING_WITHIN_MS = 2 * 24 * 60 * 60 * 1000;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("gmail-sweep: CRON_SECRET is not configured");
    return NextResponse.json({ error: "unconfigured" }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    console.warn("gmail-sweep: rejected, bad or missing bearer token");
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!isGmailConfigured()) {
    return NextResponse.json({ status: "gmail_not_configured" });
  }

  const supabase = createServerClient();

  const { data: rows, error } = await supabase
    .from("gmail_mailbox_subscriptions")
    .select(
      "id, management_company_id, manager_profile_id, history_id, mailbox_email, watch_expires_at",
    );

  if (error) {
    console.error("gmail-sweep: failed to list subscriptions", error);
    return NextResponse.json({ error: "list_failed" }, { status: 500 });
  }

  const subs = (rows ?? []) as Array<Subscription & { watch_expires_at: string | null }>;
  const topic = process.env.GMAIL_PUBSUB_TOPIC ?? null;
  const now = Date.now();

  let renewed = 0;
  let swept = 0;
  let ingested = 0;
  const failures: Array<{ mailbox: string; stage: string; error: string }> = [];

  for (const sub of subs) {
    // 1. Renew the watch if it is close to lapsing. Done first: a renewal
    //    returns a fresh history id, and we would rather sweep from the
    //    cursor we already hold than from that one, so the sweep below still
    //    reads sub.history_id.
    const expiresAt = sub.watch_expires_at ? Date.parse(sub.watch_expires_at) : null;
    const expiringSoon =
      expiresAt === null || expiresAt - now <= RENEW_WHEN_EXPIRING_WITHIN_MS;

    if (topic && expiringSoon) {
      const watch = await watchMailbox(sub.mailbox_email, topic);
      if (watch.ok) {
        renewed += 1;
        await supabase
          .from("gmail_mailbox_subscriptions")
          .update({
            // Gmail returns the expiration as epoch milliseconds in a string.
            watch_expires_at: watch.expiration
              ? new Date(Number(watch.expiration)).toISOString()
              : null,
            watch_last_renewed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", sub.id);
      } else {
        failures.push({
          mailbox: sub.mailbox_email,
          stage: "renew",
          error: watch.error,
        });
        await supabase
          .from("gmail_mailbox_subscriptions")
          .update({
            last_error: watch.error.slice(0, 500),
            updated_at: new Date().toISOString(),
          })
          .eq("id", sub.id);
        // A watch we could not renew is usually a revoked DWD grant, in which
        // case the sweep below will fail the same way. Skip it.
        continue;
      }
    }

    // 2. Sweep. syncMailboxHistory writes its own last_error on failure.
    const result = await syncMailboxHistory(supabase, sub);
    if (result.ok) {
      swept += 1;
      ingested += result.processed;
    } else {
      failures.push({
        mailbox: sub.mailbox_email,
        stage: "sweep",
        error: result.error,
      });
    }
  }

  if (failures.length > 0) {
    console.error("gmail-sweep: failures", JSON.stringify(failures));
  }

  return NextResponse.json({
    status: "ok",
    mailboxes: subs.length,
    renewed,
    swept,
    ingested,
    failures: failures.length,
  });
}
