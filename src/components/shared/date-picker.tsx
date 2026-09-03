"use client";

import { useState } from "react";
import { format } from "date-fns";
import { CalendarIcon, ChevronDownIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

// The one date control in the app. Never <input type="date">.
//
// This used to hand-roll the whole popover: a portal into document.body, a
// getBoundingClientRect position recomputed on scroll and resize, a
// click-outside listener, and an SSR guard via useSyncExternalStore. About a
// hundred and thirty lines reimplementing, less well, what <Popover> already
// does , it portals, it positions, it closes on outside click and Escape,
// and it escapes any overflow-hidden ancestor, which was the whole reason
// the bespoke version existed.
//
// Selected day is navy: the Calendar paints data-selected-single with
// bg-primary, and --primary is midnight.
//
// The public API is unchanged: a YYYY-MM-DD string in, a YYYY-MM-DD string
// out. Every call site keeps working.

interface DatePickerProps {
  /** ISO date string, YYYY-MM-DD. Empty string for no selection. */
  value: string;
  onChange: (value: string) => void;
  error?: boolean;
  /** Alias for `error`; matches the convention used by NumberInput /
   *  PhoneInput so submit-time validation can flip a single prop. */
  invalid?: boolean;
  id?: string;
  placeholder?: string;
  disabled?: boolean;
  /** Earliest selectable date (YYYY-MM-DD). Dates before this are
   *  disabled in the calendar. Used to enforce "end >= start" pairs. */
  minDate?: string;
  /** Latest selectable date (YYYY-MM-DD). */
  maxDate?: string;
}

/** Local-noon parse. `new Date("2026-03-01")` is parsed as UTC midnight,
 *  which is the previous day in every Australian timezone. */
function parseISO(v: string): Date | undefined {
  return v ? new Date(`${v}T00:00:00`) : undefined;
}

/** Format back to YYYY-MM-DD using LOCAL parts, never toISOString(), which
 *  would shift the date across the UTC boundary. */
function toISO(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function DatePicker({
  value,
  onChange,
  error,
  invalid,
  id,
  placeholder = "Pick a date",
  disabled,
  minDate,
  maxDate,
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const hasError = Boolean(error || invalid);
  const date = parseISO(value);

  const min = parseISO(minDate ?? "");
  const max = parseISO(maxDate ?? "");
  const isOutOfRange = (d: Date) => (min ? d < min : false) || (max ? d > max : false);

  return (
    // The wrapper is load-bearing.
    //
    // Base UI's Popover.Root renders no element of its own, so its trigger
    // AND the focus-guard spans it mounts on open become direct children of
    // whatever contains this component , usually a `space-y-1.5` field
    // group. `space-y-*` is `> * + *`, which applies to every sibling after
    // the first regardless of whether it is in flow, so the guards appearing
    // on open added a 6px margin and pushed the next field down. Opening a
    // date picker visibly nudged the rest of the form.
    //
    // Keeping the guards inside our own element means the field group only
    // ever sees one child, and nothing moves.
    <div className="relative">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          id={id}
          disabled={disabled}
          render={<Button variant="secondary" type="button" />}
          className={cn(
            "h-9 w-full justify-between px-3 font-normal",
            // A field, not a button: white fill with the input border, so it
            // reads as somewhere you enter something. Secondary's borderless
            // grey was invisible once the page went white.
            "border border-input bg-card hover:bg-card",
            hasError && "border-destructive",
            !date && "text-muted-foreground",
          )}
          aria-invalid={hasError || undefined}
        >
          <span className="flex min-w-0 items-center">
            <CalendarIcon className="mr-2 size-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{date ? format(date, "d MMM yyyy") : placeholder}</span>
          </span>
          <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" />
        </PopoverTrigger>

        <PopoverContent
          align="start"
          showBackdrop={false}
          className="w-auto overflow-hidden p-0"
        >
          <Calendar
            mode="single"
            selected={date}
            defaultMonth={date}
            disabled={isOutOfRange}
            onSelect={(d) => {
              if (!d) return;
              onChange(toISO(d));
              setOpen(false);
            }}
            className="rounded-lg border"
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
