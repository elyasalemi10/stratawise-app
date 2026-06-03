// Pure date helpers for recurring maintenance jobs. No Supabase, no auth, no
// next/cache , safe to import from server actions AND Trigger.dev tasks.

import type { RecurringFrequency } from "@/lib/validations/recurring-jobs";

// All dates are handled as "YYYY-MM-DD" strings in UTC to avoid timezone drift
// between Vercel (UTC) and the manager's local clock.

function parseISO(d: string): Date {
  return new Date(`${d.slice(0, 10)}T00:00:00.000Z`);
}

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Advance a date by one step of the given frequency. Month-based steps clamp
 *  to the end of the target month (e.g. the 31st in a 30-day month -> 30th). */
export function advance(dateIso: string, frequency: RecurringFrequency): string {
  const d = parseISO(dateIso);
  switch (frequency) {
    case "weekly":
      d.setUTCDate(d.getUTCDate() + 7);
      return toISO(d);
    case "fortnightly":
      d.setUTCDate(d.getUTCDate() + 14);
      return toISO(d);
    case "monthly":
      return addMonths(dateIso, 1);
    case "quarterly":
      return addMonths(dateIso, 3);
    case "half_yearly":
      return addMonths(dateIso, 6);
    case "annually":
      return addMonths(dateIso, 12);
  }
}

function addMonths(dateIso: string, months: number): string {
  const d = parseISO(dateIso);
  const day = d.getUTCDate();
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return toISO(target);
}

/**
 * The next occurrence on/after `fromIso`, stepping from `startDate` by
 * `frequency`. Returns null when the schedule has ended (next occurrence would
 * fall after `endDate`). `fromIso` defaults to startDate.
 */
export function computeNextOccurrence(opts: {
  startDate: string;
  frequency: RecurringFrequency;
  endDate?: string | null;
  fromIso: string;
}): string | null {
  const { startDate, frequency, endDate, fromIso } = opts;
  let cursor = startDate.slice(0, 10);
  const from = fromIso.slice(0, 10);
  // Guard against pathological loops (e.g. weekly over decades).
  let guard = 0;
  while (cursor < from && guard < 5000) {
    cursor = advance(cursor, frequency);
    guard++;
  }
  if (endDate && cursor > endDate.slice(0, 10)) return null;
  return cursor;
}

/** Derive the anchor value stored alongside a job: day-of-month (1-31) for
 *  monthly+ cadences, weekday (0-6, Sun=0) for weekly/fortnightly. Purely for
 *  display; occurrences are computed by stepping from start_date. */
export function anchorFromStart(startDate: string, frequency: RecurringFrequency): number {
  const d = parseISO(startDate);
  if (frequency === "weekly" || frequency === "fortnightly") return d.getUTCDay();
  return d.getUTCDate();
}
