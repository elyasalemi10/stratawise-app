"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// Numbers-only input.
//
// CLAUDE.md "All numeric fields use NumberInput" rule: any wizard / form field
// representing a number MUST use this. It rejects 'e', 'E', '+', '-' (the
// scientific-notation pile) at the keystroke level, blocks paste of non-numeric
// content, and stays as `inputMode="decimal"` so mobile shows a number keypad.
// No HTML up/down spinner.
//
// Stores values as STRING, not number — empty string is the "nothing typed"
// sentinel (so `0` and "not yet filled" are distinguishable). Callers parse on
// submit via parseFloat / parseInt as appropriate.
//
// Dollar fields opt-in to `thousandsSeparator` to display "12,345,678" while
// they type. The stored value (the string passed back via onChange) NEVER
// contains commas — callers continue to call parseFloat on it directly.
//
// `prefix` and `suffix` are render slots — typically a small chip (e.g. "$",
// "%", "days", "per year"). Same `+61` affix pattern as `<PhoneInput>`. Caller
// passes ReactNode; the component handles the padding adjustment.

export interface NumberInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "onChange" | "value" | "prefix"> {
  value: string;
  onChange: (next: string) => void;
  /** Allow decimal point (default true). Set false for integer-only fields. */
  allowDecimal?: boolean;
  /** Allow leading minus sign for negative numbers (default false — most app
   *  fields are amounts ≥ 0). */
  allowNegative?: boolean;
  /** Max digits AFTER the decimal point. Default 2 (currency). */
  maxFractionDigits?: number;
  /** Cap total length of the RAW (un-formatted) input. Default 14 (≈ $99,999,999,999.99). */
  maxLength?: number;
  /** Display commas as thousands separators ("12,345,678"). Stored value never
   *  contains commas; the formatting is purely visual. Default false. */
  thousandsSeparator?: boolean;
  invalid?: boolean;
  /** Render-slot affix shown inside the input on the LEFT (e.g. "$"). The
   *  component pads the left edge of the text input to make room. */
  prefix?: React.ReactNode;
  /** Render-slot affix shown inside the input on the RIGHT (e.g. "%", "days",
   *  "per year"). The component pads the right edge of the text input. */
  suffix?: React.ReactNode;
}

function sanitise(
  raw: string,
  { allowDecimal, allowNegative, maxFractionDigits }: {
    allowDecimal: boolean;
    allowNegative: boolean;
    maxFractionDigits: number;
  },
): string {
  // Drop everything except digits, '.', '-'. We re-validate placement below.
  let cleaned = raw.replace(/[^\d.\-]/g, "");

  // Minus only allowed at index 0.
  if (allowNegative) {
    const first = cleaned.startsWith("-") ? "-" : "";
    cleaned = first + cleaned.replace(/-/g, "");
  } else {
    cleaned = cleaned.replace(/-/g, "");
  }

  // Single decimal point.
  if (!allowDecimal) {
    cleaned = cleaned.replace(/\./g, "");
  } else {
    const firstDot = cleaned.indexOf(".");
    if (firstDot >= 0) {
      cleaned = cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, "");
    }
  }

  // Cap fraction digits.
  if (allowDecimal && maxFractionDigits >= 0) {
    const dot = cleaned.indexOf(".");
    if (dot >= 0) {
      cleaned = cleaned.slice(0, dot + 1 + maxFractionDigits);
    }
  }

  return cleaned;
}

