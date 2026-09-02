import "server-only";
import { runComplianceReminders } from "./tasks/compliance-reminders";
import { runLevyAutosend } from "./tasks/levy-autosend";
import { runLevyCsvReminder } from "./tasks/levy-csv-reminder";
import { runLevyFollowupEscalation } from "./tasks/levy-followup-escalation";
import { runRecurringJobReminders } from "./tasks/recurring-job-reminders";

// Every daily automation, and the Melbourne wall-clock hour it belongs at.
//
// Why an hour rather than a cron expression: Vercel cron expressions are UTC
// only, with no timezone field. Melbourne is UTC+10 half the year and UTC+11
// the other half, so ANY fixed UTC time drifts by an hour across daylight
// saving. "8am" for a manager's morning digest that becomes 7am in April is
// not a schedule, it is a bug that shows up twice a year.
//
// So /api/cron/daily runs every hour, works out the local hour in Melbourne
// itself, and runs whatever belongs at it. Intl handles the DST arithmetic,
// which is the one part nobody should be hand-rolling.

export const MELBOURNE = "Australia/Melbourne";

export interface CronTask {
  /** Stable id. Also the idempotency key, with the local date. */
  id: string;
  /** Hour of the Melbourne day, 0-23. */
  hour: number;
  /** What a manager would call it. Used in the manual-run response. */
  label: string;
  run: () => Promise<unknown>;
}

// Gmail watch renewal is deliberately NOT here. /api/cron/gmail-sweep owns
// it, on a 5-minute tick with a 2-day renewal window. The daily task that
// used to do it also wrote the fresh historyId from users.watch() onto the
// subscription, which jumps the cursor past anything the push webhook never
// delivered , the exact failure gmail-sweep exists to catch. Renewing and
// advancing the read cursor must not be the same action.
//
// Ordered by hour so the file reads as the day does. Where several share an
// hour the order here is the order they run in, which matters: levy autosend
// must land before the follow-up sweep looks for overdue notices.
export const CRON_TASKS: CronTask[] = [
  {
    id: "compliance-reminders",
    hour: 8,
    label: "Compliance reminders",
    run: runComplianceReminders,
  },
  {
    id: "levy-csv-reminder",
    hour: 8,
    label: "Levy CSV reminders",
    run: runLevyCsvReminder,
  },
  {
    id: "recurring-job-reminders",
    hour: 8,
    label: "Recurring maintenance reminders",
    run: runRecurringJobReminders,
  },
  {
    id: "levy-autosend",
    hour: 9,
    label: "Auto-send levies",
    run: runLevyAutosend,
  },
  {
    id: "levy-followup-escalation",
    hour: 10,
    label: "Levy follow-up escalation",
    run: runLevyFollowupEscalation,
  },
];

export function findTask(id: string): CronTask | undefined {
  return CRON_TASKS.find((t) => t.id === id);
}

/** Melbourne local date as YYYY-MM-DD. */
export function melbourneDate(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: MELBOURNE }).format(now);
}

/** Melbourne local hour, 0-23. */
export function melbourneHour(now = new Date()): number {
  return Number(
    new Intl.DateTimeFormat("en-AU", {
      timeZone: MELBOURNE,
      hour: "2-digit",
      hour12: false,
    }).format(now),
  );
}
