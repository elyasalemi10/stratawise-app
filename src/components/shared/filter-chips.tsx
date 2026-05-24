"use client";

// ============================================================================
// FilterChips , multi-select filter chip primitive
// ----------------------------------------------------------------------------
// Renders a horizontal row of toggle chips. Each chip flips its own value
// in the supplied Set. The component is fully controlled , pair it with
// `useMultiUrlState` (or any other Set-shaped state) for URL-state
// persistence.
//
// Layout matches CLAUDE.md guidance: rounded-full chips (allowed for
// "badges"), wraps via `flex flex-wrap gap-2` on narrow viewports, no
// shadow.
// ============================================================================

import { cn } from "@/lib/utils";

type Option<T extends string> = {
  value: T;
  label: string;
  /** Optional badge-like count rendered alongside the label. */
  count?: number;
};

type FilterChipsProps<T extends string> = {
  label: string;
  options: Option<T>[];
  value: Set<T>;
  onChange: (next: Set<T>) => void;
  className?: string;
  /** Render the label visually-hidden but keep it for screen readers. */
  hideLabel?: boolean;
};

export function FilterChips<T extends string>({
  label,
  options,
  value,
  onChange,
  className,
  hideLabel = false,
}: FilterChipsProps<T>) {
  const toggle = (opt: T) => {
    const next = new Set(value);
    if (next.has(opt)) {
      next.delete(opt);
    } else {
      next.add(opt);
    }
    onChange(next);
  };

  return (
    <div
      role="group"
      aria-label={label}
      className={cn("space-y-1.5", className)}
    >
      <div
        className={cn(
          "text-xs font-medium uppercase tracking-wide text-muted-foreground",
          hideLabel && "sr-only",
        )}
      >
        {label}
      </div>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const active = value.has(opt.value);
          return (
            <button
              key={opt.value}
              type="button"
              aria-pressed={active}
              onClick={() => toggle(opt.value)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium",
                "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                active
                  ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90"
                  : "border-border bg-background text-foreground hover:bg-muted",
              )}
            >
              <span>{opt.label}</span>
              {typeof opt.count === "number" && (
                <span
                  className={cn(
                    "tabular-nums text-[10px] font-normal",
                    active
                      ? "text-primary-foreground/80"
                      : "text-muted-foreground",
                  )}
                >
                  {opt.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
