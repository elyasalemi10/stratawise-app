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
import { getOCWizardData } from "./actions";

const STEP_TITLES: Record<number, { title: string; subtitle: string }> = {
  1: { title: "Create an Owners Corporation", subtitle: "General details and the registered address" },
  2: { title: "Advanced settings", subtitle: "Financial year and levy schedule" },
  3: { title: "Banking details", subtitle: "Trust account for this OC" },
  4: { title: "Connect bank feeds", subtitle: "Optional — link the accounts above for automatic transaction syncing." },
  5: { title: "Lots and ownership", subtitle: "Add lots and (optionally) note owner contacts" },
  6: { title: "Opening balances", subtitle: "Current fund balances at handover" },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WizardData = Awaited<ReturnType<typeof getOCWizardData>>;

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

  // Fetch existing oc data on mount if resuming (URL has id)
  const [initialFetchDone, setInitialFetchDone] = useState(false);
  useEffect(() => {
    if (initialFetchDone || !subId) return;
    setInitialFetchDone(true);
    setDataLoading(true);
    getOCWizardData(subId)
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
    window.history.replaceState(null, "", `/ocs/new?${params.toString()}`);
  }

  const ocId = subId;
  const showLoading = dataLoading && currentStep > 1;

  return (
    <div className="mx-auto w-full max-w-3xl">
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
                  onCancel={() => router.push("/ocs")}
                  initialData={wizardData?.oc}
                />
              )}
              {currentStep === 2 && ocId && (
                <Step2Settings
                  ocId={ocId}
                  onNext={() => goToStep(3)}
                  onBack={() => goToStep(1)}
                  initialData={wizardData?.oc}
                />
              )}
              {currentStep === 3 && ocId && (
                <Step3Banking
                  ocId={ocId}
                  onNext={() => goToStep(4)}
                  onBack={() => goToStep(2)}
                  initialData={wizardData}
                />
              )}
              {currentStep === 4 && ocId && (
                <Step4BankFeeds
                  ocId={ocId}
                  onNext={() => goToStep(5)}
                  onBack={() => goToStep(3)}
                />
              )}
              {currentStep === 5 && ocId && (
                <Step4Lots
                  ocId={ocId}
                  onNext={() => goToStep(6)}
                  onBack={() => goToStep(4)}
                  initialData={wizardData?.lots}
                />
              )}
              {currentStep === 6 && ocId && (
                <Step5Balances
                  ocId={ocId}
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

export default function NewOCPage() {
  return (
    <Suspense>
      <WizardContent />
    </Suspense>
  );
}
