"use client";

// ============================================================================
// ManagerClaimReviewDialog — PP5-D-C-B
// ----------------------------------------------------------------------------
// Multi-stage manager-facing dialog for reviewing an owner-submitted
// payment claim. Three terminal action paths (per PP5-C / PP5-D-C-0):
//   - match-existing (path iii PRIMARY): link the claim to an
//     already-existing bank transaction. Calls
//     confirmAndMatchClaimViaExistingBankTx.
//   - match-new (path ii FALLBACK): create a new manual bank tx for the
//     claim with a single allocation row. Calls
//     confirmAndMatchClaimViaNewBankTx with LIKELY_DUPLICATE handling.
//   - reject: rejection_reason ≥10 chars; calls rejectPaymentClaim.
//
// Stages: default → match-existing | match-new | reject
//                 + submitting → done | error
// Error state tracks returnToStage so retry preserves the manager's
// prior selection / form state.
//
// LIKELY_DUPLICATE is NOT an error stage. The match-new submit path,
// on receiving errorCode='LIKELY_DUPLICATE', hydrates the candidate
// IDs via getBankTxSnapshotsByIds and transitions back to match-new
// with `likelyDuplicates` populated — UI renders an inline candidate
// list above the form with "Use this one" CTAs and a "Proceed anyway"
// override button.
//
// Empty-state in match-existing auto-pivots to match-new after 1.2s.
// pivotTimerHandle is tracked so cleanup paths (RESET, switch-to-new,
// back-to-default, unmount) all clear it cleanly.
// ============================================================================

import { useReducer, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarIcon,
  Check,
  ChevronRight,
  Loader2,
} from "lucide-react";
import { format } from "date-fns";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";

import {
  confirmAndMatchClaimViaExistingBankTx,
  confirmAndMatchClaimViaNewBankTx,
  rejectPaymentClaim,
  getNearbyBankTxsForClaim,
  getBankTxSnapshotsByIds,
  type NearbyBankTxRow,
} from "@/lib/actions/owner-payment-claims";
import { getBankAccountsForOC } from "@/lib/actions/bank-transactions";
import {
  OWNER_CLAIM_PAYMENT_METHOD_LABELS,
  type ManagerClaimQueueRow,
} from "@/lib/validations/owner-payment-claims";
import type { BankAccountSummary } from "@/lib/validations/bank-transactions";

const PIVOT_DELAY_MS = 1200;
const MAX_REJECTION_REASON_LEN = 1000;
const MIN_REJECTION_REASON_LEN = 10;
const MAX_NOTES_LEN = 500;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const FUND_TYPE_LABELS: Record<"administrative" | "capital_works" | "maintenance_plan", string> = {
  administrative: "Administrative",
  capital_works: "Capital works",
  maintenance_plan: "Maintenance plan",
};

// ─── Form schemas (react-hook-form-driven; reducer doesn't track these) ──

const matchNewFormSchema = z.object({
  bank_account_id: z.string().uuid("Select a bank account"),
  transaction_date: z.string().regex(ISO_DATE, "Date must be YYYY-MM-DD"),
  description: z.string().trim().max(256, "Description too long").default(""),
  reference: z.string().trim().max(100).default(""),
  levy_notice_id: z.string().uuid().nullable().optional(),
  notes: z.string().trim().max(MAX_NOTES_LEN).default(""),
});
type MatchNewFormInput = z.input<typeof matchNewFormSchema>;
type MatchNewFormOutput = z.infer<typeof matchNewFormSchema>;

const rejectFormSchema = z.object({
  rejection_reason: z
    .string()
    .trim()
    .min(MIN_REJECTION_REASON_LEN, `At least ${MIN_REJECTION_REASON_LEN} characters`)
    .max(MAX_REJECTION_REASON_LEN),
});
type RejectFormInput = z.input<typeof rejectFormSchema>;
type RejectFormOutput = z.infer<typeof rejectFormSchema>;

// ─── State machine ────────────────────────────────────────────────────────

type SubmittingAction = "match-existing" | "match-new" | "reject";
type ReturnableStage = "default" | "match-existing" | "match-new" | "reject";

