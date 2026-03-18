"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { StepIndicator } from "./step-indicator";
import { StepCompany } from "./step-company";
import { StepSubdivision } from "./step-subdivision";
import { StepAvatar } from "./step-avatar";
import { StepComplete } from "./step-complete";

function SetupWizardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const step = Number(searchParams.get("step") ?? "1");

  function goToStep(n: number) {
    router.push(`/onboarding/setup?step=${n}`);
  }

  return (
    <div className="w-full max-w-2xl mx-auto">
      <StepIndicator currentStep={step} />

      <div className="rounded-lg border border-border bg-card p-6 shadow-none">
        {step === 1 && <StepCompany onNext={() => goToStep(2)} />}
        {step === 2 && (
          <StepSubdivision
            onNext={() => goToStep(3)}
            onBack={() => goToStep(1)}
          />
        )}
        {step === 3 && (
          <StepAvatar
            onNext={() => goToStep(4)}
            onBack={() => goToStep(2)}
          />
        )}
        {step === 4 && <StepComplete />}
      </div>
    </div>
  );
}

export default function SetupPage() {
  return (
    <Suspense>
      <SetupWizardContent />
    </Suspense>
  );
}
