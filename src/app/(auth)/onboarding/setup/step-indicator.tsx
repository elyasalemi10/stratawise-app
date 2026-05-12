"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const steps = [
  { number: 1, label: "Company" },
  { number: 2, label: "Subdivision" },
];

export function StepIndicator({ currentStep }: { currentStep: number }) {
  return (
    <div className="mb-8">
      <div className="flex items-center justify-between">
        {steps.map((step, i) => (
          <div key={step.number} className="flex items-center flex-1 last:flex-none">
            <div
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-medium transition-colors",
                step.number < currentStep
                  ? "bg-primary text-primary-foreground"
                  : step.number === currentStep
                    ? "bg-primary text-primary-foreground"
                    : "border-2 border-dashed border-border bg-background text-muted-foreground"
              )}
            >
              {step.number < currentStep ? (
                <Check className="h-4 w-4" />
              ) : (
                step.number
              )}
            </div>
            {i < steps.length - 1 && (
              <div
                className={cn(
                  "mx-2 flex-1 border-t-2",
                  step.number < currentStep
                    ? "border-solid border-primary"
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
                  ? "font-medium text-primary"
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
