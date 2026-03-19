"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { StepIndicator } from "./step-indicator";
import { Step1General } from "./steps/step-1-general";
import { Step2Settings } from "./steps/step-2-settings";
import { Step3Banking } from "./steps/step-3-banking";
import { Step4Lots } from "./steps/step-4-lots";
import { Step5Balances } from "./steps/step-5-balances";

const STEP_TITLES: Record<number, { title: string; subtitle: string }> = {
  1: { title: "Create new subdivision", subtitle: "Set up a new owners corporation" },
  2: { title: "Advanced settings", subtitle: "Configure financial year and levy schedule" },
  3: { title: "Banking details", subtitle: "Set up bank account for this subdivision" },
  4: { title: "Strata membership", subtitle: "Add lots and assign owners" },
  5: { title: "Opening balances", subtitle: "Enter current fund balances" },
};

function WizardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const step = parseInt(searchParams.get("step") ?? "1", 10);
  const subdivisionId = searchParams.get("id") ?? "";
  const currentStep = Math.max(1, Math.min(5, step));

  const { title, subtitle } = STEP_TITLES[currentStep] ?? STEP_TITLES[1];

  function goToStep(s: number, id?: string) {
    const sid = id ?? subdivisionId;
    const params = new URLSearchParams();
    params.set("step", String(s));
    if (sid) params.set("id", sid);
    window.history.replaceState(null, "", `/subdivisions/new?${params.toString()}`);
    router.replace(`/subdivisions/new?${params.toString()}`);
  }

  return (
    <div className="max-w-5xl">
      <StepIndicator
        currentStep={currentStep}
        onStepClick={(s) => goToStep(s)}
      />

      <div className="mb-6">
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
      </div>

      <Card>
        <CardContent className="pt-5">
          {currentStep === 1 && (
            <Step1General
              onNext={(id) => goToStep(2, id)}
              onCancel={() => router.push("/subdivisions")}
            />
          )}
          {currentStep === 2 && subdivisionId && (
            <Step2Settings
              subdivisionId={subdivisionId}
              onNext={() => goToStep(3)}
              onBack={() => goToStep(1)}
            />
          )}
          {currentStep === 3 && subdivisionId && (
            <Step3Banking
              subdivisionId={subdivisionId}
              onNext={() => goToStep(4)}
              onBack={() => goToStep(2)}
            />
          )}
          {currentStep === 4 && subdivisionId && (
            <Step4Lots
              subdivisionId={subdivisionId}
              onNext={() => goToStep(5)}
              onBack={() => goToStep(3)}
            />
          )}
          {currentStep === 5 && subdivisionId && (
            <Step5Balances
              subdivisionId={subdivisionId}
              onComplete={() => router.push(`/subdivisions/${subdivisionId}/dashboard`)}
              onBack={() => goToStep(4)}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function NewSubdivisionPage() {
  return (
    <Suspense>
      <WizardContent />
    </Suspense>
  );
}
