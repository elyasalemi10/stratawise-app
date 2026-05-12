"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";

// Australian phone input.
//
// - Always +61 country code (shown as a static prefix, not editable).
// - Internally stores E.164 ("+614XXXXXXXX") so server actions don't have to
//   parse spaces. The displayed value is grouped for readability:
//     mobile (04XX):  "4XX XXX XXX"  → +614XXXXXXXX
//     landline (0X):  "X XXXX XXXX"  → +61XXXXXXXXX (where X is 2/3/7/8)
// - Paste handles +61 / 0 / 61 prefixes and strips them.
// - Capped at 9 digits after the +61 (AU mobiles + landlines are 9 digits).

interface PhoneInputProps {
  value: string;
  onChange: (next: string) => void;
  error?: boolean;
  id?: string;
}

function normaliseToAuDigits(raw: string): string {
  let d = raw.replace(/\D/g, "");
  if (d.startsWith("61")) d = d.slice(2);
  if (d.startsWith("0")) d = d.slice(1);
  return d.slice(0, 9);
}

function formatAuDigits(digits: string): string {
  if (digits.length === 0) return "";
  if (digits.startsWith("4")) {
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 3)} ${digits.slice(3)}`;
    return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
  }
  if (digits.length <= 1) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 1)} ${digits.slice(1)}`;
  return `${digits.slice(0, 1)} ${digits.slice(1, 5)} ${digits.slice(5)}`;
}

export function PhoneInput({ value, onChange, error, id }: PhoneInputProps) {
  const displayDigits = useMemo(() => normaliseToAuDigits(value), [value]);
  const displayValue = useMemo(() => formatAuDigits(displayDigits), [displayDigits]);

  function commit(digits: string) {
    onChange(digits.length === 0 ? "+61 " : `+61${digits}`);
  }

  return (
    <div
      className={cn(
        "flex h-9 w-full overflow-hidden rounded-md border bg-background text-sm transition-colors focus-within:ring-2",
        error
          ? "border-destructive focus-within:border-destructive focus-within:ring-destructive/20"
          : "border-border focus-within:border-primary focus-within:ring-primary/20",
      )}
    >
      <div className="flex items-center border-r border-border bg-muted/40 px-3 text-sm font-medium text-muted-foreground select-none">
        +61
      </div>
      <input
        id={id}
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        placeholder="4XX XXX XXX"
        value={displayValue}
        onChange={(e) => commit(normaliseToAuDigits(e.target.value))}
        onPaste={(e) => {
          e.preventDefault();
          const pasted = e.clipboardData.getData("text");
          commit(normaliseToAuDigits(pasted));
        }}
        maxLength={11}
        className="flex-1 bg-transparent px-3 outline-none placeholder:text-muted-foreground"
      />
    </div>
  );
}
