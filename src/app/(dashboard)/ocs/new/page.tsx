"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { StepIndicator } from "./step-indicator";
import { Page1Upload } from "./pages/page-1-upload";
import { Page2Review } from "./pages/page-2-review";
import { Page3Basics } from "./pages/page-3-basics";
import { Page4Lots } from "./pages/page-4-lots";
import { Page5Trust } from "./pages/page-5-trust";
import { Page6Rules } from "./pages/page-6-rules";
import { Page7Insurance } from "./pages/page-7-insurance";
import { Page8Balances } from "./pages/page-8-balances";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { createDraft, createDraftFromDetectedOc, getDraft, type DraftJson } from "./actions";

type DraftRow = {
  id: string;
  current_step: number;
  parse_status: "none" | "pending" | "complete" | "failed" | "skipped";
  plan_filename: string | null;
  rules_filename: string | null;
  rules_parsed_json: { rules?: { rule_number: string }[] } | null;
  insurance_doc_filename: string | null;
  parsed_json: { detected_ocs?: { oc_number: number; lot_count: number; oc_name?: string | null }[] } | null;
  draft_json: DraftJson;
};

function WizardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [draft, setDraft] = useState<DraftRow | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  const [step, setStep] = useState<number>(1);
  const [nextOcPrompt, setNextOcPrompt] = useState<{ ocCode: string; sourceDraftId: string; nextOcIndex: number; totalOcs: number } | null>(null);
  const [forkingNext, setForkingNext] = useState(false);
  const initialised = useRef(false);

  // Bootstrap: either resume an existing draft via ?draft= or create a fresh one.
  useEffect(() => {
    if (initialised.current) return;
    initialised.current = true;

    const draftId = searchParams.get("draft");
    (async () => {
      if (draftId) {
        const r = await getDraft(draftId);
        if (r.error || !r.draft) {
          setBootError(r.error ?? "Draft not found");
          return;
        }
        const d = r.draft as unknown as DraftRow;
        setDraft(d);
        setStep(d.current_step);
        return;
      }
      const c = await createDraft();
      if (c.error || !c.draftId) {
        setBootError(c.error ?? "Could not start the wizard");
        return;
      }
      const r = await getDraft(c.draftId);
      if (r.error || !r.draft) {
        setBootError(r.error ?? "Draft not found");
        return;
      }
      const d = r.draft as unknown as DraftRow;
      setDraft(d);
      setStep(d.current_step);
      // Persist draft id in URL for refresh resumability.
      const next = new URLSearchParams(searchParams.toString());
      next.set("draft", d.id);
      window.history.replaceState(null, "", `/ocs/new?${next.toString()}`);
    })();
  }, [searchParams]);

  function goToStep(n: number) {
    setStep(n);
    const next = new URLSearchParams(searchParams.toString());
    if (draft) next.set("draft", draft.id);
    next.set("step", String(n));
    window.history.replaceState(null, "", `/ocs/new?${next.toString()}`);
  }

  async function refreshDraft() {
    if (!draft) return;
    const r = await getDraft(draft.id);
    if (r.draft) setDraft(r.draft as unknown as DraftRow);
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
      <div className="mx-auto w-full max-w-2xl space-y-6">
        <Skeleton className="h-8 w-1/2 mx-auto" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const totalLots = draft.draft_json.lots?.length ?? draft.draft_json.total_lots ?? 0;
  const ocName = draft.draft_json.oc_name ?? "";
  const detectedOcs = draft.parsed_json?.detected_ocs?.map((o) => ({
    oc_number: o.oc_number,
    lot_count: o.lot_count,
    oc_name: o.oc_name ?? null,
  })) ?? [];

  return (
    <div className="w-full">
      <StepIndicator current={step} />
      <div className="rounded-lg border border-border bg-card p-6">
        {step === 1 && (
          <Page1Upload
            draftId={draft.id}
            initialStatus={draft.parse_status}
            initialFilename={draft.plan_filename}
            initialOcCount={draft.parsed_json?.detected_ocs?.length ?? 0}
            initialLotCount={draft.parsed_json?.detected_ocs?.[0]?.lot_count ?? 0}
            onNext={async () => {
              await refreshDraft();
              goToStep(draft.parse_status === "skipped" ? 3 : 2);
            }}
          />
        )}
        {step === 2 && (
          <Page2Review
            draftId={draft.id}
            initialDraft={draft.draft_json}
            detectedOcs={detectedOcs}
            onBack={() => goToStep(1)}
            onNext={async () => { await refreshDraft(); goToStep(3); }}
          />
        )}
        {step === 3 && (
          <Page3Basics
            draftId={draft.id}
            initialDraft={draft.draft_json}
            totalLots={totalLots}
            onBack={() => goToStep(draft.parse_status === "skipped" ? 1 : 2)}
            onNext={async () => { await refreshDraft(); goToStep(4); }}
          />
        )}
        {step === 4 && (
          <Page4Lots
            draftId={draft.id}
            initialDraft={draft.draft_json}
            onBack={() => goToStep(3)}
            onNext={async () => { await refreshDraft(); goToStep(5); }}
          />
        )}
        {step === 5 && (
          <Page5Trust
            draftId={draft.id}
            initialDraft={draft.draft_json}
            ocName={ocName}
            totalLots={totalLots}
            onBack={() => goToStep(4)}
            onNext={async () => { await refreshDraft(); goToStep(6); }}
          />
        )}
        {step === 6 && (
          <Page6Rules
            draftId={draft.id}
            initialDraft={draft.draft_json}
            initialRulesFilename={draft.rules_filename}
            initialParseStatus={
              draft.rules_parsed_json?.rules ? "parsed"
              : draft.rules_filename ? "uploaded"
              : "none"
            }
            initialRuleCount={draft.rules_parsed_json?.rules?.length ?? 0}
            onBack={() => goToStep(5)}
            onNext={async () => { await refreshDraft(); goToStep(7); }}
          />
        )}
        {step === 7 && (
          <Page7Insurance
            draftId={draft.id}
            initialDraft={draft.draft_json}
            initialDocFilename={draft.insurance_doc_filename}
            onBack={() => goToStep(6)}
            onNext={async () => { await refreshDraft(); goToStep(8); }}
          />
        )}
        {step === 8 && (
          <Page8Balances
            draftId={draft.id}
            initialDraft={draft.draft_json}
            onBack={() => goToStep(7)}
            onComplete={(r) => {
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
              router.push(`/ocs/${r.ocCode}?created=1`);
            }}
          />
        )}
      </div>

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
                variant="ghost"
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
                  if (r.error || !r.draftId) {
                    return;
                  }
                  // Hard navigation so the wizard fully resets with the new
                  // draft id (skipping page 1).
                  window.location.assign(`/ocs/new?draft=${r.draftId}&step=2`);
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

export default function NewOCPage() {
  return (
    <Suspense>
      <WizardContent />
    </Suspense>
  );
}
