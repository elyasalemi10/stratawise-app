"use client";

import { useMemo } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// Australian BSB input. Digits only, hard-capped at 6 digits, auto-formatted
// as "XXX-XXX". Emits the dashed string (e.g. "063-000"); an empty field emits
// "". Paste of "063000" / "063-000" / "063 000" all normalise the same way.

interface BsbInputProps {
  value: string;
  onChange: (next: string) => void;
  invalid?: boolean;
  id?: string;
  placeholder?: string;
}

function digitsOf(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, 6);
}

function formatBsb(digits: string): string {
  if (digits.length <= 3) return digits;
  return `${digits.slice(0, 3)}-${digits.slice(3)}`;
}

export function BsbInput({ value, onChange, invalid, id, placeholder = "BSB" }: BsbInputProps) {
  const display = useMemo(() => formatBsb(digitsOf(value)), [value]);

  return (
    <Input
      id={id}
      value={display}
      onChange={(e) => {
        const next = formatBsb(digitsOf(e.target.value));
        onChange(next);
      }}
      inputMode="numeric"
      aria-invalid={invalid || undefined}
      placeholder={placeholder}
      className={cn(invalid && "border-destructive")}
    />
  );
}
