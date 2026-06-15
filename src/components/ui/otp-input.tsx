"use client";

import { useRef } from "react";
import { cn } from "@/lib/utils";

// Six-box one-time-code entry. Each digit lives in its own square box;
// typing advances to the next box, backspace on an empty box steps back,
// and pasting a full code fills every box at once. The value is held by
// the parent as a single string ("" through "123456") so callers validate
// exactly as they did with a plain <Input>.
interface OtpInputProps {
  value: string;
  onChange: (value: string) => void;
  length?: number;
  invalid?: boolean;
  autoFocus?: boolean;
  disabled?: boolean;
  onComplete?: (value: string) => void;
}

export function OtpInput({
  value,
  onChange,
  length = 6,
  invalid = false,
  autoFocus = false,
  disabled = false,
  onComplete,
}: OtpInputProps) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  const digits = value.split("").slice(0, length);

  function setDigit(index: number, digit: string) {
    const next = value.split("");
    next[index] = digit;
    const joined = next.join("").replace(/\D/g, "").slice(0, length);
    onChange(joined);
    return joined;
  }

  function focusBox(index: number) {
    const el = refs.current[index];
    if (el) {
      el.focus();
      el.select();
    }
  }

  function handleChange(index: number, raw: string) {
    const cleaned = raw.replace(/\D/g, "");
    if (!cleaned) return;
    // A single new character: drop it in this box and advance. If the user
    // typed/pasted several, spread them across the following boxes.
    const chars = cleaned.split("");
    const next = value.split("");
    let cursor = index;
    for (const c of chars) {
      if (cursor >= length) break;
      next[cursor] = c;
      cursor += 1;
    }
    const joined = next.join("").replace(/\D/g, "").slice(0, length);
    onChange(joined);
    if (joined.length >= length) {
      onComplete?.(joined);
      focusBox(length - 1);
    } else {
      focusBox(Math.min(cursor, length - 1));
    }
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace") {
      e.preventDefault();
      if (digits[index]) {
        setDigit(index, "");
      } else if (index > 0) {
        setDigit(index - 1, "");
        focusBox(index - 1);
      }
    } else if (e.key === "ArrowLeft" && index > 0) {
      e.preventDefault();
      focusBox(index - 1);
    } else if (e.key === "ArrowRight" && index < length - 1) {
      e.preventDefault();
      focusBox(index + 1);
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
    if (!pasted) return;
    onChange(pasted);
    if (pasted.length >= length) {
      onComplete?.(pasted);
      focusBox(length - 1);
    } else {
      focusBox(pasted.length);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {Array.from({ length }).map((_, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="text"
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus={autoFocus && i === 0}
          disabled={disabled}
          maxLength={1}
          value={digits[i] ?? ""}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={handlePaste}
          onFocus={(e) => e.target.select()}
          aria-invalid={invalid || undefined}
          className={cn(
            "h-12 w-12 rounded-md border border-border bg-card text-center text-lg font-semibold tabular-nums text-foreground transition-colors",
            "focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20",
            "aria-invalid:border-destructive aria-invalid:focus:ring-destructive/20",
            "disabled:cursor-not-allowed disabled:opacity-50",
          )}
        />
      ))}
    </div>
  );
}
