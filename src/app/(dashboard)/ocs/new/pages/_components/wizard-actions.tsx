"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { saveDraftPatch, type DraftJson } from "../../actions";

// Shared Back / Save / Continue button row used by every wizard step (Item 11).
// `getCurrentPatch` is invoked when the user clicks Save — it should return
// whatever state the form has right now, even if it's partial. Save skips the
// usual validation; the wizard pointer (current_step/current_substep) does NOT
// advance, so refreshing the wizard returns the user to the same page.

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
