"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

// Native HTML date input styled with our colour scheme.
//
// Built per user spec override of CLAUDE.md's "no native date inputs" rule —
// the popover-Calendar `<DatePicker>` was deemed visually unfamiliar; the
// browser's native picker chrome (with our colours) feels more like a regular
// form field. Used only on the wizard surface.
//
// Value contract matches `<DatePicker>`: ISO yyyy-mm-dd string. Empty string
// when nothing is selected. `error` paints the border red on submit failures
// (same pattern as the rest of the wizard).

interface Props extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "onChange"> {
  value: string;
  onChange: (next: string) => void;
  error?: boolean;
}

export const NativeDateInput = React.forwardRef<HTMLInputElement, Props>(function NativeDateInput(
  { value, onChange, error, className, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      type="date"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-invalid={error || undefined}
      className={cn(
        "flex h-9 w-full items-center rounded-md border bg-card px-3 text-sm font-normal text-foreground",
        "transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
        "aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20",
        error ? "border-destructive" : "border-border",
        // The default WebKit date picker indicator is grey; tint it to our
        // muted-foreground so it doesn't fight the rest of the form.
        "[&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-60 [&::-webkit-calendar-picker-indicator]:hover:opacity-100",
        className,
      )}
      {...rest}
    />
  );
});
