import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Format a date string (YYYY-MM-DD) or Date to "27 February 2026" style.
 */
export function formatDateLong(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date + "T00:00:00") : date;
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });
}
