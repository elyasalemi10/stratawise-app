import { schedules } from "@trigger.dev/sdk";
import { checkOverdueLeviesJob } from "@/lib/accrual/overdue-check";
import { resolveSystemProfileId } from "@/lib/accrual/jobs";
import { createServerClient } from "@/lib/supabase";

// ============================================================================
// Trigger.dev scheduled task — daily overdue-levy reminder check (PP6-C-1).
// ----------------------------------------------------------------------------
// Mirrors trigger/accrue-interest.ts conventions:
//   - Imports ONLY from @/lib/accrual/* and @/lib/supabase.
//   - Aggregate audit_log row at end (entity_type='overdue_check_cron').
//
// Schedule: every day at 03:00 Australia/Melbourne — strictly after the
// 02:00 accrual run so any same-day penalty_interest accrual is reflected
// in the email body's "Interest accrued" line.
//
// Eligibility predicate, per-levy idempotency, and email send orchestration
// all live in src/lib/accrual/overdue-check.ts (framework-agnostic).
// ============================================================================

export const dailyCheckOverdueLevies = schedules.task({
  id: "daily-check-overdue-levies",
  cron: { pattern: "0 3 * * *", timezone: "Australia/Melbourne" },
  run: async (payload) => {
    const supabase = createServerClient();

    // Hard-fail at startup if the system profile is missing — same
    // deploy-ordering invariant as the accrual cron.
    const systemProfileId = await resolveSystemProfileId(supabase);

    // run_date computed in Australia/Melbourne TZ via Intl.DateTimeFormat
    // (matches the accrual cron's approach; locale 'en-CA' returns ISO
    // YYYY-MM-DD for free).
    const runDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Australia/Melbourne",
    }).format(new Date());

    let result;
    try {
      result = await checkOverdueLeviesJob({
        runDate,
        systemProfileId,
        supabase,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("daily-check-overdue-levies: job threw:", msg);
      await supabase.from("audit_log").insert({
        profile_id: systemProfileId,
        oc_id: null,
        action: "overdue_check_cron.failed",
        entity_type: "overdue_check_cron",
        entity_id: null,
        metadata: { run_date: runDate, error: msg },
      });
      return {
        // `payload.timestamp` is undefined when the task is fired from
        // the management API (manual trigger / test), so fall back to
        // wall-clock now() to keep the return shape stable.
        timestamp: payload?.timestamp ?? new Date(),
        runDate,
        processed: 0,
        sent: 0,
        skipped: 0,
        errors: 1,
      };
    }

    await supabase.from("audit_log").insert({
      profile_id: systemProfileId,
      oc_id: null,
      action: "overdue_check_cron.run",
      entity_type: "overdue_check_cron",
      entity_id: null,
      metadata: {
        run_date: runDate,
        processed: result.processed,
        sent: result.sent,
        skipped: result.skipped,
        errors: result.errors,
      },
    });

    return {
      timestamp: payload?.timestamp ?? new Date(),
      runDate,
      processed: result.processed,
      sent: result.sent,
      skipped: result.skipped,
      errors: result.errors,
    };
  },
});
