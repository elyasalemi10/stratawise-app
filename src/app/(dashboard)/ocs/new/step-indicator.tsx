"use client";

import { Building2, Settings2, Users, Landmark, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// The wizard is FOUR main steps now. Sub-steps (1.1 / 2.1 / 3.1 / 3.2 / 4.1)
// share the parent step's circle — they're internal navigation and never get
// their own slot in the progress indicator. Each circle holds a lucide icon
// rather than a number; the step name sits centred below the circle.

type Step = { number: number; label: string; icon: LucideIcon };

const STEPS: Step[] = [
  { number: 1, label: "General", icon: Building2 },
  { number: 2, label: "Settings", icon: Settings2 },
  { number: 3, label: "Lots & Owners", icon: Users },
  { number: 4, label: "Banking", icon: Landmark },
];

export function StepIndicator({ current }: { current: number }) {
  return (
    // flex-wrap is preserved so a narrow viewport doesn't force a horizontal
    // scrollbar (forbidden site-wide). Connector lines sit between adjacent
    // circles; their state mirrors the previous circle's done/upcoming state.
    <div className="mb-8 flex flex-wrap items-start justify-center gap-x-4 gap-y-4">
      {STEPS.map((s, i) => {
        const isDone = s.number < current;
        const isCurrent = s.number === current;
        const Icon = s.icon;
        return (
          <div key={s.number} className="flex items-start gap-3">
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors",
                  (isDone || isCurrent) && "bg-primary text-primary-foreground",
                  !isDone && !isCurrent && "border-2 border-dashed border-border bg-background text-muted-foreground",
                )}
              >
                <Icon className="h-4.5 w-4.5" strokeWidth={2} />
              </div>
              <span
                className={cn(
                  "text-xs whitespace-nowrap",
                  isCurrent && "font-medium text-foreground",
                  isDone && "font-medium text-primary",
                  !isDone && !isCurrent && "text-muted-foreground",
                )}
              >
                {s.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={cn(
                  "mt-5 h-px w-8 shrink-0 border-t-2",
                  isDone ? "border-solid border-primary" : "border-dashed border-border",
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
