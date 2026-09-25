// Dates, day first, everywhere, built from the parts rather than asked for.
//
// Every date in the app already asked for "en-AU". That is the correct
// request and it is not a guarantee: `toLocaleDateString` needs ICU data for
// the locale it is handed, and a Node build without the full set resolves
// en-AU to en-US without saying so. The same call then renders 09/05/2026 or
// "September 5, 2026" in production while showing 05/09/2026 on the machine
// it was written on, which is the worst shape a bug can take on a document
// that goes to an owner, a lender or a conveyancer. An Australian reading
// 03/04/2026 on a levy notice has no way to tell which day is meant.
//
// So the order is ours. These compose the string from getDate(), getMonth()
// and getFullYear() against a hard-coded month table. No locale is consulted
// for ORDER or for month names, and nothing about the deployment can change
// what comes out.
//
// Anything that must round-trip through a database or a URL stays ISO
// (YYYY-MM-DD) and does not belong here. This module is for text a person
// reads.

const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

const WEEKDAYS_LONG = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
] as const;

const WEEKDAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export type DateInput = string | Date | null | undefined;

/**
 * A date value as a Date, or null when there is nothing to show.
 *
 * A plain YYYY-MM-DD is a calendar date, not an instant, so it is read at
 * local midnight. `new Date("2026-09-05")` is parsed as UTC midnight, which
 * is the previous day anywhere west of Greenwich; appending the time forces
 * the local reading and the date stays the date the database recorded.
 */
export function toDate(value: DateInput): Date | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;

  const trimmed = value.trim();
  if (!trimmed) return null;
  const isPlainDate = /^\d{4}-\d{2}-\d{2}$/.test(trimmed);
  const d = new Date(isPlainDate ? `${trimmed}T00:00:00` : trimmed);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "05/09/2026". Zero-padded, day first, for anywhere a number is wanted. */
export function formatDateNumeric(value: DateInput): string {
  const d = toDate(value);
  if (!d) return "";
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  return `${day}/${month}/${d.getFullYear()}`;
}

/** "5 September 2026". The default for documents and anything formal. */
export function formatDateLong(value: DateInput): string {
  const d = toDate(value);
  if (!d) return "";
  return `${d.getDate()} ${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}`;
}

/** "5 Sep 2026". For tables and anywhere the long form would crowd. */
export function formatDateShort(value: DateInput): string {
  const d = toDate(value);
  if (!d) return "";
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}

/** "5 Sep". Inside a range where the year is already established. */
export function formatDayMonthShort(value: DateInput): string {
  const d = toDate(value);
  if (!d) return "";
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}

/** "Sep 2026". */
export function formatMonthYearShort(value: DateInput): string {
  const d = toDate(value);
  if (!d) return "";
  return `${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}

/** "Sep 26". */
export function formatMonthYear2Digit(value: DateInput): string {
  const d = toDate(value);
  if (!d) return "";
  return `${MONTHS_SHORT[d.getMonth()]} ${String(d.getFullYear()).slice(-2)}`;
}

/** "05 September 2026". Zero-padded day, for a document that sets its dates
 *  in a column and wants them to line up. */
export function formatDateLongPadded(value: DateInput): string {
  const d = toDate(value);
  if (!d) return "";
  return `${String(d.getDate()).padStart(2, "0")} ${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}`;
}

/** "05 Sep 2026". */
export function formatDateShortPadded(value: DateInput): string {
  const d = toDate(value);
  if (!d) return "";
  return `${String(d.getDate()).padStart(2, "0")} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}

/** "Sat, 5 Sep 2026". */
export function formatDateWithWeekdayShort(value: DateInput): string {
  const d = toDate(value);
  if (!d) return "";
  return `${WEEKDAYS_SHORT[d.getDay()]}, ${formatDateShort(d)}`;
}

/** "Saturday, 5 September 2026". */
export function formatDateWithWeekdayLong(value: DateInput): string {
  const d = toDate(value);
  if (!d) return "";
  return `${WEEKDAYS_LONG[d.getDay()]}, ${formatDateLong(d)}`;
}

/**
 * "3:04 pm". Lower case and no leading zero, which is how the hour is
 * written here; en-US would give "3:04 PM" and some locales a 24-hour clock.
 */
export function formatTimeOfDay(value: DateInput): string {
  const d = toDate(value);
  if (!d) return "";
  const hours24 = d.getHours();
  const suffix = hours24 < 12 ? "am" : "pm";
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return `${hours12}:${String(d.getMinutes()).padStart(2, "0")} ${suffix}`;
}

/** "03:04 pm". Zero-padded hour, where times sit in a column. */
export function formatTimeOfDayPadded(value: DateInput): string {
  const d = toDate(value);
  if (!d) return "";
  const hours24 = d.getHours();
  const suffix = hours24 < 12 ? "am" : "pm";
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return `${String(hours12).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")} ${suffix}`;
}

/** "5 Sep 2026, 3:04 pm". */
export function formatDateTimeShort(value: DateInput): string {
  const d = toDate(value);
  if (!d) return "";
  return `${formatDateShort(d)}, ${formatTimeOfDay(d)}`;
}

/** "Sat, 5 Sep 2026, 3:04 pm". */
export function formatDateTimeWithWeekdayShort(value: DateInput): string {
  const d = toDate(value);
  if (!d) return "";
  return `${formatDateWithWeekdayShort(d)}, ${formatTimeOfDay(d)}`;
}

/** "Saturday, 5 September 2026, 3:04 pm". */
export function formatDateTimeWithWeekdayLong(value: DateInput): string {
  const d = toDate(value);
  if (!d) return "";
  return `${formatDateWithWeekdayLong(d)}, ${formatTimeOfDay(d)}`;
}

/** "1 April - 30 June". A hyphen, not a comma or a dash. */
export function formatDateRangeLong(start: DateInput, end: DateInput): string {
  return `${formatDateLong(start)} - ${formatDateLong(end)}`;
}

/**
 * Today as YYYY-MM-DD in the viewer's own timezone.
 *
 * For default values on <DatePicker>, which speaks plain date strings. Never
 * `new Date().toISOString().slice(0, 10)`: that is UTC and lands on the
 * wrong day for an Australian user before 10am.
 */
export function isoToday(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}
