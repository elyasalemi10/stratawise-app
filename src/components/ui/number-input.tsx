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

export interface NumberInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "onChange" | "value"> {
  value: string;
  onChange: (next: string) => void;
  /** Allow decimal point (default true). Set false for integer-only fields. */
  allowDecimal?: boolean;
  /** Allow leading minus sign for negative numbers (default false — most app
   *  fields are amounts ≥ 0). */
  allowNegative?: boolean;
  /** Max digits AFTER the decimal point. Default 2 (currency). */
  maxFractionDigits?: number;
  /** Cap total length of the input. Default 14 (≈ $99,999,999,999.99). */
  maxLength?: number;
  invalid?: boolean;
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

export const NumberInput = React.forwardRef<HTMLInputElement, NumberInputProps>(
  function NumberInput(
    {
      value,
      onChange,
      allowDecimal = true,
      allowNegative = false,
      maxFractionDigits = 2,
      maxLength = 14,
      invalid,
      onKeyDown,
      onPaste,
      className,
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

    return (
      <Input
        ref={ref}
        type="text"
        inputMode={allowDecimal ? "decimal" : "numeric"}
        autoComplete="off"
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        aria-invalid={invalid || undefined}
        className={cn(className)}
        {...rest}
      />
    );
  },
);
