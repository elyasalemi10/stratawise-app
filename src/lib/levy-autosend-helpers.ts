// Pure helpers shared between the auto-send server actions and the
// client-side schedule popup. Lives outside "use server" so the bundler
// can import it from both sides without tripping the "Server Actions
// must be async" rule.

import type { LevyAutosendSchedule } from "@/lib/actions/levy-autosend";

export interface PlannedSend {
  monthKey: string;       // "YYYY-MM"
  defaultDate: string;     // "YYYY-MM-DD" (what the cadence would fire)
  effectiveDate: string;   // "YYYY-MM-DD" (override-applied)
  isOverridden: boolean;
}

function monthsForCycle(cycle: string): number {
  switch (cycle) {
    case "monthly": return 1;
    case "quarterly": return 3;
    case "half_yearly": return 6;
    case "annually": return 12;
    default: return 1;
  }
}

/**
 * Period-aligned auto-send schedule.
 *
 * For a quarterly cycle with FY starting July, the periods are July,
 * October, January, April , NOT calendar quarters. This helper walks
 * those FY-aligned period start months and stamps the manager's
 * `send_day_of_month` onto each one. Periods whose default date is
 * strictly in the past are skipped so the first row of the preview is
 * always actionable.
 */
export function buildPlannedSends(
  schedule: Pick<LevyAutosendSchedule, "send_day_of_month" | "date_overrides">,
  billingCycle: string,
  fromIso: string,
  count = 12,
  financialYearStartMonth = 7,
): PlannedSend[] {
  const gap = monthsForCycle(billingCycle);
  const today = new Date(`${fromIso}T00:00:00Z`);
  const todayY = today.getUTCFullYear();
  const todayM = today.getUTCMonth();
  const fyStartIdx = Math.max(0, Math.min(11, (financialYearStartMonth - 1)));

  // Anchor on the FY that contains today. For FY July (idx 6): if
  // today is in [Jul Y, Jun Y+1] → fyYear = Y; if today is Jan–Jun →
  // fyYear = Y-1.
  let y = todayY;
  if (todayM < fyStartIdx) y -= 1;
  let m = fyStartIdx;

  // Walk forward in `gap` steps from the FY start, collecting every
  // period whose default date is >= today. Cap at `count * 3` iterations
  // so a misconfigured FY can't loop forever.
  const planned: PlannedSend[] = [];
  for (let i = 0; planned.length < count && i < count * 3; i++) {
    const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    const safeDay = Math.min(schedule.send_day_of_month, lastDay);
    const defaultDate = `${y.toString().padStart(4, "0")}-${(m + 1).toString().padStart(2, "0")}-${safeDay.toString().padStart(2, "0")}`;
    const periodDate = new Date(`${defaultDate}T00:00:00Z`);
    // Skip periods that have already passed.
    if (periodDate >= today) {
      const monthKey = `${y.toString().padStart(4, "0")}-${(m + 1).toString().padStart(2, "0")}`;
      const override = schedule.date_overrides[monthKey];
      planned.push({
        monthKey,
        defaultDate,
        effectiveDate: override ?? defaultDate,
        isOverridden: Boolean(override) && override !== defaultDate,
      });
    }
    m += gap;
    while (m > 11) { m -= 12; y += 1; }
  }
  return planned;
}

/**
 * The single next send date , what we stamp on
 * levy_autosend_schedules.next_send_date. Mirrors buildPlannedSends'
 * FY-alignment logic but returns just the first eligible period.
 */
export function nextSendDateFromSchedule(
  sendDay: number,
  billingCycle: string,
  fromIso: string,
  financialYearStartMonth = 7,
): string | null {
  const list = buildPlannedSends(
    { send_day_of_month: sendDay, date_overrides: {} },
    billingCycle,
    fromIso,
    1,
    financialYearStartMonth,
  );
  return list[0]?.defaultDate ?? null;
}

/**
 * "First", "Second", ... "Tenth" then fall back to "Run 11", "Run 12".
 * Used as the label prefix on the schedule preview rows.
 */
export function ordinalRunLabel(index: number): string {
  const names = ["First", "Second", "Third", "Fourth", "Fifth", "Sixth", "Seventh", "Eighth", "Ninth", "Tenth"];
  if (index < names.length) return `${names[index]} run`;
  return `Run ${index + 1}`;
}
