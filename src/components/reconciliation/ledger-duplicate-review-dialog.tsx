"use client";

// ============================================================================
// LedgerDuplicateReviewDialog — PP5-D-B
// ----------------------------------------------------------------------------
// Manager-facing dialog for ledger-side duplicate review. Calls
// voidAsLedgerDuplicate / keepAsOverpayment from PP5-B. State machine
// modelled on PP5-D-A's BankDuplicateReviewDialog.
//
// Two-verb pattern (per PP5-B Q4 ratification):
//   - "Void as duplicate"  → confirms duplicate; rpc_unmatch_bank_transaction
//                           cascade voids the credit + creates void_offset.
//                           Returns void_offset_id + unmatched_bank_tx_ids[].
//   - "Keep as overpayment" → entry stays active; duplicate_status='rejected';
//                            credit remains on the lot's ledger.
//
// Pre-warning banners at choosing stage:
//   - parent_status === 'voided' (post-detection void of the parent entry):
//     amber banner with cascade explanation.
//   - duplicate_status !== 'suspected' (stale prop; another manager already
//     reviewed): grey "already reviewed" banner.
//
// MULTI_LINKED error: hard error with no remediation path. Cancel-only.
// Currently impossible per UNIQUE(bank_tx, ledger_entry) but PP5-B's guard
// fires defensively. CONTEXT.md PP5 §4.8 documents the architectural
// assumption.
// ============================================================================

import { useReducer, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";

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
  voidAsLedgerDuplicate,
  keepAsOverpayment,
} from "@/lib/actions/reconciliation";
import type { LedgerEntryStatus } from "@/lib/validations/ledger";

const MAX_NOTES_LEN = 500;

// ─── Props ────────────────────────────────────────────────────────────────

export interface LedgerDuplicateReviewPayload {
  /** The ledger entry under review (suspected duplicate). */
  lot_ledger_entry_id: string;
  oc_id: string;
  /** Display fields for the entry. */
  current: {
    entry_date: string;
    amount: number;
    fund_type: "administrative" | "capital_works" | "maintenance_plan";
    levy_notice_id: string | null;
    description: string | null;
  };
  /** Detection metadata from PP5-B (older entry id, lot, levy_notice,
   *  amount, day_delta, category pair). The dialog renders human-readable
   *  fields; the ledger detector's metadata shape is the contract. */
  duplicate_metadata: {
    matched_against: string;
    lot_id: string;
    levy_notice_id: string;
    amount: number;
    day_delta: number;
    older_category: string;
    newer_category: string;
  };
  /** Cached current duplicate_status. The action re-checks on submit;
   *  shown here so a stale-prop open renders an explicit banner. */
  duplicate_status: "suspected" | "confirmed" | "rejected" | null;
  /** Pre-fetched parent (older) entry's status (PP5-D-B Gap I). When
   *  'voided', the warning banner fires. Null if no parent or join was
   *  not pre-fetched (e.g. opened from a non-tab/drawer surface). */
  parent_status: LedgerEntryStatus | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payload: LedgerDuplicateReviewPayload | null;
  /** Fired after successful void or keep. Parent typically refreshes
   *  (router.refresh) and may close adjacent surfaces (e.g. an open
   *  ledger drawer Sheet). */
  onResolved?: () => void;
}

// ─── State machine ────────────────────────────────────────────────────────

type Action = "void" | "keep";

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

const FUND_LABEL: Record<"administrative" | "capital_works" | "maintenance_plan", string> = {
  administrative: "Admin fund",
  capital_works: "Capital works",
  maintenance_plan: "Maintenance plan",
};

// Maps PP5-B's LedgerDuplicateReviewErrorCode to recoverability.
function classifyErrorCode(code: string | null): {
  recoverable: boolean;
  defaultMessage?: string;
} {
  switch (code) {
    case "MULTI_LINKED":
      return {
        recoverable: false,
        defaultMessage:
          "This ledger entry is linked to multiple bank transactions. This is an unusual state — please contact support before proceeding.",
      };
    case "ALREADY_VOIDED":
      return {
        recoverable: false,
        defaultMessage:
          "This entry has already been voided through another path. Close and refresh.",
      };
    case "NOT_SUSPECTED":
      return {
        recoverable: false,
        defaultMessage: "This entry is no longer flagged as a suspected duplicate.",
      };
    case "FORBIDDEN":
    case "NOT_FOUND":
      return { recoverable: false, defaultMessage: "Access denied." };
    default:
      // Transient DB / network: recoverable.
      return { recoverable: true };
  }
}

// ─── Component ────────────────────────────────────────────────────────────

