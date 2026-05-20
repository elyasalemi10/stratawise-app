"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { LogOut } from "lucide-react";
import { StepCompany } from "./step-company";
import { StepOperating } from "./step-operating";
import { StepMailProvider } from "./step-mail-provider";
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

// Three-step onboarding:
//  1. Company details
//  2. Operating account (where management fees land)
//  3. Mail provider — stratawise (default) / Gmail / Outlook
// After step 3 → /dashboard?welcome=1 (confetti + welcome overlay).

const STEPS = [
  { number: 1, label: "Company" },
  { number: 2, label: "Operating account" },
  { number: 3, label: "Email" },
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
      {/* Finish-later exit. We SAVE AS DRAFT — never delete the account.
          The verified email + any saved company details persist; signing
          back in resumes onboarding (or lands on the dashboard if the
          company step was already completed). */}
      <div className="mb-2 flex justify-end">
        <button
          type="button"
          onClick={() => setQuitOpen(true)}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground cursor-pointer"
        >
          <LogOut className="h-3.5 w-3.5" />
          Finish later
        </button>
      </div>
      <StepIndicator current={step} />
      <div className="rounded-lg border border-border bg-card p-6 shadow-none">
        {step === 1 && <StepCompany onNext={() => goToStep(2)} />}
        {step === 2 && (
          <StepOperating
            onNext={() => goToStep(3)}
            onBack={() => goToStep(1)}
          />
        )}
        {step === 3 && (
          <StepMailProvider
            onNext={() => router.push("/dashboard?welcome=1")}
            onBack={() => goToStep(2)}
          />
        )}
      </div>

      <Dialog open={quitOpen} onOpenChange={setQuitOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Finish setup later?</DialogTitle>
            <DialogDescription>
              Your progress is saved and your account stays active — we
              won&apos;t delete anything. Sign back in any time to pick up
              where you left off.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setQuitOpen(false)}>
              Keep going
            </Button>
            {/* Hard nav to /logout clears the session cookie and lands on
                the homepage. Spinner stays implied by the nav (no flash). */}
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
