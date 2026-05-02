"use client";

// ============================================================================
// BankDuplicateReviewDialog — PP5-D-A
// ----------------------------------------------------------------------------
// Manager-facing dialog for bank-side duplicate review. Calls
// confirmDuplicate / rejectDuplicate from PP5-A. State machine modelled
// on PP4-D's CollisionResolutionDialog reducer pattern.
//
// State machine:
//   choosing  — picker rendered with two action buttons + notes textarea
//   submitting — action dispatched; buttons disabled
//   done      — success state; toast + parent onResolved() → close
//   error     — inline error shown; recoverable=true offers retry button;
//               MATCH_ACTIVE (recoverable=false) offers detail-page CTA
//
// Q5.5 ratification: parent passes fresh metadata on open. The dialog
// trusts parent freshness via Next.js revalidatePath (after any
// confirmDuplicate / rejectDuplicate the queue revalidates). The action
// itself guards on duplicate_status='suspected' (PP5-A) so a stale-prop
// open returns NOT_SUSPECTED, which is correctly surfaced as a
// non-recoverable error.
// ============================================================================

import { useReducer, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, ExternalLink } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  confirmDuplicate,
  rejectDuplicate,
} from "@/lib/actions/reconciliation";
import type {
  DuplicateMetadata,
  DuplicateStatus,
} from "@/lib/validations/reconciliation";

const MAX_NOTES_LEN = 500;

// ─── Props ────────────────────────────────────────────────────────────────

export interface BankDuplicateReviewPayload {
  /** The currently-open bank tx (the suspected row). */
  bank_transaction_id: string;
  subdivision_id: string;
  /** Display fields for the suspected row. */
  current: {
    transaction_date: string;
    amount: number;
    description: string | null;
    source: string;
  };
  /** Detection metadata from the detector — older row id + sources +
   *  day_delta + normalised description + hash. Required because the
   *  dialog renders a "why was this flagged?" explanation. */
  duplicate_metadata: DuplicateMetadata;
  /** Optional snapshot of the older row's display fields. When omitted
   *  the dialog renders the matched_against id only. */
  candidate?: {
    transaction_date: string;
    amount: number;
    description: string | null;
    source: string;
  } | null;
  /** Cached current duplicate_status — confirms the row is still
   *  suspected at parent-render time. The action re-checks on submit. */
  duplicate_status: DuplicateStatus | null;
  /** Cached match state — if match_status is auto/manually_matched OR
   *  matched_total > 0, the parent already knows MATCH_ACTIVE will fire.
   *  The dialog can display a pre-warning, but the action is the source
   *  of truth on submit. */
  match_status: string;
  matched_total: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payload: BankDuplicateReviewPayload | null;
  /** Subdivision short code for the in-error CTA link to the bank tx
   *  detail page where the manager can undo the match. */
  subdivisionCode: string;
  /** Fired after a successful confirm or reject. Parent typically
   *  refreshes (router.refresh) and updates its open state. */
  onResolved?: () => void;
}

// ─── State machine ────────────────────────────────────────────────────────

type Action = "confirm" | "reject";
type DialogState =
  | { kind: "choosing" }
  | { kind: "submitting"; action: Action }
  | { kind: "done"; outcome: Action }
  | {
      kind: "error";
      message: string;
      errorCode: string | null;
      recoverable: boolean;
      action: Action;
    };

type Event =
  | { type: "USER_CHOSE"; action: Action }
  | { type: "RESULT_OK"; action: Action }
  | { type: "RESULT_ERR"; message: string; errorCode: string | null; recoverable: boolean; action: Action }
  | { type: "USER_RETRY" }
  | { type: "RESET" };

function reducer(state: DialogState, event: Event): DialogState {
  switch (event.type) {
    case "USER_CHOSE":
      if (state.kind === "choosing" || state.kind === "error") {
        return { kind: "submitting", action: event.action };
      }
      return state;
    case "RESULT_OK":
      return { kind: "done", outcome: event.action };
    case "RESULT_ERR":
      return {
        kind: "error",
        message: event.message,
        errorCode: event.errorCode,
        recoverable: event.recoverable,
        action: event.action,
      };
    case "USER_RETRY":
      if (state.kind === "error") return { kind: "choosing" };
      return state;
    case "RESET":
      return { kind: "choosing" };
    default:
      return state;
  }
}

// ─── Render helpers ───────────────────────────────────────────────────────

