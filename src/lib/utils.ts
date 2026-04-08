import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Format a date string (YYYY-MM-DD) or Date to "27 February 2026" style.
 */
export function formatDateLong(date: string | Date): string {
  if (typeof date === "string") {
    // If it's a plain date (YYYY-MM-DD), add time to avoid timezone shift
    // If it already has a T (timestamp), use as-is
    const d = date.includes("T") ? new Date(date) : new Date(date + "T00:00:00");
    return d.toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });
  }
  return date.toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });
}
