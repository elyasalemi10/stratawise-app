"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const steps = [
  { number: 1, label: "General" },
  { number: 2, label: "Settings" },
  { number: 3, label: "Banking" },
  { number: 4, label: "Bank feeds" },
  { number: 5, label: "Lots" },
  { number: 6, label: "Balances" },
];

export function StepIndicator({
  currentStep,
  onStepClick,
}: {
  currentStep: number;
  onStepClick?: (step: number) => void;
}) {
  return (
    <div className="mb-8">
      <div className="flex items-center justify-between">
        {steps.map((step, i) => (
          <div key={step.number} className="flex items-center flex-1 last:flex-none">
            <button
              type="button"
              disabled={step.number > currentStep}
              onClick={() => step.number < currentStep && onStepClick?.(step.number)}
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-medium transition-colors",
                step.number < currentStep
                  ? "bg-[hsl(160,100%,37%)] text-white cursor-pointer"
                  : step.number === currentStep
                    ? "bg-primary text-white"
                    : "border-2 border-dashed border-border bg-background text-muted-foreground"
              )}
            >
              {step.number < currentStep ? (
                <Check className="h-4 w-4" />
              ) : (
                step.number
              )}
            </button>
            {i < steps.length - 1 && (
              <div
                className={cn(
                  "mx-2 flex-1 border-t-2",
                  step.number < currentStep
                    ? "border-solid border-[hsl(160,100%,37%)]"
                    : "border-dashed border-border"
                )}
              />
            )}
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between">
        {steps.map((step) => (
          <p
            key={step.number}
            className={cn(
              "text-xs",
              step.number === currentStep
                ? "font-medium text-foreground"
                : step.number < currentStep
                  ? "font-medium text-[hsl(160,100%,37%)]"
                  : "text-muted-foreground"
            )}
          >
            {step.label}
          </p>
        ))}
      </div>
    </div>
  );
}