type DialogState =
  | { kind: "default" }
  | {
      kind: "match-existing";
      candidates: NearbyBankTxRow[] | null; // null = loading
      pivotTimerHandle: ReturnType<typeof setTimeout> | null;
    }
  | {
      kind: "match-new";
      likelyDuplicates: NearbyBankTxRow[] | null;
    }
  | { kind: "reject" }
  | { kind: "submitting"; action: SubmittingAction }
  | { kind: "done"; outcome: "matched" | "rejected" }
  | {
      kind: "error";
      message: string;
      errorCode: string | null;
      recoverable: boolean;
      returnToStage: ReturnableStage;
    };

type Event =
  | { type: "USER_CHOSE_MATCH" }
  | { type: "USER_CHOSE_REJECT" }
  | { type: "USER_SWITCH_TO_MATCH_NEW" }
  | { type: "USER_BACK_TO_DEFAULT" }
  | { type: "CANDIDATES_LOADED"; rows: NearbyBankTxRow[] }
  | { type: "PIVOT_TIMER_SET"; handle: ReturnType<typeof setTimeout> }
  | { type: "EMPTY_PIVOT_FIRED" }
  | { type: "USER_SUBMIT"; action: SubmittingAction }
  | { type: "RESULT_OK"; outcome: "matched" | "rejected" }
  | { type: "RESULT_LIKELY_DUPLICATE"; rows: NearbyBankTxRow[] }
  | {
      type: "RESULT_ERR";
      message: string;
      errorCode: string | null;
      recoverable: boolean;
      returnToStage: ReturnableStage;
    }
  | { type: "USER_RETRY" }
  | { type: "RESET" };

function clearPivotIfMatchExisting(state: DialogState) {
  if (state.kind === "match-existing" && state.pivotTimerHandle !== null) {
    clearTimeout(state.pivotTimerHandle);
  }
}

