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
import { X } from "lucide-react";
import { createDraftAndLoad, createDraftFromDetectedOc, getDraft, type DraftJson } from "./actions";
import { revalidateSidebarFromClient } from "@/lib/sidebar-cache";

type DraftRow = {
  id: string;
  current_step: number;
  parse_status: "none" | "pending" | "complete" | "failed" | "skipped";
  plan_filename: string | null;
  rules_filename: string | null;
  rules_parsed_json: { rules?: { rule_number: string; heading?: string | null; body: string }[] } | null;
  insurance_doc_filename: string | null;
  parsed_json: { detected_ocs?: { oc_number: number; lot_count: number; oc_name?: string | null }[] } | null;
  draft_json: DraftJson;
  photo_storage_key: string | null;
};

function WizardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [draft, setDraft] = useState<DraftRow | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  const [step, setStep] = useState<number>(1);
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
      // Single round-trip: server inserts + returns the full draft row so the
      // wizard renders without a second getDraft hop (was the visible delay
      // when first hitting /ocs/new — auth + insert + auth + select).
      const c = await createDraftAndLoad();
      if (c.error || !c.draft) {
        setBootError(c.error ?? "Could not start the wizard");
        return;
      }
      const d = c.draft as unknown as DraftRow;
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
    // In-component skeleton (after route swap, while createDraftAndLoad is in
    // flight). Mirrors loading.tsx so users don't see a flash of one skeleton
    // shape replaced by a different one.
    return (
      <div className="mx-auto w-full max-w-5xl">
        <StepIndicator current={1} />
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
      {/* Cancel pill — top-left of the wizard. The wizard auto-saves on every
          step transition, so closing the tab and coming back via the sidebar
          swapper resumes from the last completed step. Cancel here means
          discard this draft entirely. */}
      <div className="mb-2 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setCancelOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-primary/40 cursor-pointer"
        >
          <X className="h-3.5 w-3.5" />
          Cancel
        </button>
        <span className="text-xs text-muted-foreground">
          Your progress is saved automatically — you can close this page and resume from the OC switcher.
        </span>
      </div>
      <StepIndicator current={step} />
      <div className="mt-2">
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
            initialPhotoKey={draft.photo_storage_key}
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
            initialParsedRules={draft.rules_parsed_json?.rules ?? []}
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
              // Clear the localStorage sidebar cache so the new OC appears in
              // the picker immediately, without waiting 5 minutes for the TTL.
              // The server-side cache tag is already invalidated by
              // completeWizard() — this just nudges the client.
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
              router.push(`/ocs/${r.ocCode}?created=1`);
            }}
          />
        )}
      </div>

      {/* Cancel-creation confirm. Draft stays in oc_drafts (visible in the
          sidebar swapper "In progress" list) unless the user explicitly
          discards it from the OC list page. The button below leaves the
          wizard but preserves the row — that's what users almost always
          want, and matches the auto-save hint shown next to the button. */}
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
            <Button variant="ghost" onClick={() => setCancelOpen(false)}>Keep going</Button>
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
