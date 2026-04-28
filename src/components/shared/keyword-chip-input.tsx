"use client";

// ============================================================================
// KeywordChipInput — chip-style multi-value text input
// ----------------------------------------------------------------------------
// Validation runs TWICE by design:
//   1. INLINE on every chip commit (this component, via the `validate` prop) —
//      prevents bad chips from being added; surfaces errors immediately.
//   2. ON SUBMIT (the consuming form's responsibility) — guardrail in case
//      the `validate` prop is mis-supplied or the array-level Zod schema
//      has constraints the per-item validator doesn't (e.g. max-count).
//
// Wrap your Zod itemSchema's `safeParse` in a `validate` prop. The component
// itself stays validator-agnostic so non-Zod consumers can use it too.
//
// Commit triggers: Enter, comma, blur (only if draft non-empty).
// Backspace on empty draft removes the last chip.
// ============================================================================

import {
  useCallback,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

export type ValidateResult =
  | { ok: true; cleaned: string }
  | { ok: false; error: string };

type KeywordChipInputProps = {
  value: string[];
  onChange: (next: string[]) => void;
  /** Per-item validator. Receives the raw input; returns a cleaned
   *  (normalised) string or an error message. Wrap your Zod itemSchema's
   *  `safeParse` here. */
  validate?: (item: string) => ValidateResult;
  /** Hard cap on chip count. Component refuses additional commits past this. */
  maxItems?: number;
  /** Reject duplicates after `validate` cleaning. Defaults to true. */
  dedupe?: boolean;
  placeholder?: string;
  label?: string;
  description?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
};

const DEFAULT_VALIDATE: NonNullable<KeywordChipInputProps["validate"]> = (
  raw,
) => {
  const cleaned = raw.trim();
  if (!cleaned) return { ok: false, error: "Cannot be empty" };
  return { ok: true, cleaned };
};

export function KeywordChipInput({
  value,
  onChange,
  validate = DEFAULT_VALIDATE,
  maxItems,
  dedupe = true,
  placeholder = "Type and press Enter…",
  label,
  description,
  disabled,
  className,
  id,
}: KeywordChipInputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const commit = useCallback(() => {
    const raw = draft;
    if (!raw.trim()) {
      setDraft("");
      return;
    }
    if (typeof maxItems === "number" && value.length >= maxItems) {
      setError(
        `At most ${maxItems} ${maxItems === 1 ? "keyword" : "keywords"}`,
      );
      return;
    }
    const result = validate(raw);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    if (dedupe && value.includes(result.cleaned)) {
      setError("Already added");
      return;
    }
    onChange([...value, result.cleaned]);
    setDraft("");
    setError(null);
  }, [draft, validate, value, onChange, maxItems, dedupe]);

  const removeAt = useCallback(
    (idx: number) => {
      onChange(value.filter((_, i) => i !== idx));
      setError(null);
    },
    [value, onChange],
  );

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commit();
      return;
    }
    if (e.key === "Backspace" && draft === "" && value.length > 0) {
      e.preventDefault();
      removeAt(value.length - 1);
    }
  };

  const overCap =
    typeof maxItems === "number" && value.length >= maxItems;

  return (
    <div className={cn("space-y-1.5", className)}>
      {label && (
        <Label
          htmlFor={inputId}
          className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
        >
          {label}
        </Label>
      )}
      <div
        className={cn(
          "flex flex-wrap items-center gap-1.5 rounded-md border bg-background px-2 py-1.5 min-h-9",
          "focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20",
          error ? "border-destructive" : "border-border",
          disabled && "opacity-60 pointer-events-none",
        )}
        onClick={() => inputRef.current?.focus()}
      >
        {value.map((kw, idx) => (
          <Badge
            key={`${kw}-${idx}`}
            variant="neutral"
            className="gap-1 max-w-full"
          >
            <span className="truncate">{kw}</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                removeAt(idx);
              }}
              aria-label={`Remove ${kw}`}
              className="ml-0.5 rounded-full p-0.5 hover:bg-foreground/10"
              tabIndex={-1}
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
        <input
          ref={inputRef}
          id={inputId}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            if (error) setError(null);
          }}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            if (draft.trim()) commit();
          }}
          placeholder={value.length === 0 ? placeholder : ""}
          disabled={disabled || overCap}
          aria-invalid={Boolean(error)}
          className={cn(
            "flex-1 min-w-[8rem] bg-transparent text-sm outline-none",
            "placeholder:text-muted-foreground disabled:cursor-not-allowed",
          )}
        />
      </div>
      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
      {description && !error && (
        <p className="text-xs text-muted-foreground">{description}</p>
      )}
    </div>
  );
}