function reducer(state: DialogState, event: Event): DialogState {
  switch (event.type) {
    case "USER_CHOSE_MATCH":
      if (state.kind === "default") {
        return { kind: "match-existing", candidates: null, pivotTimerHandle: null };
      }
      return state;

    case "USER_CHOSE_REJECT":
      if (state.kind === "default") return { kind: "reject" };
      return state;

    case "USER_SWITCH_TO_MATCH_NEW":
      clearPivotIfMatchExisting(state);
      if (
        state.kind === "match-existing" ||
        state.kind === "default"
      ) {
        return { kind: "match-new", likelyDuplicates: null };
      }
      return state;

    case "USER_BACK_TO_DEFAULT":
      clearPivotIfMatchExisting(state);
      if (
        state.kind === "match-existing" ||
        state.kind === "match-new" ||
        state.kind === "reject" ||
        state.kind === "error"
      ) {
        return { kind: "default" };
      }
      return state;

    case "CANDIDATES_LOADED":
      if (state.kind === "match-existing") {
        return { ...state, candidates: event.rows };
      }
      return state;

    case "PIVOT_TIMER_SET":
      if (state.kind === "match-existing") {
        return { ...state, pivotTimerHandle: event.handle };
      }
      return state;

    case "EMPTY_PIVOT_FIRED":
      clearPivotIfMatchExisting(state);
      if (state.kind === "match-existing") {
        return { kind: "match-new", likelyDuplicates: null };
      }
      return state;

    case "USER_SUBMIT": {
      // Submit double-fire guard: only transition if currently at the
      // expected source stage. Component-side button disabled state is
      // the primary guard; this is belt-and-braces.
      //
      // match-existing also valid from match-new when likelyDuplicates
      // is non-null — the LIKELY_DUPLICATE inline panel renders
      // CandidateRows that submit through match-existing (Gap B). The
      // action semantically IS match-existing; the dispatcher just
      // needs to allow this source state so transition-to-submitting
      // happens atomically with the click (no async-window double-fire).
      const valid =
        (event.action === "match-existing" &&
          (state.kind === "match-existing" ||
            (state.kind === "match-new" && state.likelyDuplicates !== null))) ||
        (event.action === "match-new" && state.kind === "match-new") ||
        (event.action === "reject" && state.kind === "reject") ||
        // Allow retry from error state — retry first transitions to the
        // returnToStage, then dispatches USER_SUBMIT from there.
        state.kind === "error";
      if (valid) {
        clearPivotIfMatchExisting(state);
        return { kind: "submitting", action: event.action };
      }
      return state;
    }

    case "RESULT_OK":
      return { kind: "done", outcome: event.outcome };

    case "RESULT_LIKELY_DUPLICATE":
      // Special transition: NOT an error. Returns to match-new stage with
      // hydrated candidate rows — UI renders inline candidate list with
      // "Use this one" / "Proceed anyway" CTAs.
      return { kind: "match-new", likelyDuplicates: event.rows };

    case "RESULT_ERR":
      return {
        kind: "error",
        message: event.message,
        errorCode: event.errorCode,
        recoverable: event.recoverable,
        returnToStage: event.returnToStage,
      };

    case "USER_RETRY":
      if (state.kind === "error" && state.recoverable) {
        // Restore the source stage; component re-issues the submit on
        // next user action via the form's onSubmit handler.
        switch (state.returnToStage) {
          case "default":
            return { kind: "default" };
          case "match-existing":
            // Candidates may be stale — re-trigger the fetch via stage entry.
            return { kind: "match-existing", candidates: null, pivotTimerHandle: null };
          case "match-new":
            return { kind: "match-new", likelyDuplicates: null };
          case "reject":
            return { kind: "reject" };
        }
      }
      return state;

    case "RESET":
      clearPivotIfMatchExisting(state);
      return { kind: "default" };

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

function dayDeltaLabel(delta: number): string {
  if (delta === 0) return "same day";
  const abs = Math.abs(delta);
  return delta > 0 ? `${abs} day${abs === 1 ? "" : "s"} after` : `${abs} day${abs === 1 ? "" : "s"} before`;
}

function classifyErrorCode(code: string | null, action: SubmittingAction): {
  recoverable: boolean;
  defaultMessage?: string;
  returnToStage: ReturnableStage;
} {
  const stageFromAction: ReturnableStage =
    action === "match-existing" ? "match-existing" :
    action === "match-new" ? "match-new" : "reject";
  switch (code) {
    case "NOT_PENDING":
      return {
        recoverable: false,
        defaultMessage:
          "This claim has already been reviewed. Close and refresh the queue.",
        returnToStage: stageFromAction,
      };
    case "FORBIDDEN":
      return {
        recoverable: false,
        defaultMessage: "Access denied — this claim isn't in your oc.",
        returnToStage: stageFromAction,
      };
    case "NOT_FOUND":
      return {
        recoverable: false,
        defaultMessage: "Claim not found.",
        returnToStage: stageFromAction,
      };
    case "LOT_OWNERSHIP_INVALID":
      return {
        recoverable: false,
        defaultMessage:
          "Owner doesn't own the claimed lot. Reload the queue and try again.",
        returnToStage: stageFromAction,
      };
    default:
      return { recoverable: true, returnToStage: stageFromAction };
  }
}

// ─── Props ────────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Per Gap V — direct reuse of ManagerClaimQueueRow as the dialog
   *  payload. Every field needed for default-stage rendering is present;
   *  no extra fetch on dialog open. */
  payload: ManagerClaimQueueRow | null;
  /** Fired after a successful match or reject — parent typically
   *  invokes router.refresh() so the reviewed claim drops off the
   *  pending list. */
  onResolved?: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────

export function ManagerClaimReviewDialog({
  open,
  onOpenChange,
  payload,
  onResolved,
}: Props) {
  const router = useRouter();
  const [state, dispatch] = useReducer(reducer, { kind: "default" });

  // Component-state holds the manager's selected bank_tx_id during the
  // match-existing → submit flow (preserved across error → retry per
  // implementation-note 1). Only the setter is read; the value is
  // tracked for future cross-error-retry hydration if a UX iteration
  // needs to highlight the previously-chosen candidate.
  const [, setSelectedBankTxId] = useState<string | null>(null);

  // Loaded by the bank-account picker on dialog open.
  const [bankAccounts, setBankAccounts] = useState<BankAccountSummary[]>([]);

  // Cleanup pivot timer on unmount (per Gap BB).
  const pivotHandleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (pivotHandleRef.current !== null) {
        clearTimeout(pivotHandleRef.current);
        pivotHandleRef.current = null;
      }
    };
  }, []);

  // Forms — held by react-hook-form so retry preserves manager input
  // (per the returnToStage model). Both reset on RESET via dialog close.
  const matchNewForm = useForm<MatchNewFormInput>({
    resolver: zodResolver(matchNewFormSchema),
    defaultValues: {
      bank_account_id: "",
      transaction_date: payload?.claim_date ?? "",
      description: "",
      reference: "",
      levy_notice_id: null,
      notes: "",
    },
  });
  const rejectForm = useForm<RejectFormInput>({
    resolver: zodResolver(rejectFormSchema),
    defaultValues: { rejection_reason: "" },
  });

  // Reset forms + reducer state on payload change (new claim opened)
  // OR on dialog close.
  useEffect(() => {
    if (!open) {
      // Defer reset so the closing animation reads stable state.
      const handle = setTimeout(() => {
        dispatch({ type: "RESET" });
        setSelectedBankTxId(null);
        matchNewForm.reset({
          bank_account_id: "",
          transaction_date: payload?.claim_date ?? "",
          description: "",
          reference: "",
          levy_notice_id: null,
          notes: "",
        });
        rejectForm.reset({ rejection_reason: "" });
      }, 0);
      return () => clearTimeout(handle);
    }
    // Re-prime form defaults on open.
    matchNewForm.reset({
      bank_account_id: "",
      transaction_date: payload?.claim_date ?? "",
      description: "",
      reference: "",
      levy_notice_id: null,
      notes: "",
    });
    rejectForm.reset({ rejection_reason: "" });
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, payload?.id]);

  // Fetch bank accounts on dialog open (cheap; single oc).
  useEffect(() => {
    if (!open || !payload) return;
    let cancelled = false;
    void (async () => {
      try {
        const accounts = await getBankAccountsForOC(payload.oc_id);
        if (!cancelled) setBankAccounts(accounts);
      } catch (e) {
        if (!cancelled) {
          toast.error(e instanceof Error ? e.message : "Failed to load bank accounts");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, payload?.oc_id, payload]);

  // Side-effect: when state transitions to match-existing with candidates===null,
  // kick off getNearbyBankTxsForClaim. Dispatches CANDIDATES_LOADED on success.
  useEffect(() => {
    if (!payload) return;
    if (state.kind !== "match-existing") return;
    if (state.candidates !== null) return; // already loaded
    let cancelled = false;
    void (async () => {
      const result = await getNearbyBankTxsForClaim(payload.id);
      if (cancelled) return;
      if (!result.ok) {
        dispatch({
          type: "RESULT_ERR",
          message: result.error,
          errorCode: result.errorCode ?? null,
          recoverable: false,
          returnToStage: "default",
        });
        return;
      }
      dispatch({ type: "CANDIDATES_LOADED", rows: result.rows });
      if (result.rows.length === 0) {
        const handle = setTimeout(() => {
          dispatch({ type: "EMPTY_PIVOT_FIRED" });
          pivotHandleRef.current = null;
        }, PIVOT_DELAY_MS);
        pivotHandleRef.current = handle;
        dispatch({ type: "PIVOT_TIMER_SET", handle });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [state.kind, payload, state]);

  // ─── Submit handlers ──────────────────────────────────────────────────

  async function performMatchExistingSubmit(bankTxId: string) {
    if (!payload) return;
    setSelectedBankTxId(bankTxId);
    dispatch({ type: "USER_SUBMIT", action: "match-existing" });

    // For match-existing's "Use this one" inline submit, we need a
    // bank_account.fund_type for the allocation. Look up the candidate
    // row by id from current state to get fund_type. (state was
    // 'match-existing' with candidates loaded immediately prior to this
    // dispatch.)
    const candidate =
      state.kind === "match-existing"
        ? state.candidates?.find((c) => c.id === bankTxId)
        : null;
    const fundType = candidate?.fund_type ?? "administrative";

    const result = await confirmAndMatchClaimViaExistingBankTx({
      claim_id: payload.id,
      bank_transaction_id: bankTxId,
      allocations: [
        {
          lot_id: payload.lot_id,
          fund_type: fundType,
          amount: payload.amount,
          levy_notice_id: null,
        },
      ],
    });

    if (result.error) {
      const cls = classifyErrorCode(result.errorCode ?? null, "match-existing");
      dispatch({
        type: "RESULT_ERR",
        message: cls.defaultMessage ?? result.error,
        errorCode: result.errorCode ?? null,
        recoverable: cls.recoverable,
        returnToStage: cls.returnToStage,
      });
      return;
    }
    dispatch({ type: "RESULT_OK", outcome: "matched" });
    toast.success("Claim matched. Linked to bank transaction + ledger credit.");
    onResolved?.();
    router.refresh();
    setTimeout(() => onOpenChange(false), 600);
  }

  async function performMatchNewSubmit(
    formValues: MatchNewFormOutput,
    overrideLikelyDuplicate: boolean,
  ) {
    if (!payload) return;
    dispatch({ type: "USER_SUBMIT", action: "match-new" });

    const account = bankAccounts.find((a) => a.id === formValues.bank_account_id);
    const fundType = account?.fund_type ?? "administrative";

    const result = await confirmAndMatchClaimViaNewBankTx({
      claim_id: payload.id,
      bank_account_id: formValues.bank_account_id,
      transaction_date: formValues.transaction_date,
      description: formValues.description,
      override_likely_duplicate: overrideLikelyDuplicate,
      allocations: [
        {
          lot_id: payload.lot_id,
          fund_type: fundType,
          amount: payload.amount,
          levy_notice_id: formValues.levy_notice_id ?? null,
          reference: formValues.reference ? formValues.reference : null,
        },
      ],
      notes: formValues.notes ? formValues.notes : null,
    });

    if (result.error) {
      // LIKELY_DUPLICATE: special transition — not an error stage.
      if (result.errorCode === "LIKELY_DUPLICATE") {
        const ids = result.likely_duplicate_bank_tx_ids ?? [];
        const hyd = await getBankTxSnapshotsByIds(ids, payload.id);
        if (!hyd.ok) {
          dispatch({
            type: "RESULT_ERR",
            message: hyd.error,
            errorCode: hyd.errorCode ?? null,
            recoverable: false,
            returnToStage: "match-new",
          });
          return;
        }
        dispatch({ type: "RESULT_LIKELY_DUPLICATE", rows: hyd.rows });
        return;
      }
      const cls = classifyErrorCode(result.errorCode ?? null, "match-new");
      dispatch({
        type: "RESULT_ERR",
        message: cls.defaultMessage ?? result.error,
        errorCode: result.errorCode ?? null,
        recoverable: cls.recoverable,
        returnToStage: cls.returnToStage,
      });
      return;
    }

    dispatch({ type: "RESULT_OK", outcome: "matched" });
    toast.success("Claim matched. Linked to bank transaction + ledger credit.");
    onResolved?.();
    router.refresh();
    setTimeout(() => onOpenChange(false), 600);
  }

  async function performRejectSubmit(formValues: RejectFormOutput) {
    if (!payload) return;
    dispatch({ type: "USER_SUBMIT", action: "reject" });
    const result = await rejectPaymentClaim({
      claim_id: payload.id,
      rejection_reason: formValues.rejection_reason,
    });
    if (result.error) {
      const cls = classifyErrorCode(result.errorCode ?? null, "reject");
      dispatch({
        type: "RESULT_ERR",
        message: cls.defaultMessage ?? result.error,
        errorCode: result.errorCode ?? null,
        recoverable: cls.recoverable,
        returnToStage: cls.returnToStage,
      });
      return;
    }
    dispatch({ type: "RESULT_OK", outcome: "rejected" });
    toast.success("Claim rejected. The owner will see the reason in their portal.");
    onResolved?.();
    router.refresh();
    setTimeout(() => onOpenChange(false), 600);
  }

  if (!payload) return null;

  // ─── Render ───────────────────────────────────────────────────────────

  const selectedFundType = (() => {
    const acctId = matchNewForm.watch("bank_account_id");
    return bankAccounts.find((a) => a.id === acctId)?.fund_type ?? null;
  })();
  const rejectionReason = rejectForm.watch("rejection_reason");
  const rejectionReasonLength = (rejectionReason ?? "").trim().length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Review payment claim</DialogTitle>
          <DialogDescription>
            Match this claim to a bank transaction or reject it with a reason.
          </DialogDescription>
        </DialogHeader>

        {/* ── Claim summary (always visible) ─────────────────────────── */}
        <div className="rounded-md border border-border p-3 space-y-1">
          <div className="flex items-center gap-3 flex-wrap text-sm">
            <span className="font-semibold tabular-nums">{formatCurrency(payload.amount)}</span>
            <span className="text-xs text-muted-foreground">·</span>
            <span className="font-medium">{payload.owner_display_name}</span>
            <span className="text-xs text-muted-foreground">·</span>
            <span>{payload.lot_label}</span>
          </div>
          <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
            <span>Paid {formatDate(payload.claim_date)}</span>
            <span>·</span>
            <span>{OWNER_CLAIM_PAYMENT_METHOD_LABELS[payload.payment_method]}</span>
            {payload.reference && (
              <>
                <span>·</span>
                <span>Ref: {payload.reference}</span>
              </>
            )}
          </div>
          {payload.notes && (
            <div className="text-xs text-muted-foreground italic mt-1">
              &ldquo;{payload.notes}&rdquo;
            </div>
          )}
        </div>

        {/* ── Stage rendering ─────────────────────────────────────────── */}

        {/* default: action picker */}
        {state.kind === "default" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            <Button
              type="button"
              variant="default"
              className="h-auto py-4 flex flex-col gap-1"
              onClick={() => dispatch({ type: "USER_CHOSE_MATCH" })}
            >
              <span className="font-semibold">Match to bank transaction</span>
              <span className="text-xs opacity-90">
                Link this claim to a bank tx + create a ledger credit
              </span>
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-auto py-4 flex flex-col gap-1"
              onClick={() => dispatch({ type: "USER_CHOSE_REJECT" })}
            >
              <span className="font-semibold">Reject claim</span>
              <span className="text-xs text-muted-foreground">
                Owner will see your reason in their portal
              </span>
            </Button>
          </div>
        )}

        {/* match-existing: candidate list */}
        {state.kind === "match-existing" && (
          <div className="space-y-3">
            {state.candidates === null && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
                <Loader2 className="h-4 w-4 animate-spin" />
                Looking for nearby bank transactions…
              </div>
            )}

            {state.candidates !== null && state.candidates.length === 0 && (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  <div>
                    No nearby bank transactions found within ±7 days at the claim&apos;s amount.
                    Switching to creating a new manual entry…
                  </div>
                </div>
              </div>
            )}

            {state.candidates !== null && state.candidates.length > 0 && (
              <>
                <div className="text-xs text-muted-foreground">
                  {state.candidates.length} nearby bank transaction
                  {state.candidates.length === 1 ? "" : "s"} found:
                </div>
                <div className="max-h-80 overflow-y-auto space-y-2 -mx-2 px-2">
                  {state.candidates.map((c) => (
                    <CandidateRow
                      key={c.id}
                      candidate={c}
                      claimAmount={payload.amount}
                      onUseThisOne={() => void performMatchExistingSubmit(c.id)}
                    />
                  ))}
                </div>
              </>
            )}

            <div className="flex items-center justify-between gap-2 pt-2 border-t border-border">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => dispatch({ type: "USER_SWITCH_TO_MATCH_NEW" })}
              >
                Or create a new manual bank tx →
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => dispatch({ type: "USER_BACK_TO_DEFAULT" })}
              >
                <ArrowLeft className="h-3.5 w-3.5 mr-1" />
                Back
              </Button>
            </div>
          </div>
        )}

        {/* match-new: form + LIKELY_DUPLICATE inline rendering */}
        {state.kind === "match-new" && (
          <Form {...matchNewForm}>
            <form
              onSubmit={matchNewForm.handleSubmit((data) =>
                performMatchNewSubmit(data as MatchNewFormOutput, false),
              )}
              className="space-y-3"
            >
              {/* LIKELY_DUPLICATE inline panel */}
              {state.likelyDuplicates !== null && state.likelyDuplicates.length > 0 && (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 space-y-2">
                  <div className="flex items-start gap-2 text-xs text-amber-900">
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                    <div>
                      <span className="font-medium">
                        One or more existing bank transactions look like this new entry.
                      </span>{" "}
                      Use one of them to avoid creating a duplicate, or proceed anyway.
                    </div>
                  </div>
                  <div className="space-y-2">
                    {state.likelyDuplicates.map((c) => (
                      <CandidateRow
                        key={c.id}
                        candidate={c}
                        claimAmount={payload.amount}
                        onUseThisOne={() => void performMatchExistingSubmit(c.id)}
                      />
                    ))}
                  </div>
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={() =>
                        void matchNewForm.handleSubmit((data) =>
                          performMatchNewSubmit(data as MatchNewFormOutput, true),
                        )()
                      }
                    >
                      Proceed anyway →
                    </Button>
                  </div>
                </div>
              )}

              {/* Form fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <FormField
                  control={matchNewForm.control}
                  name="bank_account_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Bank account</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select an account" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {bankAccounts.map((a) => (
                            <SelectItem key={a.id} value={a.id}>
                              {a.account_name} · {FUND_TYPE_LABELS[a.fund_type]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={matchNewForm.control}
                  name="transaction_date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Transaction date</FormLabel>
                      <Popover>
                        <PopoverTrigger
                          className={cn(
                            "flex h-9 w-full items-center gap-2 rounded-md border border-border bg-background px-3 text-sm cursor-pointer",
                            !field.value && "text-muted-foreground",
                          )}
                        >
                          <CalendarIcon className="h-4 w-4" />
                          {field.value ? formatDate(field.value) : "Select a date"}
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={field.value ? new Date(`${field.value}T00:00:00`) : undefined}
                            onSelect={(date) => {
                              if (date) field.onChange(format(date, "yyyy-MM-dd"));
                            }}
                          />
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={matchNewForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g. Owner Smith BPAY 12345"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Allocation row (single, per Gap U) */}
              <div className="rounded-md border border-border bg-muted/30 p-3 space-y-2">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Allocation
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Lot</Label>
                    <Input value={payload.lot_label} disabled />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Fund</Label>
                    <Input
                      value={
                        selectedFundType
                          ? FUND_TYPE_LABELS[selectedFundType]
                          : "Pick a bank account"
                      }
                      disabled
                    />
                    <p className="text-[10px] text-muted-foreground">
                      Determined by the selected bank account.
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Amount</Label>
                    <Input value={formatCurrency(payload.amount)} disabled />
                    <p className="text-[10px] text-muted-foreground">
                      Locked to claim amount.
                    </p>
                  </div>
                  <FormField
                    control={matchNewForm.control}
                    name="reference"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">Reference (optional)</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. LEV-12" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              <FormField
                control={matchNewForm.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Notes (optional, audit only)</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Anything worth recording for forensics"
                        rows={2}
                        maxLength={MAX_NOTES_LEN}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex items-center justify-between gap-2 pt-2 border-t border-border">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => dispatch({ type: "USER_BACK_TO_DEFAULT" })}
                >
                  <ArrowLeft className="h-3.5 w-3.5 mr-1" />
                  Back
                </Button>
                <Button type="submit" variant="default">
                  Create + match
                </Button>
              </div>
            </form>
          </Form>
        )}

        {/* reject: rejection_reason form */}
        {state.kind === "reject" && (
          <Form {...rejectForm}>
            <form
              onSubmit={rejectForm.handleSubmit((data) =>
                performRejectSubmit(data as RejectFormOutput),
              )}
              className="space-y-3"
            >
              <FormField
                control={rejectForm.control}
                name="rejection_reason"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Rejection reason</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Tell the owner why their claim was rejected"
                        rows={4}
                        maxLength={MAX_REJECTION_REASON_LEN}
                        {...field}
                      />
                    </FormControl>
                    <div className="flex items-center justify-between mt-1">
                      <FormMessage />
                      <span
                        className={cn(
                          "text-[10px] text-muted-foreground tabular-nums",
                          rejectionReasonLength < MIN_REJECTION_REASON_LEN && "text-destructive",
                        )}
                      >
                        {rejectionReasonLength}/{MAX_REJECTION_REASON_LEN}
                        {rejectionReasonLength < MIN_REJECTION_REASON_LEN && (
                          <span> · min {MIN_REJECTION_REASON_LEN}</span>
                        )}
                      </span>
                    </div>
                  </FormItem>
                )}
              />

              <div className="flex items-center justify-between gap-2 pt-2 border-t border-border">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => dispatch({ type: "USER_BACK_TO_DEFAULT" })}
                >
                  <ArrowLeft className="h-3.5 w-3.5 mr-1" />
                  Back
                </Button>
                <Button
                  type="submit"
                  variant="destructive"
                  disabled={rejectionReasonLength < MIN_REJECTION_REASON_LEN}
                >
                  Reject claim
                </Button>
              </div>
            </form>
          </Form>
        )}

        {/* submitting: spinner overlay */}
        {state.kind === "submitting" && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" />
            {state.action === "reject" ? "Rejecting…" : "Matching…"}
          </div>
        )}

        {/* done: success indicator (auto-closes 600ms after) */}
        {state.kind === "done" && (
          <div className="flex items-center gap-2 text-sm text-secondary py-6 justify-center">
            <Check className="h-4 w-4" />
            {state.outcome === "matched" ? "Claim matched." : "Claim rejected."}
          </div>
        )}

        {/* error: inline destructive panel */}
        {state.kind === "error" && (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive space-y-2">
            <div className="font-medium">{state.message}</div>
            {state.errorCode && (
              <div className="text-[10px] font-mono opacity-75">Error code: {state.errorCode}</div>
            )}
            <div className="flex items-center gap-2">
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
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => dispatch({ type: "USER_BACK_TO_DEFAULT" })}
              >
                Back to picker
              </Button>
            </div>
          </div>
        )}

        {/* Footer Cancel — always present except during submitting/done */}
        {state.kind !== "submitting" && state.kind !== "done" && (
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Candidate row (shared between match-existing + LIKELY_DUPLICATE list) ─

function CandidateRow({
  candidate,
  claimAmount,
  onUseThisOne,
}: {
  candidate: NearbyBankTxRow;
  claimAmount: number;
  onUseThisOne: () => void;
}) {
  const stale =
    candidate.match_status === "auto_matched" ||
    candidate.match_status === "manually_matched" ||
    candidate.match_status === "excluded";
  const dayAbs = Math.abs(candidate.day_delta_from_claim_date);
  const dayClass =
    dayAbs > 3 ? "text-amber-700" : "text-muted-foreground";
  return (
    <div
      className={cn(
        "rounded-md border border-border bg-background p-3 flex items-start justify-between gap-3",
        stale && "opacity-60",
      )}
    >
      <div className="space-y-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap text-sm">
          <span className="font-semibold tabular-nums">
            {new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(candidate.amount)}
          </span>
          {candidate.is_amount_exact_match && candidate.amount === claimAmount && (
            <Badge variant="success" className="text-[10px] gap-1">
              <Check className="h-3 w-3" />
              exact
            </Badge>
          )}
          <span className={cn("text-xs", dayClass)}>
            · {dayDeltaLabel(candidate.day_delta_from_claim_date)}
          </span>
        </div>
        <div className="text-xs text-muted-foreground">
          {new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${candidate.transaction_date}T00:00:00`))}
          {" · "}
          {candidate.bank_account_name}
          {" · "}
          {FUND_TYPE_LABELS[candidate.fund_type]}
          {" · "}
          source: {candidate.source}
        </div>
        {candidate.description && (
          <div className="text-xs text-muted-foreground italic truncate">
            {candidate.description}
          </div>
        )}
        <div className="text-[10px] text-muted-foreground">
          Status: {candidate.match_status}
          {stale && <span className="ml-1">(already allocated)</span>}
        </div>
      </div>
      <div className="shrink-0">
        <Button
          type="button"
          variant="default"
          size="sm"
          onClick={onUseThisOne}
          disabled={stale}
          className="gap-1"
        >
          Use this one
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
