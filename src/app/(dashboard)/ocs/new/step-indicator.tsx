"use client";

import { Building2, Settings2, Users, Landmark, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// The wizard is FOUR main steps. Sub-steps (e.g. 1.0 upload, 1.1 General,
// 1.2 Mgmt fee, 3.0 Lots, 3.1 Service, 3.2 Consent, 3.3 Comms) share the
// parent step's circle , internal navigation only.
//
// Circles are 12 × 12 (was 10) and the label sits at text-sm (was text-xs)
// so the indicator reads as a primary nav landmark, not a footer chip.

type Step = { number: number; label: string; icon: LucideIcon };

const STEPS: Step[] = [
  { number: 1, label: "General", icon: Building2 },
  { number: 2, label: "Settings", icon: Settings2 },
  { number: 3, label: "Lots & Owners", icon: Users },
  { number: 4, label: "Banking", icon: Landmark },
];

export function StepIndicator({ current }: { current: number }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-center gap-x-5 gap-y-4">
      {STEPS.map((s, i) => {
        const isDone = s.number < current;
        const isCurrent = s.number === current;
        const Icon = s.icon;
        return (
          <div key={s.number} className="flex items-start gap-4">
            <div className="flex flex-col items-center gap-2">
              <div
                className={cn(
                  "flex h-12 w-12 shrink-0 items-center justify-center rounded-full transition-colors",
                  (isDone || isCurrent) && "bg-primary text-primary-foreground",
                  !isDone && !isCurrent && "border-2 border-dashed border-border bg-background text-muted-foreground",
                )}
              >
                <Icon className="h-5 w-5" strokeWidth={2} />
              </div>
              <span
                className={cn(
                  "text-sm whitespace-nowrap select-text",
                  isCurrent && "font-semibold text-foreground",
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
                  "mt-6 h-px w-10 shrink-0 border-t-2",
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
