/**
 * "Just now", "5m ago", "3h ago", "Yesterday", "12 Aug 2026".
 *
 * Recent things get a distance, because that is how people hold them: a
 * document uploaded this morning is "3h ago", not a date you have to compare
 * against today's. Past a week the distance stops meaning anything ("47d
 * ago") and the date is what you actually want.
 */
import { formatDateShort } from "@/lib/format-date";

export function relativeDate(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";

  const seconds = Math.floor((now - then) / 1000);
  // A clock skew or a future date reads as now rather than "-3h ago".
  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  // Calendar days, not 24-hour blocks: something at 11pm last night is
  // "Yesterday" at 1am, which is what a person would call it.
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const startOfThen = new Date(then);
  startOfThen.setHours(0, 0, 0, 0);
  const days = Math.round((startOfToday.getTime() - startOfThen.getTime()) / 86400000);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;

  return formatDateShort(new Date(then));
}
