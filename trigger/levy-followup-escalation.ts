import { schedules } from "@trigger.dev/sdk";
import { runEscalationSweep } from "@/lib/escalation/runner";

// Daily levy follow-up escalation. Creates a follow-up instance per overdue
// levy notice and advances due instances one step at a time (reminder emails,
// final notice, then VCAT task). Runs after the auto-send + CSV-reminder crons.

export const levyFollowupEscalation = schedules.task({
  id: "levy-followup-escalation",
  cron: { pattern: "0 10 * * *", timezone: "Australia/Melbourne" },
  run: async () => {
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Melbourne" }).format(new Date());
    return await runEscalationSweep(today);
  },
});
