"use client";

import { useRouter } from "next/navigation";
import { Suspense } from "react";
import { StepCompany } from "./step-company";

// Single-step onboarding — managers fill in their company details and land
// on the dashboard. Subdivision creation happens from the dashboard once
// they're in. Confetti runs on /dashboard?welcome=1 to mark first arrival.

function SetupWizardContent() {
  const router = useRouter();
  return (
    <div className="w-full max-w-2xl mx-auto">
      <div className="rounded-lg border border-border bg-card p-6 shadow-none">
        <StepCompany onNext={() => router.push("/dashboard?welcome=1")} />
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
