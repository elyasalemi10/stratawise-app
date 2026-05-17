import { schedules } from "@trigger.dev/sdk";
import { createServerClient } from "@/lib/supabase";
import { watchMailbox } from "@/lib/google/gmail-client";

// Refresh Gmail Push watches.
//
// users.watch() expires after 7 days. Once expired the mailbox stops
// publishing to our Pub/Sub topic and inbound replies silently stop
// reaching /api/webhooks/gmail-push. This task runs daily at 02:00 AEDT
// and re-calls watch() on any subscription whose expiration is within
// the next 24 hours.
//
// On success we store the new historyId so subsequent push diffs are
// correctly bounded; on failure we stash the error on the row so admins
// can see it surfaced in /settings → Email.

export const gmailWatchRefresh = schedules.task({
  id: "gmail-watch-refresh",
  cron: { pattern: "0 2 * * *", timezone: "Australia/Melbourne" },
  run: async () => {
    const topic = process.env.GMAIL_PUBSUB_TOPIC;
    if (!topic) {
      console.warn(
        "gmail-watch-refresh: GMAIL_PUBSUB_TOPIC is not set — skipping run",
      );
      return { ok: false, reason: "missing_topic" };
    }

    const supabase = createServerClient();

    // Pick anything expiring in <24h, plus anything that has never been
    // watched yet (watch_expires_at IS NULL → newly-added subscription).
    const cutoff = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from("gmail_mailbox_subscriptions")
      .select("id, mailbox_email")
      .or(`watch_expires_at.is.null,watch_expires_at.lte.${cutoff}`)
      .limit(500);
    if (error) {
      console.error("gmail-watch-refresh: query failed", error);
      return { ok: false, reason: error.message };
    }
    const subs = (data ?? []) as Array<{ id: string; mailbox_email: string }>;
    if (subs.length === 0) return { ok: true, refreshed: 0 };

    let success = 0;
    let failure = 0;
    for (const sub of subs) {
      const result = await watchMailbox(sub.mailbox_email, topic);
      if (result.ok) {
        await supabase
          .from("gmail_mailbox_subscriptions")
          .update({
            history_id: result.historyId,
            // Gmail returns expiration as epoch-ms string.
            watch_expires_at: new Date(
              Number(result.expiration) || Date.now() + 7 * 24 * 60 * 60 * 1000,
            ).toISOString(),
            watch_last_renewed_at: new Date().toISOString(),
            last_error: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", sub.id);
        success += 1;
      } else {
        await supabase
          .from("gmail_mailbox_subscriptions")
          .update({
            last_error: result.error.slice(0, 500),
            updated_at: new Date().toISOString(),
          })
          .eq("id", sub.id);
        failure += 1;
      }
    }

    return { ok: true, refreshed: success, failed: failure };
  },
});
