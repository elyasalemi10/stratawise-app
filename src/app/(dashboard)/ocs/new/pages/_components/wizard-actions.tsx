"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { saveDraftPatch, type DraftJson } from "../../actions";

// Shared Back / Save / Continue button row used by every wizard step (Item 11).
// `getCurrentPatch` is invoked when the user clicks Save — it should return
// whatever state the form has right now, even if it's partial. Save skips the
// usual validation; the wizard pointer (current_step/current_substep) does NOT
// advance, so refreshing the wizard returns the user to the same page.
//
// Auto-save heartbeat (added 2026-05): every AUTOSAVE_INTERVAL_MS the component
// snapshots the current patch and compares to the last snapshot it sent. If
// the form has changed, it fires saveDraftPatch in the background. A tab
// crash now loses at most AUTOSAVE_INTERVAL_MS of typing instead of the
// entire step. UPSERT against a single draft row — load is trivial.
const AUTOSAVE_INTERVAL_MS = 30_000;

interface Props {
  draftId: string;
  onBack: () => void;
  onContinue: () => void;
  continueLabel?: string;
  continuePending?: boolean;
  getCurrentPatch: () => Partial<DraftJson>;
  disabled?: boolean;
  /** Optional override for the Back button label (e.g. "Cancel"). */
  backLabel?: string;
  /** Hide the Back button — used on the upload step where there's nowhere to go back to. */
  hideBack?: boolean;
}

export function WizardActions({
  draftId,
  onBack,
  onContinue,
  continueLabel = "Continue",
  continuePending = false,
  getCurrentPatch,
  disabled = false,
  backLabel = "Back",
  hideBack = false,
}: Props) {
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    const patch = getCurrentPatch();
    const result = await saveDraftPatch(draftId, patch);
    setSaving(false);
    if (result.error) {
      toast.error("Could not save — please try again.");
      return;
    }
    toast.success("Saved", {
      description: "Your progress is saved. Continue any time.",
    });
  }

  // ─── Auto-save heartbeat ────────────────────────────────────────────
  // Compares the latest patch to the most recent snapshot we've sent.
  // Only fires the network call when the form actually changed, so a
  // user staring at a finished step doesn't generate 2 writes/min.
  const lastSavedSnapshotRef = useRef<string>("");
  useEffect(() => {
    const intervalId = window.setInterval(() => {
      try {
        const patch = getCurrentPatch();
        const snapshot = JSON.stringify(patch);
        if (snapshot === lastSavedSnapshotRef.current) return;
        lastSavedSnapshotRef.current = snapshot;
        void saveDraftPatch(draftId, patch).catch(() => {
          // Heartbeat failures are silent — the visible Save / Continue
          // buttons will surface real errors on the next user-initiated
          // save. We don't want a flaky network turning into a wall of
          // red toasts in the background.
        });
      } catch {
        // getCurrentPatch can throw if the form reads from refs that
        // aren't ready yet — ignore and retry on the next tick.
      }
    }, AUTOSAVE_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
    // getCurrentPatch is a stable closure provided by the parent step,
    // so we intentionally exclude it from the dep array to avoid
    // resetting the heartbeat on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftId]);

  return (
    <div className="flex items-center justify-between gap-2 pt-2">
      {hideBack ? (
        <span />
      ) : (
        <Button type="button" variant="secondary" onClick={onBack} disabled={continuePending || saving}>
          {backLabel}
        </Button>
      )}
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          onClick={handleSave}
          disabled={continuePending || saving || disabled}
        >
          {saving && <Loader2 className="mr-1 size-3.5 animate-spin" />}
          Save
        </Button>
        <Button type="button" onClick={onContinue} disabled={continuePending || disabled}>
          {continuePending && <Loader2 className="mr-1 size-3.5 animate-spin" />}
          {continueLabel}
        </Button>
      </div>
    </div>
  );
}
