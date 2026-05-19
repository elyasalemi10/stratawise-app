import { schedules } from "@trigger.dev/sdk";
import { createServerClient } from "@/lib/supabase";
import { renewOutlookSubscription } from "@/lib/outlook/graph-client";

// Microsoft Graph mail subscriptions cap at ~3 days (4230 minutes).
// This cron PATCHes any row expiring within the next 24h to keep
// inbound mail flowing. Daily at 02:30 AEDT — paired with the Gmail
// watch refresh at 02:00 so we don't pummel either provider's API
// in the same minute.

export const outlookSubscriptionRefresh = schedules.task({
  id: "outlook-subscription-refresh",
  cron: { pattern: "30 2 * * *", timezone: "Australia/Melbourne" },
  run: async () => {
    const supabase = createServerClient();

    const cutoff = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from("outlook_mailbox_subscriptions")
      .select("id, tenant_id, subscription_id, mailbox_email")
      .or(`expires_at.is.null,expires_at.lte.${cutoff}`)
      .not("subscription_id", "is", null)
      .limit(500);

    if (error) {
      console.error("outlook-subscription-refresh: query failed", error);
      return { ok: false, reason: error.message };
    }

    const subs = (data ?? []) as Array<{
      id: string;
      tenant_id: string;
      subscription_id: string;
      mailbox_email: string;
    }>;
    if (subs.length === 0) return { ok: true, refreshed: 0 };

    let success = 0;
    let failure = 0;
    for (const sub of subs) {
      const result = await renewOutlookSubscription(sub.tenant_id, sub.subscription_id);
      if (result.ok) {
        await supabase
          .from("outlook_mailbox_subscriptions")
          .update({
            expires_at: result.expiresAt,
            last_renewed_at: new Date().toISOString(),
            last_error: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", sub.id);
        success += 1;
      } else {
        await supabase
          .from("outlook_mailbox_subscriptions")
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
