import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Date formatting lives in @/lib/format-date, which composes the string from
// the date's parts instead of asking the runtime for an en-AU layout. These
// re-exports keep the existing `@/lib/utils` imports working; new code should
// import from format-date directly.
export {
  formatDateLong,
  formatDayMonthShort,
  formatDateRangeLong,
  isoToday,
} from "@/lib/format-date";

