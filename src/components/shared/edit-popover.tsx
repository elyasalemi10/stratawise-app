"use client";

import * as React from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Loader2, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// Standardised inline-edit primitive (Item 8). Right-side popover that opens
// from an edit trigger, renders arbitrary form children, and runs an async
// `onSave` mutation. The caller is responsible for the form state — keep it as
// uncontrolled inputs or wire it up with react-hook-form locally. Optimistic
// patching is delegated to the parent via the `optimistic` callback: when the
// user saves, we (a) immediately invoke `optimistic(newValue)` so the page
// updates, (b) await onSave on the server, (c) on failure reverse the optimistic
// update via `optimistic(previousValue)`.
//
// Why a popover, not a sheet:
//   - Field-level edits are small (one value); a sheet is overkill
//   - Popovers are right-aligned to the trigger so the user's eye stays on the
//     field being edited
//   - On mobile, the popover snaps inside the viewport via base-ui's positioner
//
// Confirm-then-save variant:
//   - Pass `requireConfirmation` to add a confirmation step between Save and the
//     onSave call. Required for fields that have downstream consequences (lot
//     entitlement, lot liability, unit number) per Item 9.

interface EditPopoverProps<TValue> {
  label: string;
  side?: "right" | "bottom" | "left" | "top";
  align?: "start" | "center" | "end";
  triggerClassName?: string;
  contentClassName?: string;
  renderTrigger?: (open: boolean) => React.ReactNode;
  // Form children receive a `submit` handler from us via context — easiest is to
  // accept a render-prop with `(submitOnClick)` so the caller wires Save → submit.
  children: React.ReactNode;
  // Save handler returns ok/error. On ok, the popover closes and an optional
  // success toast fires. On error, the popover stays open and shows the error.
  onSave: () => Promise<{ ok: true } | { ok: false; error: string }>;
  // Optional optimistic patcher — called BEFORE onSave with the optimistic
  // value, and again with the rollback value on failure. Pass null to skip.
  optimistic?: {
    apply: () => void;
    rollback: () => void;
  } | null;
  saveLabel?: string;
  cancelLabel?: string;
  requireConfirmation?: boolean;
  confirmationMessage?: string;
  disabled?: boolean;
}

export function EditPopover<TValue>({
  label,
  side = "right",
  align = "start",
  triggerClassName,
  contentClassName,
  renderTrigger,
  children,
  onSave,
  optimistic = null,
  saveLabel = "Save",
  cancelLabel = "Cancel",
  requireConfirmation = false,
  confirmationMessage = "Save these changes? This can't be undone without manual correction.",
  disabled = false,
}: EditPopoverProps<TValue>) {
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const reset = () => {
    setPending(false);
    setConfirming(false);
    setError(null);
  };

  const handleSave = async () => {
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
      setOpen(false);
      reset();
      toast.success(`${label} updated`);
    } else {
      optimistic?.rollback();
      setError(result.error);
    }
  };

  return (
    <Popover open={open} onOpenChange={(next) => {
      setOpen(next);
      if (!next) reset();
    }}>
      <PopoverTrigger
        render={renderTrigger ? <span /> : undefined}
        disabled={disabled}
        className={cn(
          !renderTrigger &&
            "inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer",
          triggerClassName,
        )}
      >
        {renderTrigger ? renderTrigger(open) : (
          <>
            <Pencil className="h-3 w-3" aria-hidden />
            <span>Edit</span>
          </>
        )}
      </PopoverTrigger>
      <PopoverContent
        side={side}
        align={align}
        sideOffset={8}
        className={cn(
          "w-80 p-4 gap-3 shadow-none border border-border bg-card",
          contentClassName,
        )}
      >
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Edit
          </span>
          <h3 className="text-sm font-semibold text-foreground">{label}</h3>
        </div>

        <div className="flex flex-col gap-3 pt-1">{children}</div>

        {requireConfirmation && confirming ? (
          <div className="rounded-md border border-warning/30 bg-warning/5 p-2 text-xs text-foreground">
            {confirmationMessage}
          </div>
        ) : null}

        {error ? (
          <p className="text-xs text-destructive" role="alert">
            {error}
          </p>
        ) : null}

        <div className="flex items-center justify-end gap-2 pt-1">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              setOpen(false);
              reset();
            }}
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
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            <span className={pending ? "ml-1.5" : ""}>
              {requireConfirmation && confirming ? "Confirm save" : saveLabel}
            </span>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
