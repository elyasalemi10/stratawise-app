import { schedules } from "@trigger.dev/sdk";
import { runEscalationStepCheck } from "@/lib/escalation/jobs";
import { resolveSystemProfileId } from "@/lib/accrual/jobs";
import { createServerClient } from "@/lib/supabase";

// ============================================================================
// Trigger.dev scheduled task — daily escalation step check (PP6.5).
// ----------------------------------------------------------------------------
// Mirrors trigger/check-overdue-levies.ts conventions:
//   - Imports ONLY from @/lib/escalation/*, @/lib/accrual/jobs (resolver),
//     and @/lib/supabase. Zero "use server" imports.
//   - Aggregate audit_log row at end (entity_type='escalation_step_cron').
//
// Schedule: every day at 04:00 Australia/Melbourne — strictly after the
// 03:00 overdue check so step-2/step-3 dispatches don't race step-1
// instance creation on the same calendar day.
//
// Eligibility (status='active' AND next_action_at <= runDate AND
// current_step < 3), opt-out behaviour, MANDATORY bypass for the final
// notice, and per-instance state advancement all live in
// src/lib/escalation/jobs.ts (framework-agnostic).
//
// Dormant in production until Trigger.dev is provisioned. Same operational
// status as accrue-interest.ts + check-overdue-levies.ts — invocable today
// via tsx + the verification harness.
// ============================================================================

export const dailyCheckEscalationSteps = schedules.task({
  id: "daily-check-escalation-steps",
  cron: { pattern: "0 4 * * *", timezone: "Australia/Melbourne" },
  run: async (payload) => {
    const supabase = createServerClient();

    const systemProfileId = await resolveSystemProfileId(supabase);

    const runDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Australia/Melbourne",
    }).format(new Date());

    let result;
    try {
      result = await runEscalationStepCheck({
        runDate,
        systemProfileId,
        supabase,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("daily-check-escalation-steps: job threw:", msg);
      await supabase.from("audit_log").insert({
        profile_id: systemProfileId,
        oc_id: null,
        action: "escalation_step_cron.failed",
        entity_type: "escalation_step_cron",
        entity_id: null,
        metadata: { run_date: runDate, error: msg },
      });
      return {
        timestamp: payload.timestamp,
        runDate,
        processed: 0,
        advanced: 0,
        skipped: 0,
        errors: 1,
      };
    }

    await supabase.from("audit_log").insert({
      profile_id: systemProfileId,
      oc_id: null,
      action: "escalation_step_cron.run",
      entity_type: "escalation_step_cron",
      entity_id: null,
      metadata: {
        run_date: runDate,
        processed: result.processed,
        advanced: result.advanced,
        skipped: result.skipped,
        errors: result.errors,
      },
    });

    return {
      timestamp: payload.timestamp,
      runDate,
      processed: result.processed,
      advanced: result.advanced,
      skipped: result.skipped,
      errors: result.errors,
    };
  },
});