function formatCurrency(n: number): string {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n);
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${iso}T00:00:00`));
}

// ─── Component ────────────────────────────────────────────────────────────

export function BankDuplicateReviewDialog({
  open,
  onOpenChange,
  payload,
  subdivisionCode,
  onResolved,
}: Props) {
  const router = useRouter();
  const [state, dispatch] = useReducer(reducer, { kind: "choosing" });
  const [notes, setNotes] = useState("");

  // Reset internal state whenever the dialog re-opens with a new payload.
  // useEffect-less guard: when transitioning to closed, schedule a reset
  // so the next open starts at 'choosing'.
  function handleOpenChange(next: boolean) {
    if (!next) {
      // Defer the reset to the next tick so closing animation reads stable state.
      setTimeout(() => {
        dispatch({ type: "RESET" });
        setNotes("");
      }, 0);
    }
    onOpenChange(next);
  }

  async function performAction(action: Action) {
    if (!payload) return;
    dispatch({ type: "USER_CHOSE", action });
    const trimmedNotes = notes.trim().length > 0 ? notes.trim() : null;

    try {
      const result =
        action === "confirm"
          ? await confirmDuplicate({
              subdivision_id: payload.subdivision_id,
              bank_transaction_id: payload.bank_transaction_id,
              notes: trimmedNotes,
            })
          : await rejectDuplicate({
              subdivision_id: payload.subdivision_id,
              bank_transaction_id: payload.bank_transaction_id,
              notes: trimmedNotes,
            });

      if (result.error) {
        const recoverable = result.errorCode !== "MATCH_ACTIVE" && result.errorCode !== "FORBIDDEN" && result.errorCode !== "NOT_FOUND";
        dispatch({
          type: "RESULT_ERR",
          message: result.error,
          errorCode: result.errorCode ?? null,
          recoverable,
          action,
        });
        return;
      }

      dispatch({ type: "RESULT_OK", action });
      if (action === "confirm") {
        toast.success("Marked as duplicate. Excluded from ledger reconciliation.");
      } else {
        toast.success("Not a duplicate. Auto-matching re-run.");
      }
      onResolved?.();
      router.refresh();
      // Brief pause so the user sees the done state before the dialog closes.
      setTimeout(() => handleOpenChange(false), 600);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unexpected error";
      dispatch({ type: "RESULT_ERR", message, errorCode: null, recoverable: true, action });
    }
  }

  if (!payload) return null;
  const meta = payload.duplicate_metadata;
  const cachedMatchActive =
    payload.match_status === "auto_matched" ||
    payload.match_status === "manually_matched" ||
    payload.matched_total > 0;
  const isStaleNotSuspected = payload.duplicate_status !== "suspected";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Review possible duplicate</DialogTitle>
          <DialogDescription>
            The detector flagged this transaction as a possible duplicate of an earlier one in the
            same account. Confirm to exclude it from reconciliation, or reject to let it match
            normally.
          </DialogDescription>
        </DialogHeader>

        {isStaleNotSuspected && (
          <div className="rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
            This transaction is no longer flagged as suspected (status:{" "}
            <span className="font-medium">{payload.duplicate_status ?? "none"}</span>). Another
            manager may have already reviewed it. Close this dialog and refresh the queue.
          </div>
        )}

        {cachedMatchActive && !isStaleNotSuspected && (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <div>
                <span className="font-medium">Currently allocated.</span> This transaction has{" "}
                {formatCurrency(payload.matched_total)} allocated to ledger entries. You&apos;ll
                need to undo the match before confirming as duplicate.
              </div>
            </div>
          </div>
        )}

        {/* Detection details */}
        <div className="space-y-3 text-sm">
          <div className="rounded-md border border-border p-3">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1">
              This transaction (newer)
            </div>
            <div className="font-medium tabular-nums">{formatCurrency(payload.current.amount)}</div>
            <div className="text-xs text-muted-foreground mt-1">
              {formatDate(payload.current.transaction_date)} · {payload.current.source}
            </div>
            {payload.current.description && (
              <div className="text-xs text-muted-foreground mt-1 italic truncate">
                {payload.current.description}
              </div>
            )}
          </div>

          <div className="rounded-md border border-border p-3">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1">
              Suspected duplicate of (older)
            </div>
            {payload.candidate ? (
              <>
                <div className="font-medium tabular-nums">
                  {formatCurrency(payload.candidate.amount)}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {formatDate(payload.candidate.transaction_date)} · {payload.candidate.source}
                </div>
                {payload.candidate.description && (
                  <div className="text-xs text-muted-foreground mt-1 italic truncate">
                    {payload.candidate.description}
                  </div>
                )}
              </>
            ) : (
              <div className="text-xs text-muted-foreground italic">
                Older transaction id: {meta.matched_against}
              </div>
            )}
          </div>

          <div className="text-xs text-muted-foreground space-y-0.5">
            <div>
              Day gap: <span className="font-medium">{meta.day_delta}</span> ·{" "}
              Source pair: <span className="font-medium">{meta.older_source} → {meta.newer_source}</span>
            </div>
            <div className="font-mono text-[10px] truncate">
              hash: {meta.description_hash}
            </div>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="duplicate-review-notes" className="text-xs">
            Notes (optional)
          </Label>
          <Textarea
            id="duplicate-review-notes"
            placeholder="Anything worth recording for forensics"
            rows={2}
            maxLength={MAX_NOTES_LEN}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={state.kind === "submitting" || state.kind === "done"}
          />
          <div className="text-[10px] text-muted-foreground text-right">
            {notes.length}/{MAX_NOTES_LEN}
          </div>
        </div>

        {state.kind === "error" && (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive space-y-2">
            <div className="font-medium">{state.message}</div>
            {state.errorCode === "MATCH_ACTIVE" && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  router.push(
                    `/subdivisions/${subdivisionCode}/reconciliation/${payload.bank_transaction_id}`,
                  )
                }
                className="gap-1.5"
              >
                <ExternalLink className="h-3 w-3" />
                Open transaction to undo match
              </Button>
            )}
            {state.recoverable && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => dispatch({ type: "USER_RETRY" })}
              >
                Try again
              </Button>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={state.kind === "submitting"}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => performAction("reject")}
            disabled={
              state.kind === "submitting" ||
              state.kind === "done" ||
              isStaleNotSuspected
            }
          >
            {state.kind === "submitting" && state.action === "reject"
              ? "Rejecting…"
              : "Not a duplicate"}
          </Button>
          <Button
            type="button"
            onClick={() => performAction("confirm")}
            disabled={
              state.kind === "submitting" ||
              state.kind === "done" ||
              isStaleNotSuspected ||
              cachedMatchActive
            }
          >
            {state.kind === "submitting" && state.action === "confirm"
              ? "Confirming…"
              : "Confirm duplicate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
