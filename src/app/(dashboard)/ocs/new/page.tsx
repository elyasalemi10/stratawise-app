"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { StepIndicator } from "./step-indicator";
import { EntryPopup } from "./pages/entry-popup";
import { Step1General } from "./pages/step-1-general";
import { Step1ManagementFee } from "./pages/step-1-1-management-fee";
import { Step2Settings } from "./pages/step-2-settings";
import { Step2CommsDefault } from "./pages/step-2-1-comms-default";
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

// (step, sub) tuple for routing. Sub-step indices:
//   Step 1: 0 = General, 1 = Management fee
//   Step 2: 0 = Settings, 1 = Comms default
//   Step 3: 0 = Lots,     1 = Postal & Contact, 2 = Digital consent
//   Step 4: 0 = Banking,  1 = Opening balances
function clampStep(n: number) { return Number.isFinite(n) && n >= 1 && n <= 4 ? n : 1; }
function clampSubstep(n: number) { return Number.isFinite(n) && n >= 0 && n <= 2 ? n : 0; }

function WizardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [draft, setDraft] = useState<DraftRow | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  const [step, setStep] = useState<number>(() => clampStep(parseInt(searchParams.get("step") ?? "", 10) || 1));
  const [substep, setSubstep] = useState<number>(() => clampSubstep(parseInt(searchParams.get("sub") ?? "", 10) || 0));
  const [showEntryPopup, setShowEntryPopup] = useState(false);
  const [nextOcPrompt, setNextOcPrompt] = useState<{ ocCode: string; sourceDraftId: string; nextOcIndex: number; totalOcs: number } | null>(null);
  const [forkingNext, setForkingNext] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const initialised = useRef(false);

  // Bootstrap: either resume an existing draft via ?draft= or create a fresh one.
  useEffect(() => {
    if (initialised.current) return;
    initialised.current = true;

    const draftId = searchParams.get("draft");
    (async () => {
      const r = draftId ? await getDraft(draftId) : await createDraftAndLoad();
      if (r.error || !r.draft) {
        setBootError(r.error ?? "Could not start the wizard");
        return;
      }
      const d = r.draft as unknown as DraftRow;
      // Idempotency: a promoted draft redirects to the OC dashboard rather
      // than letting the user mash Create OC and mint duplicates.
      if (d.promoted_oc_id && d.promoted_short_code) {
        router.replace(`/ocs/${d.promoted_short_code}`);
        return;
      }
      setDraft(d);
      setStep(clampStep(d.current_step));
      setSubstep(clampSubstep(d.current_substep));
      // Entry popup only opens on a fresh draft — i.e. nothing decided yet
      // about the plan PDF. Resumed drafts skip straight to whichever step
      // they were on.
      const isFreshDraft =
        d.parse_status === "none" &&
        d.current_step === 1 &&
        d.current_substep === 0;
      setShowEntryPopup(isFreshDraft);

      // Persist draft id in URL for refresh resumability.
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
      const main = document.querySelector("main");
      if (main) main.scrollTo({ top: 0, behavior: "smooth" });
      else window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  async function refreshDraft() {
    if (!draft) return;
    const r = await getDraft(draft.id);
    if (r.draft) setDraft(r.draft as unknown as DraftRow);
  }

  // Sub-step transition table — Back navigates to the previous logical screen.
  function back() {
    if (step === 1 && substep === 0) {
      // First screen: reopen the entry popup so the user can reconsider
      // plan upload vs manual.
      setShowEntryPopup(true);
      return;
    }
    if (step === 1 && substep === 1) return goTo(1, 0);
    if (step === 2 && substep === 0) return goTo(1, 1);
    if (step === 2 && substep === 1) return goTo(2, 0);
    if (step === 3 && substep === 0) return goTo(2, 1);
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
        <div className="relative mb-2 flex h-8 items-center">
          <span className="absolute left-0 top-0 inline-flex h-6 w-6 items-center justify-center text-muted-foreground">
            <X className="h-4 w-4" />
          </span>
          <p className="w-full text-center text-xs text-muted-foreground">
            Each step is saved when you click <strong>Continue</strong>. You can leave anytime
            and resume from the OC switcher in the sidebar.
          </p>
        </div>
        <StepIndicator current={step} />
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

  const totalLots = draft.draft_json.lots?.length ?? draft.draft_json.total_lots ?? 0;
  const detectedOcs = draft.parsed_json?.detected_ocs?.map((o) => ({
    oc_number: o.oc_number,
    lot_count: o.lot_count,
    oc_name: o.oc_name ?? null,
  })) ?? [];

  return (
    <div className="mx-auto w-full max-w-5xl">
      <div className="relative mb-2 flex h-8 items-center">
        <button
          type="button"
          onClick={() => setCancelOpen(true)}
          aria-label="Cancel and exit wizard"
          className="absolute left-0 top-0 inline-flex h-6 w-6 items-center justify-center text-muted-foreground hover:text-foreground cursor-pointer"
        >
          <X className="h-4 w-4" />
        </button>
        <p className="w-full text-center text-xs text-muted-foreground">
          Each step is saved when you click <strong>Continue</strong>. You can leave anytime
          and resume from the OC switcher in the sidebar.
        </p>
      </div>
      <StepIndicator current={step} />
      <div className="mt-2">
        {step === 1 && substep === 0 && (
          <Step1General
            draftId={draft.id}
            initialDraft={draft.draft_json}
            onBack={back}
            onNext={async () => { await refreshDraft(); goTo(1, 1); }}
          />
        )}
        {step === 1 && substep === 1 && (
          <Step1ManagementFee
            draftId={draft.id}
            initialDraft={draft.draft_json}
            onBack={back}
            onNext={async () => { await refreshDraft(); goTo(2, 0); }}
          />
        )}
        {step === 2 && substep === 0 && (
          <Step2Settings
            draftId={draft.id}
            initialDraft={draft.draft_json}
            onBack={back}
            onNext={async () => { await refreshDraft(); goTo(2, 1); }}
          />
        )}
        {step === 2 && substep === 1 && (
          <Step2CommsDefault
            draftId={draft.id}
            initialDraft={draft.draft_json}
            onBack={back}
            onNext={async () => { await refreshDraft(); goTo(3, 0); }}
          />
        )}
        {step === 3 && substep === 0 && (
          <Step3Lots
            draftId={draft.id}
            initialDraft={draft.draft_json}
            onBack={back}
            onNext={async () => { await refreshDraft(); goTo(3, 1); }}
          />
        )}
        {step === 3 && substep === 1 && (
          <Step3PostalContact
            draftId={draft.id}
            initialDraft={draft.draft_json}
            onBack={back}
            onNext={async () => { await refreshDraft(); goTo(3, 2); }}
          />
        )}
        {step === 3 && substep === 2 && (
          <Step3DigitalConsent
            draftId={draft.id}
            initialDraft={draft.draft_json}
            onBack={back}
            onNext={async () => { await refreshDraft(); goTo(4, 0); }}
          />
        )}
        {step === 4 && substep === 0 && (
          <Step4Banking
            draftId={draft.id}
            initialDraft={draft.draft_json}
            totalLots={totalLots}
            onBack={back}
            onNext={async () => { await refreshDraft(); goTo(4, 1); }}
          />
        )}
        {step === 4 && substep === 1 && (
          <Step4OpeningBalances
            draftId={draft.id}
            initialDraft={draft.draft_json}
            onBack={back}
            onComplete={(r) => {
              revalidateSidebarFromClient();
              const detected = draft.parsed_json?.detected_ocs ?? [];
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
            }}
          />
        )}
      </div>

      {/* Entry popup. Mounted while showEntryPopup is true; closes on Done. */}
      {showEntryPopup && draft && (
        <EntryPopup
          draftId={draft.id}
          initialStatus={draft.parse_status}
          initialFilename={draft.plan_filename}
          initialDetectedOcs={detectedOcs}
          onDone={async () => {
            await refreshDraft();
            setShowEntryPopup(false);
            // Land on Step 1 General.
            goTo(1, 0);
          }}
        />
      )}

      {/* Cancel-creation confirm. Draft stays in oc_drafts and is resumable. */}
      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Leave the OC creation wizard?</DialogTitle>
            <DialogDescription>
              Your progress is already saved as a draft. You can resume from the OC switcher in
              the sidebar at any time — leaving now won&apos;t lose anything.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setCancelOpen(false)}>Keep going</Button>
            <Button onClick={() => router.push("/ocs")}>Leave wizard</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Multi-OC follow-on prompt. Fires when the source plan creates more
          than one OC and we haven't promoted them all yet. */}
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
                  window.location.assign(`/ocs/new?draft=${r.draftId}&step=1&sub=0`);
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
