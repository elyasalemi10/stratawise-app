"use client";

import { cn } from "@/lib/utils";

const STEPS = [
  { number: 1, label: "Plan" },
  { number: 2, label: "Review" },
  { number: 3, label: "OC basics" },
  { number: 4, label: "Lots" },
  { number: 5, label: "Communications" },
  { number: 6, label: "Committee" },
  { number: 7, label: "Bank accounts" },
  { number: 8, label: "Opening balances" },
];

export function StepIndicator({ current }: { current: number }) {
  return (
    // flex-wrap so a 9-step indicator survives narrow viewports without
    // forcing a horizontal scrollbar on the page. justify-center keeps the
    // wrapped lines balanced. Each step group gets gap-y so wrapped rows
    // breathe vertically.
    <div className="mb-8 flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
      {STEPS.map((s, i) => (
        <div key={s.number} className="flex items-center gap-3">
          <div
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-medium transition-colors",
              s.number === current && "bg-primary text-primary-foreground",
              s.number < current && "bg-primary text-primary-foreground",
              s.number > current && "border-2 border-dashed border-border bg-background text-muted-foreground",
            )}
          >
            {s.number}
          </div>
          <span
            className={cn(
              "text-xs whitespace-nowrap",
              s.number === current && "font-medium text-foreground",
              s.number < current && "font-medium text-primary",
              s.number > current && "text-muted-foreground",
            )}
          >
            {s.label}
          </span>
          {i < STEPS.length - 1 && (
            <div
              className={cn(
                "h-px w-6 shrink-0 border-t-2",
                s.number < current ? "border-solid border-primary" : "border-dashed border-border",
              )}
            />
          )}
        </div>
      ))}
    </div>
  );
}