export function LedgerDuplicateReviewDialog({
  open,
  onOpenChange,
  payload,
  onResolved,
}: Props) {
  const router = useRouter();
  const [state, dispatch] = useReducer(reducer, { kind: "choosing" });
  const [notes, setNotes] = useState("");

  function handleOpenChange(next: boolean) {
    if (!next) {
      // Defer reset to next tick so closing animation reads stable state.
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
        action === "void"
          ? await voidAsLedgerDuplicate({
              oc_id: payload.oc_id,
              lot_ledger_entry_id: payload.lot_ledger_entry_id,
              notes: trimmedNotes,
            })
          : await keepAsOverpayment({
              oc_id: payload.oc_id,
              lot_ledger_entry_id: payload.lot_ledger_entry_id,
              notes: trimmedNotes,
            });

      if (result.error) {
        const cls = classifyErrorCode(result.errorCode ?? null);
        dispatch({
          type: "RESULT_ERR",
          message: cls.defaultMessage ?? result.error,
          errorCode: result.errorCode ?? null,
          recoverable: cls.recoverable,
          action,
        });
        return;
      }

      dispatch({ type: "RESULT_OK", action });
      // Toast wording per PP5-D-B-0 Gap M ratification.
      if (action === "void") {
        const unmatched = result.success && "voided" in result.success
          ? (result.success.unmatched_bank_tx_ids ?? []).length
          : 0;
        if (unmatched > 0) {
          toast.success(
            `Voided as duplicate. ${unmatched} bank transaction${unmatched === 1 ? "" : "s"} unmatched.`,
          );
        } else {
          toast.success("Voided as duplicate. No bank transactions to unmatch.");
        }
      } else {
        toast.success("Kept as overpayment. The credit remains on the lot.");
      }
      onResolved?.();
      router.refresh();
      // Brief pause so the user sees done state before the dialog closes.
      setTimeout(() => handleOpenChange(false), 600);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unexpected error";
      dispatch({ type: "RESULT_ERR", message, errorCode: null, recoverable: true, action });
    }
  }

  if (!payload) return null;
  const meta = payload.duplicate_metadata;
  const isStaleNotSuspected = payload.duplicate_status !== "suspected";
  const parentVoided = payload.parent_status === "voided";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Review possible duplicate payment</DialogTitle>
          <DialogDescription>
            The detector flagged this credit as a possible duplicate of an earlier payment on
            the same levy notice. Choose how to resolve it.
          </DialogDescription>
        </DialogHeader>

        {isStaleNotSuspected && (
          <div className="rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
            This entry is no longer flagged as suspected (status:{" "}
            <span className="font-medium">{payload.duplicate_status ?? "none"}</span>).
            Another manager may have already reviewed it. Close this dialog and refresh.
          </div>
        )}

        {parentVoided && !isStaleNotSuspected && (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <div>
                <span className="font-medium">The original entry this duplicates has been voided.</span>{" "}
                <span className="font-medium">Void as duplicate</span> creates an offsetting
                credit; <span className="font-medium">Keep as overpayment</span> leaves the
                entry as a real credit balance on the lot. Decide carefully.
              </div>
            </div>
          </div>
        )}

        {/* Detection details */}
        <div className="space-y-3 text-sm">
          <div className="rounded-md border border-border p-3">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1">
              This payment (newer)
            </div>
            <div className="font-medium tabular-nums">{formatCurrency(payload.current.amount)}</div>
            <div className="text-xs text-muted-foreground mt-1">
              {formatDate(payload.current.entry_date)} · {FUND_LABEL[payload.current.fund_type]}
              {meta.newer_category ? ` · ${meta.newer_category}` : ""}
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
            <div className="font-medium tabular-nums">{formatCurrency(meta.amount)}</div>
            <div className="text-xs text-muted-foreground mt-1">
              {meta.older_category} · same lot, same levy notice
            </div>
            <div className="text-[10px] text-muted-foreground mt-1 font-mono truncate">
              entry: {meta.matched_against}
            </div>
          </div>

          <div className="text-xs text-muted-foreground">
            Day gap: <span className="font-medium">{meta.day_delta}</span>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="ledger-duplicate-notes" className="text-xs">
            Notes (optional)
          </Label>
          <Textarea
            id="ledger-duplicate-notes"
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
            {state.errorCode && (
              <div className="text-[10px] font-mono opacity-75">
                Error code: {state.errorCode}
              </div>
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
            onClick={() => performAction("keep")}
            disabled={
              state.kind === "submitting" ||
              state.kind === "done" ||
              isStaleNotSuspected ||
              (state.kind === "error" &&
                (state.errorCode === "MULTI_LINKED" ||
                  state.errorCode === "ALREADY_VOIDED"))
            }
          >
            {state.kind === "submitting" && state.action === "keep"
              ? "Keeping…"
              : "Keep as overpayment"}
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => performAction("void")}
            disabled={
              state.kind === "submitting" ||
              state.kind === "done" ||
              isStaleNotSuspected ||
              (state.kind === "error" &&
                (state.errorCode === "MULTI_LINKED" ||
                  state.errorCode === "ALREADY_VOIDED"))
            }
          >
            {state.kind === "submitting" && state.action === "void"
              ? "Voiding…"
              : "Void as duplicate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
