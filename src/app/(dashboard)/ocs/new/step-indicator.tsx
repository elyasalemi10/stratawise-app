"use client";

import { cn } from "@/lib/utils";

const STEPS = [
  { number: 1, label: "Plan" },
  { number: 2, label: "Review" },
  { number: 3, label: "OC basics" },
  { number: 4, label: "Lots" },
  { number: 5, label: "Trust accounts" },
  { number: 6, label: "Rules" },
  { number: 7, label: "Insurance" },
  { number: 8, label: "Opening balances" },
];

export function StepIndicator({ current }: { current: number }) {
  return (
    <div className="mb-8 flex items-center justify-center gap-3">
      {STEPS.map((s, i) => (
        <div key={s.number} className="flex items-center gap-3">
          <div
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium transition-colors",
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
                "h-px w-6 border-t-2",
                s.number < current ? "border-solid border-primary" : "border-dashed border-border",
              )}
            />
          )}
        </div>
      ))}
    </div>
  );
}