// Format a sanitised numeric string with commas in the integer portion.
// Preserves a leading "-" and any decimal portion (including the bare ".").
function formatWithCommas(s: string): string {
  if (!s) return s;
  const negative = s.startsWith("-");
  const unsigned = negative ? s.slice(1) : s;
  const dotIdx = unsigned.indexOf(".");
  const intPart = dotIdx >= 0 ? unsigned.slice(0, dotIdx) : unsigned;
  const fracPart = dotIdx >= 0 ? unsigned.slice(dotIdx) : "";
  // Insert commas every 3 digits from the right.
  const withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "-" : ""}${withCommas}${fracPart}`;
}

export const NumberInput = React.forwardRef<HTMLInputElement, NumberInputProps>(
  function NumberInput(
    {
      value,
      onChange,
      allowDecimal = true,
      allowNegative = false,
      maxFractionDigits = 2,
      maxLength = 14,
      thousandsSeparator = false,
      invalid,
      onKeyDown,
      onPaste,
      className,
      prefix,
      suffix,
      ...rest
    },
    ref,
  ) {
    function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
      // Block 'e' / 'E' (scientific notation), '+'.
      if (e.key === "e" || e.key === "E" || e.key === "+") {
        e.preventDefault();
        return;
      }
      if (!allowNegative && e.key === "-") {
        e.preventDefault();
        return;
      }
      if (!allowDecimal && e.key === ".") {
        e.preventDefault();
        return;
      }
      // Backspace over a comma deletes the digit BEFORE the comma. Without
      // this, the comma sits stubbornly in front of the cursor and a second
      // backspace is needed to actually shrink the number. We only do this
      // in thousands-separator mode where commas exist.
      if (thousandsSeparator && e.key === "Backspace") {
        const target = e.currentTarget;
        const start = target.selectionStart ?? 0;
        const end = target.selectionEnd ?? 0;
        if (start === end && start > 0 && target.value[start - 1] === ",") {
          e.preventDefault();
          // Drop the digit one to the left of the comma.
          const next = target.value.slice(0, start - 2) + target.value.slice(start);
          onChange(sanitise(next, { allowDecimal, allowNegative, maxFractionDigits }));
          return;
        }
      }
      onKeyDown?.(e);
    }

    function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
      const next = sanitise(e.target.value, { allowDecimal, allowNegative, maxFractionDigits });
      if (next.length > maxLength) return;
      onChange(next);
    }

    function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
      const pasted = e.clipboardData.getData("text");
      if (pasted) {
        e.preventDefault();
        const next = sanitise((value ?? "") + pasted, { allowDecimal, allowNegative, maxFractionDigits })
          .slice(0, maxLength);
        onChange(next);
      }
      onPaste?.(e);
    }

    const display = thousandsSeparator ? formatWithCommas(value) : value;

    if (!prefix && !suffix) {
      return (
        <Input
          ref={ref}
          type="text"
          inputMode={allowDecimal ? "decimal" : "numeric"}
          autoComplete="off"
          value={display}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          aria-invalid={invalid || undefined}
          className={className}
          {...rest}
        />
      );
    }

    // With an affix we render a single rounded shell with grey prefix / suffix
    // chips and a borderless input in between. Matches the +61 PhoneInput so
    // every "static prefix on an input" reads the same way site-wide.
    return (
      <div
        className={cn(
          "flex h-9 w-full overflow-hidden rounded-md border bg-card text-sm transition-colors focus-within:ring-2",
          invalid
            ? "border-destructive focus-within:border-destructive focus-within:ring-destructive/20"
            : "border-border focus-within:border-primary focus-within:ring-primary/20",
          className,
        )}
      >
        {prefix && (
          <div className="flex items-center border-r border-border bg-cool-muted px-3 text-sm font-medium text-cool-muted-foreground select-none">
            {prefix}
          </div>
        )}
        <input
          ref={ref}
          type="text"
          inputMode={allowDecimal ? "decimal" : "numeric"}
          autoComplete="off"
          value={display}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          aria-invalid={invalid || undefined}
          className="flex-1 min-w-0 bg-transparent px-3 outline-none placeholder:text-muted-foreground"
          {...rest}
        />
        {suffix && (
          <div className="flex items-center border-l border-border bg-cool-muted px-3 text-sm font-medium text-cool-muted-foreground select-none">
            {suffix}
          </div>
        )}
      </div>
    );
  },
);
