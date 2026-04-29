"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StepIndicator } from "./step-indicator";
import { Step1General } from "./steps/step-1-general";
import { Step2Settings } from "./steps/step-2-settings";
import { Step3Banking } from "./steps/step-3-banking";
import { Step4BankFeeds } from "./steps/step-4-bank-feeds";
import { Step4Lots } from "./steps/step-4-lots";
import { Step5Balances } from "./steps/step-5-balances";
import { getSubdivisionWizardData } from "./actions";

const STEP_TITLES: Record<number, { title: string; subtitle: string }> = {
  1: { title: "Create new subdivision", subtitle: "Set up a new owners corporation" },
  2: { title: "Advanced settings", subtitle: "Configure financial year and levy schedule" },
  3: { title: "Banking details", subtitle: "Set up bank account for this subdivision" },
  4: { title: "Connect bank feeds", subtitle: "Optional. Link the bank accounts you just added to automatic transaction syncing." },
  5: { title: "Strata membership", subtitle: "Add lots and assign owners" },
  6: { title: "Opening balances", subtitle: "Enter current fund balances" },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WizardData = Awaited<ReturnType<typeof getSubdivisionWizardData>>;

function WizardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Use local state for step and ID — URL is synced but not the source of truth
  const [currentStep, setCurrentStep] = useState(() =>
    Math.max(1, Math.min(6, parseInt(searchParams.get("step") ?? "1", 10)))
  );
  const [subId, setSubId] = useState(() => searchParams.get("id") ?? "");

  const [wizardData, setWizardData] = useState<WizardData>(null);
  const [dataLoading, setDataLoading] = useState(false);

  // Fetch existing subdivision data on mount if resuming (URL has id)
  const [initialFetchDone, setInitialFetchDone] = useState(false);
  useEffect(() => {
    if (initialFetchDone || !subId) return;
    setInitialFetchDone(true);
    setDataLoading(true);
    getSubdivisionWizardData(subId)
      .then((data) => {
        setWizardData(data);
        setDataLoading(false);
      })
      .catch(() => setDataLoading(false));
  }, [subId, initialFetchDone]);

  const { title, subtitle } = STEP_TITLES[currentStep] ?? STEP_TITLES[1];

  function goToStep(s: number, id?: string) {
    const sid = id ?? subId;
    if (id) setSubId(id);
    setCurrentStep(s);

    // Sync URL without triggering server navigation
    const params = new URLSearchParams();
    params.set("step", String(s));
    if (sid) params.set("id", sid);
    window.history.replaceState(null, "", `/subdivisions/new?${params.toString()}`);
  }

  const subdivisionId = subId;
  const showLoading = dataLoading && currentStep > 1;

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
          {showLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="space-y-1.5">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-9 w-full rounded-md" />
                </div>
              ))}
            </div>
          ) : (
            <>
              {currentStep === 1 && (
                <Step1General
                  onNext={(id) => goToStep(2, id)}
                  onCancel={() => router.push("/subdivisions")}
                  initialData={wizardData?.subdivision}
                />
              )}
              {currentStep === 2 && subdivisionId && (
                <Step2Settings
                  subdivisionId={subdivisionId}
                  onNext={() => goToStep(3)}
                  onBack={() => goToStep(1)}
                  initialData={wizardData?.subdivision}
                />
              )}
              {currentStep === 3 && subdivisionId && (
                <Step3Banking
                  subdivisionId={subdivisionId}
                  onNext={() => goToStep(4)}
                  onBack={() => goToStep(2)}
                  initialData={wizardData}
                />
              )}
              {currentStep === 4 && subdivisionId && (
                <Step4BankFeeds
                  subdivisionId={subdivisionId}
                  onNext={() => goToStep(5)}
                  onBack={() => goToStep(3)}
                />
              )}
              {currentStep === 5 && subdivisionId && (
                <Step4Lots
                  subdivisionId={subdivisionId}
                  onNext={() => goToStep(6)}
                  onBack={() => goToStep(4)}
                  initialData={wizardData?.lots}
                />
              )}
              {currentStep === 6 && subdivisionId && (
                <Step5Balances
                  subdivisionId={subdivisionId}
                  onComplete={(url) => router.push(url)}
                  onBack={() => goToStep(5)}
                  initialData={wizardData?.bankAccounts}
                />
              )}
            </>
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
