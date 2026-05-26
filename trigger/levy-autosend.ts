import { schedules } from "@trigger.dev/sdk";
import { createServerClient } from "@/lib/supabase";

// Daily auto-send levies cron. Reads levy_autosend_schedules, finds
// every enabled row whose next_send_date is today or earlier, and for
// each one:
//   1. Generates the next available period's batch from the chosen
//      budget (mirrors what the manager would do in the generate page).
//   2. Sends the batch via the chosen mailbox (fromOverride).
//   3. Updates last_sent_on + next_send_date.
//   4. On failure: stores last_error so the manager sees it in OC settings.
//
// Per the user's brief: send on schedule regardless of bank-import
// freshness; the arrears line on each notice (when OC opts in) reflects
// "as of {last bank import date}" so the owner knows the figure is
// point-in-time, even if it's a few days old. The manager gets a
// staleness banner in the dashboard if the import is >7 days behind.
//
// This is the scaffold , wiring up actual batch generation requires
// dynamically calling the same code path as the manual flow. Kept as a
// minimal stub for now; the production rollout will replace the inner
// `processSchedule` body with a call into a shared generator+sender
// helper.

export const dailyLevyAutosend = schedules.task({
  id: "daily-levy-autosend",
  cron: { pattern: "0 9 * * *", timezone: "Australia/Melbourne" }, // 09:00 local
  run: async () => {
    const supabase = createServerClient();
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Melbourne" }).format(new Date());

    const { data: due } = await supabase
      .from("levy_autosend_schedules")
      .select("id, oc_id, budget_id, send_day_of_month, from_address, next_send_date, owners_corporations!inner(billing_cycle)")
      .eq("enabled", true)
      .lte("next_send_date", today);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = ((due as any[]) ?? []).map((r) => ({
      id: r.id as string,
      oc_id: r.oc_id as string,
      budget_id: r.budget_id as string | null,
      send_day_of_month: r.send_day_of_month as number,
      from_address: r.from_address as string | null,
      next_send_date: r.next_send_date as string | null,
      billing_cycle: (r.owners_corporations?.billing_cycle ?? "monthly") as string,
    }));

    function monthsForCycle(c: string): number {
      switch (c) {
        case "monthly": return 1;
        case "quarterly": return 3;
        case "half_yearly": return 6;
        case "annually": return 12;
        default: return 1;
      }
    }

    let processed = 0;
    let errors = 0;
    for (const r of rows) {
      try {
        // TODO: wire up actual batch generation + send via shared helper.
        // Stub for now , logs to audit_log so we can monitor the cron is
        // firing while the generator helper lands in a follow-up commit.
        await supabase.from("audit_log").insert({
          oc_id: r.oc_id,
          action: "autosend_cron.skipped",
          entity_type: "levy_autosend_schedule",
          entity_id: r.id,
          metadata: { reason: "generator_not_wired_yet", today },
        });

        // Roll next_send_date forward by the OC's billing cycle gap so
        // quarterly/half/annual schedules don't fire monthly. Stamp
        // last_sent_on too once the real send succeeds (in the
        // eventual non-stub implementation).
        const gap = monthsForCycle(r.billing_cycle);
        const next = new Date(`${today}T00:00:00Z`);
        next.setUTCMonth(next.getUTCMonth() + gap);
        const lastDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
        const safeDay = Math.min(r.send_day_of_month, lastDay);
        const nextDate = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth(), safeDay));
        await supabase
          .from("levy_autosend_schedules")
          .update({ next_send_date: nextDate.toISOString().slice(0, 10), updated_at: new Date().toISOString() })
          .eq("id", r.id);
        processed++;
      } catch (err) {
        errors++;
        await supabase
          .from("levy_autosend_schedules")
          .update({
            last_error: err instanceof Error ? err.message : "Auto-send failed",
            updated_at: new Date().toISOString(),
          })
          .eq("id", r.id);
      }
    }

    return { processed, errors, candidates: rows.length };
  },
});
