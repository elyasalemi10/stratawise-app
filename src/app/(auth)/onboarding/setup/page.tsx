"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { X } from "lucide-react";
import { StepCompany } from "./step-company";
import { StepOperating } from "./step-operating";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

// Two-step onboarding:
//   1. Company details (mandatory)
//   2. Operating account (optional , also editable in Settings)
// Email/mail-provider setup moved out of onboarding to Settings entirely.
// After step 2 → /dashboard?welcome=1 (confetti + welcome overlay).
//
// Both steps stay MOUNTED (inactive one hidden) so going Back/forward keeps
// every field the manager already typed , no re-fetch, no wiped form.

const STEPS = [
  { number: 1, label: "Company" },
  { number: 2, label: "Operating account" },
];

function SetupWizardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialStep = Math.max(
    1,
    Math.min(STEPS.length, parseInt(searchParams.get("step") ?? "1", 10)),
  );
  const [step, setStep] = useState(initialStep);
  const [quitOpen, setQuitOpen] = useState(false);

  function goToStep(n: number) {
    setStep(n);
    const params = new URLSearchParams(searchParams.toString());
    params.set("step", String(n));
    window.history.replaceState(null, "", `/onboarding/setup?${params.toString()}`);
  }

  return (
    <div className="w-full max-w-2xl mx-auto">
      <StepIndicator current={step} />
      <div className="relative rounded-lg bg-card p-6 shadow-none">
        {/* Finish-later exit , X in the top-right of the white card. We SAVE
            AS DRAFT (never delete the account); signing back in resumes. */}
        <button
          type="button"
          onClick={() => setQuitOpen(true)}
          aria-label="Finish later"
          className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
        >
          <X className="h-4 w-4" />
        </button>

        <div className={cn(step !== 1 && "hidden")}>
          <StepCompany onNext={() => goToStep(2)} />
        </div>
        <div className={cn(step !== 2 && "hidden")}>
          <StepOperating
            onNext={() => router.push("/dashboard?welcome=1")}
            onBack={() => goToStep(1)}
          />
        </div>
      </div>

      <Dialog open={quitOpen} onOpenChange={setQuitOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Finish setup later?</DialogTitle>
            <DialogDescription>
              Your progress is saved and your account stays active , we
              won&apos;t delete anything. Sign back in any time to pick up
              where you left off.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setQuitOpen(false)}>
              Keep going
            </Button>
            <Button onClick={() => { window.location.href = "/logout"; }}>
              Save &amp; sign out
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="mb-8 flex items-center justify-center gap-3">
      {STEPS.map((s, i) => (
        <div key={s.number} className="flex items-center gap-3">
          <div
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium transition-colors",
              s.number <= current
                ? "bg-primary text-primary-foreground"
                : "border-2 border-dashed border-border bg-background text-muted-foreground",
            )}
          >
            {s.number}
          </div>
          <span
            className={cn(
              "text-xs",
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
                "h-px w-8 border-t-2",
                s.number < current ? "border-solid border-primary" : "border-dashed border-border",
              )}
            />
          )}
        </div>
      ))}
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
