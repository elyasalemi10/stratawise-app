"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { StepIndicator } from "./step-indicator";
import { Step1Upload } from "./pages/step-1-0-upload";
import { Step1General } from "./pages/step-1-general";
import { Step1ManagementFee } from "./pages/step-1-1-management-fee";
import { Step2Settings } from "./pages/step-2-settings";
import { Step3Lots } from "./pages/step-3-lots";
import { Step3PostalContact } from "./pages/step-3-1-postal-contact";
import { Step3DigitalConsent } from "./pages/step-3-2-digital-consent";
import { Step4Banking } from "./pages/step-4-banking";
import { Step4OpeningBalances } from "./pages/step-4-1-opening-balances";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { X } from "lucide-react";
import { createDraftAndLoad, createDraftFromDetectedOc, getDraft, type DraftJson } from "./actions";
import { revalidateSidebarFromClient } from "@/lib/sidebar-cache";

type DraftRow = {
  id: string;
  current_step: number;
  current_substep: number;
  parse_status: "none" | "pending" | "complete" | "failed" | "skipped";
  plan_filename: string | null;
  parsed_json: { detected_ocs?: { oc_number: number; lot_count: number; oc_name?: string | null }[] } | null;
  draft_json: DraftJson;
  photo_storage_key: string | null;
  promoted_oc_id: string | null;
  promoted_short_code: string | null;
};

// (step, sub) routing map:
//   Step 1: 0 Upload chooser, 1 General, 2 Management fee
//   Step 2: 0 Settings
//   Step 3: 0 Lots, 1 Service & contact, 2 Digital consent
//   Step 4: 0 Banking, 1 Opening balances
// Default delivery method (postal / mixed / email) lives in Settings →
// Communications now; we default to "mixed" at OC creation.
function clampStep(n: number) { return Number.isFinite(n) && n >= 1 && n <= 4 ? n : 1; }
function clampSubstep(n: number) { return Number.isFinite(n) && n >= 0 && n <= 2 ? n : 0; }

function WizardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [draft, setDraft] = useState<DraftRow | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  const [step, setStep] = useState<number>(() => clampStep(parseInt(searchParams.get("step") ?? "", 10) || 1));
  const [substep, setSubstep] = useState<number>(() => clampSubstep(parseInt(searchParams.get("sub") ?? "", 10) || 0));
  const [nextOcPrompt, setNextOcPrompt] = useState<{ ocCode: string; sourceDraftId: string; nextOcIndex: number; totalOcs: number } | null>(null);
  const [forkingNext, setForkingNext] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const initialised = useRef(false);

  useEffect(() => {
    if (initialised.current) return;
    initialised.current = true;

    const draftId = searchParams.get("draft");
    // Capture URL-supplied step/sub BEFORE the network round-trip resolves
    // so we know whether the user landed via an explicit deep link
    // (e.g. /ocs/new?draft=X&step=2&sub=0). The URL is the authoritative
    // intent for a refresh , without this the page renders step 2 from
    // the URL, then snaps back to draft.current_step (often 1) and the
    // user sees a flicker between steps. Only fall back to the draft's
    // persisted step when the URL omitted it.
    const urlStep = parseInt(searchParams.get("step") ?? "", 10);
    const urlSub = parseInt(searchParams.get("sub") ?? "", 10);
    const urlHasStep = Number.isFinite(urlStep);
    const urlHasSub = Number.isFinite(urlSub);
    (async () => {
      const r = draftId ? await getDraft(draftId) : await createDraftAndLoad();
      if (r.error || !r.draft) {
        setBootError(r.error ?? "Could not start the wizard");
        return;
      }
      const d = r.draft as unknown as DraftRow;
      if (d.promoted_oc_id && d.promoted_short_code) {
        router.replace(`/ocs/${d.promoted_short_code}`);
        return;
      }
      setDraft(d);
      setStep(clampStep(urlHasStep ? urlStep : d.current_step));
      setSubstep(clampSubstep(urlHasSub ? urlSub : d.current_substep));

      if (!draftId) {
        const next = new URLSearchParams(searchParams.toString());
        next.set("draft", d.id);
        window.history.replaceState(null, "", `/ocs/new?${next.toString()}`);
      }
    })();
  }, [searchParams, router]);

  function goTo(nextStep: number, nextSub: number) {
    setStep(nextStep);
    setSubstep(nextSub);
    const next = new URLSearchParams(searchParams.toString());
    if (draft) next.set("draft", draft.id);
    next.set("step", String(nextStep));
    next.set("sub", String(nextSub));
    window.history.replaceState(null, "", `/ocs/new?${next.toString()}`);
    if (typeof window !== "undefined") {
      // Instant jump rather than smooth , smooth scroll happens AFTER
      // the new step renders, so the manager briefly sees the bottom of
      // the previous step still while the page slides up.
      const main = document.querySelector("main");
      if (main) main.scrollTo({ top: 0 });
      else window.scrollTo({ top: 0 });
    }
  }

  async function refreshDraft() {
    if (!draft) return;
    const r = await getDraft(draft.id);
    if (r.draft) setDraft(r.draft as unknown as DraftRow);
  }

  // Optimistic advance , merge the step's patch into the local draft and
  // navigate IMMEDIATELY (no getDraft round-trip). The step already
  // background-saved the same patch to the DB, so the local merge keeps
  // the next step's initialDraft fresh without waiting ~500ms for a
  // re-fetch. This is what makes Continue feel instant.
  function advance(nextStep: number, nextSub: number, patch?: Partial<DraftJson>) {
    if (patch) {
      setDraft((d) =>
        d ? { ...d, draft_json: { ...d.draft_json, ...patch } } : d,
      );
    }
    goTo(nextStep, nextSub);
  }

  // Shared completion handler , used by both the banking step (when the
  // manager picks "set up later" and creates the OC straight from there)
  // and the opening-balances step (the normal end of the wizard).
  function handleComplete(r: { ocCode: string; sourceDraftId?: string; nextOcIndex?: number | null }) {
    revalidateSidebarFromClient();
    const detected = draft?.parsed_json?.detected_ocs ?? [];
    if (r.sourceDraftId && typeof r.nextOcIndex === "number" && detected.length > 1) {
      setNextOcPrompt({
        ocCode: r.ocCode,
        sourceDraftId: r.sourceDraftId,
        nextOcIndex: r.nextOcIndex,
        totalOcs: detected.length,
      });
      return;
    }
    window.location.assign(`/ocs/${r.ocCode}?created=1`);
  }

  function back() {
    if (step === 1 && substep === 0) {
      // First screen of the wizard , no previous step to go to. The X corner
      // button is the way out.
      setCancelOpen(true);
      return;
    }
    if (step === 1 && substep === 1) return goTo(1, 0);
    if (step === 2 && substep === 0) return goTo(1, 1);
    if (step === 3 && substep === 0) return goTo(2, 0);
    if (step === 3 && substep === 1) return goTo(3, 0);
    if (step === 3 && substep === 2) return goTo(3, 1);
    if (step === 4 && substep === 0) return goTo(3, 2);
    if (step === 4 && substep === 1) return goTo(4, 0);
  }

  if (bootError) {
    return (
      <div className="mx-auto w-full max-w-2xl">
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          {bootError}
        </div>
      </div>
    );
  }

  if (!draft) {
    return (
      <div className="mx-auto w-full max-w-5xl">
        <div className="relative">
          <span className="absolute -left-4 top-3 inline-flex h-8 w-8 items-center justify-center text-muted-foreground">
            <X className="h-5 w-5" />
          </span>
          <StepIndicator current={step} />
        </div>
        <div className="mt-2 space-y-6">
          <div className="text-center">
            <Skeleton className="mx-auto h-6 w-72" />
            <Skeleton className="mx-auto mt-2 h-4 w-96" />
          </div>
          <Skeleton className="h-48 w-full rounded-lg" />
          <div className="flex items-center justify-between pt-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-9 w-24" />
          </div>
        </div>
      </div>
    );
  }

  const detectedOcs = draft.parsed_json?.detected_ocs?.map((o) => ({
    oc_number: o.oc_number,
    lot_count: o.lot_count,
    oc_name: o.oc_name ?? null,
  })) ?? [];
  const totalLots = draft.draft_json.lots?.length ?? draft.draft_json.total_lots ?? 0;

  return (
    <div className="mx-auto w-full max-w-5xl">
      <div className="relative">
        {/* X corner button , far left, vertically centered with the progress
            circles. Click opens the cancel-confirm dialog. */}
        <button
          type="button"
          onClick={() => setCancelOpen(true)}
          aria-label="Cancel and exit wizard"
          className="absolute -left-4 top-3 inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
        >
          <X className="h-5 w-5" />
        </button>
        <StepIndicator current={step} />
      </div>
      <div className="mt-2">
        {step === 1 && substep === 0 && (
          <Step1Upload
            draftId={draft.id}
            initialStatus={draft.parse_status}
            initialFilename={draft.plan_filename}
            initialDetectedOcs={detectedOcs}
            onNext={async () => { await refreshDraft(); goTo(1, 1); }}
          />
        )}
        {step === 1 && substep === 1 && (
          // Step 1.2 (Management fee) removed per item 4 , managers
          // bill the OC externally, the platform doesn't model the fee
          // any more. Jump straight from General to Settings.
          <Step1General
            draftId={draft.id}
            initialDraft={draft.draft_json}
            onBack={back}
            onNext={(patch) => advance(2, 0, patch)}
          />
        )}
        {step === 2 && substep === 0 && (
          <Step2Settings
            draftId={draft.id}
            initialDraft={draft.draft_json}
            onBack={back}
            onNext={(patch) => advance(3, 0, patch)}
          />
        )}
        {step === 3 && substep === 0 && (
          <Step3Lots
            draftId={draft.id}
            initialDraft={draft.draft_json}
            onBack={back}
            onNext={(patch) => advance(3, 1, patch)}
          />
        )}
        {step === 3 && substep === 1 && (
          <Step3PostalContact
            draftId={draft.id}
            initialDraft={draft.draft_json}
            onBack={back}
            onNext={(patch) => advance(3, 2, patch)}
          />
        )}
        {step === 3 && substep === 2 && (
          <Step3DigitalConsent
            draftId={draft.id}
            initialDraft={draft.draft_json}
            onBack={back}
            onNext={(patch) => advance(4, 0, patch)}
          />
        )}
        {step === 4 && substep === 0 && (
          <Step4Banking
            draftId={draft.id}
            initialDraft={draft.draft_json}
            totalLots={totalLots}
            onBack={back}
            onNext={async () => { await refreshDraft(); goTo(4, 1); }}
            onComplete={handleComplete}
          />
        )}
        {step === 4 && substep === 1 && (
          <Step4OpeningBalances
            draftId={draft.id}
            initialDraft={draft.draft_json}
            onBack={back}
            onComplete={handleComplete}
          />
        )}
      </div>

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Leave the OC creation wizard?</DialogTitle>
            <DialogDescription>
              Your progress is already saved as a draft. You can resume from the OC switcher in
              the sidebar at any time , leaving now won&apos;t lose anything.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setCancelOpen(false)}>Keep going</Button>
            <Button onClick={() => router.push("/ocs")}>Leave wizard</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {nextOcPrompt && (
        <Dialog open onOpenChange={(open) => { if (!open) router.push(`/ocs/${nextOcPrompt.ocCode}?created=1`); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>This plan creates {nextOcPrompt.totalOcs} OCs</DialogTitle>
              <DialogDescription>
                You&apos;ve just created one of them. Continue with the next OC from the same plan now, or finish and create it later from the OCs page.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="secondary"
                disabled={forkingNext}
                onClick={() => router.push(`/ocs/${nextOcPrompt.ocCode}?created=1`)}
              >
                Finish for now
              </Button>
              <Button
                disabled={forkingNext}
                onClick={async () => {
                  setForkingNext(true);
                  const r = await createDraftFromDetectedOc(nextOcPrompt.sourceDraftId, nextOcPrompt.nextOcIndex);
                  setForkingNext(false);
                  if (r.error || !r.draftId) return;
                  window.location.assign(`/ocs/new?draft=${r.draftId}&step=1&sub=1`);
                }}
              >
                {forkingNext ? "Loading…" : "Create the next OC"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function WizardOuter() {
  const searchParams = useSearchParams();
  const draftKey = searchParams.get("draft") ?? "new";
  return <WizardContent key={draftKey} />;
}

export default function NewOCPage() {
  return (
    <Suspense>
      <WizardOuter />
    </Suspense>
  );
}
