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

export function buildPlannedSends(
  schedule: Pick<LevyAutosendSchedule, "send_day_of_month" | "date_overrides">,
  billingCycle: string,
  fromIso: string,
  months = 12,
): PlannedSend[] {
  const gap = ((c: string) => {
    switch (c) {
      case "monthly": return 1;
      case "quarterly": return 3;
      case "half_yearly": return 6;
      case "annually": return 12;
      default: return 1;
    }
  })(billingCycle);

  const planned: PlannedSend[] = [];
  const start = new Date(`${fromIso}T00:00:00Z`);
  // First planned date = the same-month send_day, or next-cycle if already past.
  let y = start.getUTCFullYear();
  let m = start.getUTCMonth();
  const todayDay = start.getUTCDate();
  if (schedule.send_day_of_month < todayDay) {
    m += gap;
    while (m > 11) { m -= 12; y += 1; }
  }
  for (let i = 0; i < months; i++) {
    const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    const safeDay = Math.min(schedule.send_day_of_month, lastDay);
    const defaultDate = `${y.toString().padStart(4, "0")}-${(m + 1).toString().padStart(2, "0")}-${safeDay.toString().padStart(2, "0")}`;
    const monthKey = `${y.toString().padStart(4, "0")}-${(m + 1).toString().padStart(2, "0")}`;
    const override = schedule.date_overrides[monthKey];
    planned.push({
      monthKey,
      defaultDate,
      effectiveDate: override ?? defaultDate,
      isOverridden: Boolean(override) && override !== defaultDate,
    });
    m += gap;
    while (m > 11) { m -= 12; y += 1; }
  }
  return planned;
}
