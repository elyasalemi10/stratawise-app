"use client";

import { useRef, useMemo } from "react";
import { cn } from "@/lib/utils";

interface OtpInputProps {
  value: string;
  onChange: (next: string) => void;
  onComplete?: (next: string) => void;
  length?: number;
  disabled?: boolean;
  invalid?: boolean;
  autoFocus?: boolean;
}

// Six separate digit boxes with full keyboard handling:
// - Type a digit  → auto-advances focus
// - Backspace     → clears current cell, or moves back if empty
// - ArrowLeft/Right → moves focus
// - Paste         → distributes pasted digits across cells, focuses last filled
// - One-time-code autocomplete on the first cell so iOS SMS suggestions work
export function OtpInput({
  value,
  onChange,
  onComplete,
  length = 6,
  disabled,
  invalid,
  autoFocus,
}: OtpInputProps) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);

  const digits = useMemo(() => {
    const arr = new Array(length).fill("");
    for (let i = 0; i < Math.min(value.length, length); i++) {
      arr[i] = value[i];
    }
    return arr;
  }, [value, length]);

  function commit(next: string) {
    const cleaned = next.slice(0, length);
    onChange(cleaned);
    if (cleaned.length === length && onComplete) onComplete(cleaned);
  }

  function handleChange(idx: number, e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    const cleaned = raw.replace(/\D/g, "");

    if (!cleaned) {
      const next = [...digits];
      next[idx] = "";
      commit(next.join(""));
      return;
    }

    if (cleaned.length === 1) {
      const next = [...digits];
      next[idx] = cleaned;
      commit(next.join(""));
      if (idx < length - 1) refs.current[idx + 1]?.focus();
      return;
    }

    // Multi-char (browser auto-fill into a single field, or rapid type)
    const chars = cleaned.split("").slice(0, length - idx);
    const next = [...digits];
    chars.forEach((c, i) => {
      next[idx + i] = c;
    });
    commit(next.join(""));
    refs.current[Math.min(idx + chars.length, length - 1)]?.focus();
  }

  function handleKeyDown(idx: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace") {
      if (digits[idx]) {
        const next = [...digits];
        next[idx] = "";
        commit(next.join(""));
      } else if (idx > 0) {
        e.preventDefault();
        const next = [...digits];
        next[idx - 1] = "";
        commit(next.join(""));
        refs.current[idx - 1]?.focus();
      }
      return;
    }
    if (e.key === "ArrowLeft" && idx > 0) {
      e.preventDefault();
      refs.current[idx - 1]?.focus();
      return;
    }
    if (e.key === "ArrowRight" && idx < length - 1) {
      e.preventDefault();
      refs.current[idx + 1]?.focus();
      return;
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
    if (!pasted) return;
    commit(pasted);
    const focusIdx = Math.min(pasted.length, length - 1);
    refs.current[focusIdx]?.focus();
  }

  return (
    <div className="flex justify-center gap-2">
      {Array.from({ length }).map((_, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          autoComplete={i === 0 ? "one-time-code" : "off"}
          autoFocus={autoFocus && i === 0}
          value={digits[i]}
          onChange={(e) => handleChange(i, e)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={handlePaste}
          onFocus={(e) => e.target.select()}
          disabled={disabled}
          aria-invalid={invalid || undefined}
          className={cn(
            "size-12 rounded-md border bg-background text-center text-2xl font-semibold tabular-nums transition-colors",
            "focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            invalid
              ? "border-destructive focus:ring-destructive/20 focus:border-destructive"
              : "border-border",
          )}
        />
      ))}
    </div>
  );
}
