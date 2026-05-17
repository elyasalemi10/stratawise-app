"use client";

import * as React from "react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Loader2, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// Standardised right-side edit drawer. Slides in from the right, full height,
// roughly navbar width. Used for any "edit this whole record" flow where the
// alternative would be individual pencil icons per field (which the user
// explicitly does NOT want — one section, one Edit button, one drawer with
// all editable fields, one Save).
//
// Behaviour mirrors EditPopover: optimistic update via `optimistic.apply`,
// rollback on save failure, success toast, sheet closes on ok. Confirm-then-
// save is supported for destructive / consequential edits.

interface EditSheetProps {
  label: string;
  description?: string;
  triggerLabel?: string;
  triggerVariant?: "default" | "secondary" | "ghost";
  triggerSize?: "default" | "sm" | "icon-sm";
  renderTrigger?: (open: boolean) => React.ReactNode;
  children: React.ReactNode;
  onSave: () => Promise<{ ok: true } | { ok: false; error: string }>;
  optimistic?: {
    apply: () => void;
    rollback: () => void;
  } | null;
  saveLabel?: string;
  cancelLabel?: string;
  requireConfirmation?: boolean;
  confirmationMessage?: string;
  disabled?: boolean;
  /** Reset internal state (e.g. confirmation step) when the sheet closes. */
  onOpenChange?: (open: boolean) => void;
  /**
   * The small uppercase caption above the drawer title. Defaults to "Edit"
   * for the rename/update use case the component was originally built for.
   * Pass null to hide the caption entirely (e.g. when the drawer carries a
   * non-edit action like "Send" or "Log").
   */
  headerKicker?: string | null;
  /** Controlled open state. When provided, the drawer ignores its built-in
   * trigger and is driven entirely by this prop + onOpenChange. Useful when
   * the drawer is opened from somewhere else in the UI (e.g. a dropdown). */
  open?: boolean;
  /** Override the success toast that defaults to `${label} updated`. Pass
   * null to suppress the toast entirely (e.g. when the parent wants to
   * emit its own contextual toast on save). */
  successToast?: string | null;
}

export function EditSheet({
  label,
  description,
  triggerLabel = "Edit",
  triggerVariant = "secondary",
  triggerSize = "sm",
  renderTrigger,
  children,
  onSave,
  optimistic = null,
  saveLabel = "Save",
  cancelLabel = "Cancel",
  requireConfirmation = false,
  confirmationMessage = "Save these changes? This can't be undone without manual correction.",
  disabled = false,
  onOpenChange,
  headerKicker = "Edit",
  open: controlledOpen,
  successToast,
}: EditSheetProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;
  const [pending, setPending] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  function handleOpenChange(next: boolean) {
    if (!isControlled) setUncontrolledOpen(next);
    if (!next) {
      setPending(false);
      setConfirming(false);
      setError(null);
    }
    onOpenChange?.(next);
  }

  async function handleSave() {
    if (requireConfirmation && !confirming) {
      setConfirming(true);
      return;
    }
    setError(null);
    setPending(true);
    optimistic?.apply();
    const result = await onSave();
    setPending(false);
    if (result.ok) {
      handleOpenChange(false);
      if (successToast !== null) {
        toast.success(successToast ?? `${label} updated`);
      }
    } else {
      optimistic?.rollback();
      setError(result.error);
    }
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetTrigger
        render={
          renderTrigger ? (
            <span />
          ) : (
            <Button variant={triggerVariant} size={triggerSize} disabled={disabled}>
              <Pencil className={cn("h-3.5 w-3.5", triggerSize !== "icon-sm" && "mr-1.5")} />
              {triggerSize !== "icon-sm" && triggerLabel}
            </Button>
          )
        }
      >
        {renderTrigger ? renderTrigger(open) : null}
      </SheetTrigger>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="w-full sm:max-w-sm p-0 gap-0 bg-card"
      >
        {/* Header strip — drawer kicker (defaults to "Edit") sits above the
            label; pass headerKicker={null} to drop the eyebrow entirely for
            non-edit drawers like Send / Log. */}
        <div className="border-b border-border bg-card px-5 pt-5 pb-4">
          {headerKicker && (
            <p className="text-xs font-medium uppercase tracking-wide text-[color:var(--brand-gold)]">
              {headerKicker}
            </p>
          )}
          <h2 className="mt-0.5 text-base font-semibold text-foreground">{label}</h2>
          {description && (
            <p className="mt-1 text-xs text-muted-foreground">{description}</p>
          )}
        </div>

        {/* Body — scrollable so a tall list of fields doesn't push the footer
            off-screen. */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {children}
          {requireConfirmation && confirming && (
            <div className="rounded-md border border-warning/30 bg-warning/5 p-2 text-xs text-foreground">
              {confirmationMessage}
            </div>
          )}
          {error && (
            <p className="text-xs text-destructive" role="alert">
              {error}
            </p>
          )}
        </div>

        {/* Footer — Cancel + Save sticky at the bottom. */}
        <div className="border-t border-border bg-card px-5 py-3 flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => handleOpenChange(false)}
            disabled={pending}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleSave}
            disabled={disabled || pending}
          >
            {pending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
            {requireConfirmation && confirming ? "Confirm save" : saveLabel}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
