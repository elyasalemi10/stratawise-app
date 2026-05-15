// Levy-cadence helpers.
//
// `nextLevyDue` computes the date of the first levy notice that will fire
// after the management contract starts. The wizard's "First levy due: …"
// helper line on Step 2 (Settings) re-runs this whenever FY start month,
// levy frequency, or management start date changes.
//
// Algorithm (per spec): start with 1-{fyStartMonth} of the year containing
// `managementStartDate`. Add period offsets in months (1 / 3 / 6 / 12) until
// the candidate date is on or after `managementStartDate`. Roll into next
// year as needed.
//
// Examples:
//   FY=July, quarterly, MSD=2026-11-10 → 1 Jan 2027 (4th anchor after 1 Jul 2026)
//   FY=July, quarterly, MSD=2026-06-30 → 1 Jul 2026 (anchor lands on/after MSD)
//   FY=July, annual,    MSD=2026-08-01 → 1 Jul 2027 (next year's FY start)
//   FY=Jan,  monthly,   MSD=2026-05-15 → 1 Jun 2026 (5 months after 1 Jan 2026)

export type LevyFrequency = "monthly" | "quarterly" | "half_yearly" | "annually";

export const FREQUENCY_LABELS: Record<LevyFrequency, string> = {
  annually: "Annually",
  half_yearly: "Half-yearly",
  quarterly: "Quarterly",
  monthly: "Monthly",
};

export const FREQUENCY_PERIODS_PER_YEAR: Record<LevyFrequency, number> = {
  annually: 1,
  half_yearly: 2,
  quarterly: 4,
  monthly: 12,
};

const MONTHS_PER_PERIOD: Record<LevyFrequency, number> = {
  annually: 12,
  half_yearly: 6,
  quarterly: 3,
  monthly: 1,
};

/**
 * Returns the next levy-due Date on or after `managementStartDate`.
 *
 * @param fyStartMonth        1-12 (July = 7)
 * @param frequency           billing cadence
 * @param managementStartDate ISO yyyy-mm-dd
 * @returns Date at midnight local time, or null if inputs are invalid.
 */
export function nextLevyDue(
  fyStartMonth: number,
  frequency: LevyFrequency,
  managementStartDate: string,
): Date | null {
  if (!managementStartDate || !fyStartMonth || fyStartMonth < 1 || fyStartMonth > 12) {
    return null;
  }
  const parts = managementStartDate.split("-").map((n) => parseInt(n, 10));
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return null;
  const [year, month, day] = parts;
  const msd = new Date(year, month - 1, day);
  if (Number.isNaN(msd.getTime())) return null;

  const step = MONTHS_PER_PERIOD[frequency];
  // Anchor on this year's FY start.
  let candidate = new Date(year, fyStartMonth - 1, 1);
  // Walk forward in period-sized steps until we land on or after MSD.
  // Safety bound: at most 24 iterations (covers a year of monthly cadence twice
  // over) — should never need that many.
  for (let i = 0; i < 24; i++) {
    if (candidate.getTime() >= msd.getTime()) return candidate;
    candidate = new Date(candidate.getFullYear(), candidate.getMonth() + step, 1);
  }
  return candidate;
}

/** Display the next-levy-due date in AU long format, or "—" if unset. */
export function formatLevyDueDisplay(d: Date | null): string {
  if (!d) return "—";
  return d.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
