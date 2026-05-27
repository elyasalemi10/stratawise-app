// Pure period / cadence helpers shared between the levy server actions
// and the auto-send schedule code. Lives outside "use server" so the
// non-async exports compile.

export function getPeriodsForCycle(cycle: string): number {
  switch (cycle) {
    case "monthly": return 12;
    case "quarterly": return 4;
    case "half_yearly": return 2;
    case "annually": return 1;
    default: return 4;
  }
}

export function getPeriodDates(
  fyStartMonth: number,
  fyStartYear: number,
  periodIndex: number,
  periodsPerYear: number,
): { start: string; end: string; label: string } {
  const monthsPerPeriod = 12 / periodsPerYear;
  const startMonth = ((fyStartMonth - 1) + periodIndex * monthsPerPeriod) % 12;
  const startYear = fyStartYear + Math.floor(((fyStartMonth - 1) + periodIndex * monthsPerPeriod) / 12);

  const endPeriodMonth = ((fyStartMonth - 1) + (periodIndex + 1) * monthsPerPeriod) % 12;
  const endYear = fyStartYear + Math.floor(((fyStartMonth - 1) + (periodIndex + 1) * monthsPerPeriod) / 12);

  // CRITICAL: build dates with Date.UTC so .toISOString() doesn't
  // shift the day by one in non-UTC timezones. Without this, a server
  // (or dev machine) in Melbourne sees "first levy = 30 Jun" for an
  // FY starting July, because new Date(y, m, 1) is LOCAL midnight which
  // is 14:00 UTC the previous day.
  const start = new Date(Date.UTC(startYear, startMonth, 1));
  const end = new Date(Date.UTC(endYear, endPeriodMonth, 0));

  const formatDate = (d: Date) => d.toISOString().split("T")[0];

  let label: string;
  if (periodsPerYear === 4) {
    label = `Q${periodIndex + 1}`;
  } else if (periodsPerYear === 2) {
    label = `H${periodIndex + 1}`;
  } else if (periodsPerYear === 1) {
    label = "Annual";
  } else {
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    label = monthNames[startMonth];
  }

  return { start: formatDate(start), end: formatDate(end), label };
}
