// ============================================================================
// Owner self-report payment claim — Zod schemas + types (PP5-C)
// ----------------------------------------------------------------------------
// Owner-facing flow: an owner submits a claim ("I paid $X on date D for
// lot L via method M with reference R"). Manager reviews and either
// confirms+matches (linking the claim to a bank tx + ledger credit) or
// rejects (with reason).
//
// payment_method reuses the existing pg enum (CONTEXT.md PP5 §4.10);
// UI labels are mapped at render time:
//   eft         -> "Bank transfer"
//   bpay        -> "BPAY"
//   stripe_card -> "Card"
//   cash        -> "Cash"
//   cheque      -> "Cheque"
//   other       -> "Other"
// direct_debit is intentionally hidden in owner UI (manager-controlled).
// ============================================================================

import { z } from "zod";

// Subset of payment_method the owner UI exposes. direct_debit is
// excluded — owners don't self-report direct-debit transactions
// (manager-controlled). The DB enum still includes direct_debit; the
// claim row just won't carry that value via owner submissions.
export const OWNER_CLAIM_PAYMENT_METHODS = [
  "eft",
  "bpay",
  "stripe_card",
  "cash",
  "cheque",
  "other",
] as const;
export type OwnerClaimPaymentMethod = (typeof OWNER_CLAIM_PAYMENT_METHODS)[number];

// UI label map (used by owner submission form + list rendering + manager
// queue rendering). Source of truth lives here so server-side audit log
// and client-side display agree.
export const OWNER_CLAIM_PAYMENT_METHOD_LABELS: Record<OwnerClaimPaymentMethod, string> = {
  eft: "Bank transfer",
  bpay: "BPAY",
  stripe_card: "Card",
  cash: "Cash",
  cheque: "Cheque",
  other: "Other",
};

export const CLAIM_STATUSES = ["pending", "matched", "rejected"] as const;
export type ClaimStatus = (typeof CLAIM_STATUSES)[number];

// ─── Validation constants ─────────────────────────────────────────────────

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MIN_REJECTION_REASON_LEN = 10;
const MAX_REJECTION_REASON_LEN = 1000;
const MAX_NOTES_LEN = 500;
const MAX_REFERENCE_LEN = 100;

// ─── Owner-side: submitOwnerPaymentClaim ──────────────────────────────────

export const submitOwnerPaymentClaimSchema = z.object({
  subdivision_id: z.string().uuid(),
  lot_id: z.string().uuid(),
  amount: z.number().positive("Amount must be positive").finite(),
  claim_date: z.string().regex(ISO_DATE, "Date must be YYYY-MM-DD"),
  payment_method: z.enum(OWNER_CLAIM_PAYMENT_METHODS),
  reference: z.string().trim().max(MAX_REFERENCE_LEN).nullable().optional(),
  notes: z.string().trim().max(MAX_NOTES_LEN).nullable().optional(),
});
export type SubmitOwnerPaymentClaimInput = z.infer<typeof submitOwnerPaymentClaimSchema>;

// ─── Manager-side: confirmAndMatchClaimViaExistingBankTx ──────────────────
// Path (iii) primary: link the claim to an already-existing bank tx and
// allocate the credit via rpc_reconcile_bank_transaction (PP4 manual-match
// path). PP5-B ledger detector runs as part of the reconcile step.

const reconcileAllocationShape = z.object({
  lot_id: z.string().uuid(),
  fund_type: z.enum(["administrative", "capital_works"]),
  amount: z.number().positive().finite(),
  levy_notice_id: z.string().uuid().nullable().optional(),
  reference: z.string().trim().max(100).nullable().optional(),
});

export const confirmAndMatchClaimViaExistingBankTxSchema = z.object({
  claim_id: z.string().uuid(),
  bank_transaction_id: z.string().uuid(),
  allocations: z
    .array(reconcileAllocationShape)
    .min(1, "At least one allocation required")
    .max(50, "Too many allocations in one match"),
  notes: z.string().trim().max(MAX_NOTES_LEN).nullable().optional(),
});
export type ConfirmAndMatchClaimViaExistingBankTxInput = z.infer<
  typeof confirmAndMatchClaimViaExistingBankTxSchema
>;

// ─── Manager-side: confirmAndMatchClaimViaNewBankTx ───────────────────────
// Path (ii) fallback: create a new manual bank tx for the claim, then
// match it. PP5-A bank-side detector runs at insert; PP5-B ledger detector
// at reconcile. LIKELY_DUPLICATE pre-check runs BEFORE the manual insert
// (same bank_account, +/-2 days from claim_date, same amount). Override
// flag bypasses the pre-check at the manager's explicit request.

export const confirmAndMatchClaimViaNewBankTxSchema = z.object({
  claim_id: z.string().uuid(),
  bank_account_id: z.string().uuid(),
  transaction_date: z.string().regex(ISO_DATE, "Date must be YYYY-MM-DD"),
  description: z.string().trim().max(256, "Description too long").default(""),
  // amount is taken from the claim (not the input) — manager confirms the
  // claim's stated amount rather than re-typing it. fund_type is inferred
  // from the bank account.
  allocations: z
    .array(reconcileAllocationShape)
    .min(1, "At least one allocation required")
    .max(50, "Too many allocations in one match"),
  override_likely_duplicate: z.boolean().default(false),
  notes: z.string().trim().max(MAX_NOTES_LEN).nullable().optional(),
});
export type ConfirmAndMatchClaimViaNewBankTxInput = z.input<
  typeof confirmAndMatchClaimViaNewBankTxSchema
>;

// ─── Manager-side: rejectPaymentClaim ─────────────────────────────────────

export const rejectPaymentClaimSchema = z.object({
  claim_id: z.string().uuid(),
  rejection_reason: z
    .string()
    .trim()
    .min(MIN_REJECTION_REASON_LEN, `Rejection reason must be at least ${MIN_REJECTION_REASON_LEN} characters`)
    .max(MAX_REJECTION_REASON_LEN),
});
export type RejectPaymentClaimInput = z.infer<typeof rejectPaymentClaimSchema>;

// ─── Structured error code union ──────────────────────────────────────────
//
// Used by all four review/state-change actions for UI dispatch. The
// associated `error` field is a human-readable message; UIs branch on
// `errorCode`.
export type OwnerPaymentClaimErrorCode =
  /** Claim id doesn't exist. */
  | "NOT_FOUND"
  /** Claim exists but the caller (owner or manager) doesn't have access. */
  | "FORBIDDEN"
  /** Claim is no longer 'pending' — already matched or rejected. Idempotency guard. */
  | "NOT_PENDING"
  /** Submission references a lot the owner doesn't own (no active subdivision_members row). */
  | "LOT_OWNERSHIP_INVALID"
  /** Path-(ii) confirm sees one or more existing bank txs that look like the new
   *  manual one (same account, +/-2 days, same amount). UI should let the manager
   *  switch to path (iii) or pass override_likely_duplicate=true. */
  | "LIKELY_DUPLICATE";

// ─── Read-shape types ─────────────────────────────────────────────────────

/** Owner-facing list row. Only the owner's own claims, all statuses. */
export interface MyPaymentClaimRow {
  id: string;
  subdivision_id: string;
  lot_id: string;
  lot_label: string; // resolved server-side ("Lot 7" or "Lot 7 (Unit 12)")
  amount: number;
  claim_date: string;
  payment_method: OwnerClaimPaymentMethod;
  reference: string | null;
  notes: string | null;
  claim_status: ClaimStatus;
  rejection_reason: string | null;
  bank_transaction_id: string | null;
  ledger_entry_id: string | null;
  reviewed_at: string | null;
  created_at: string;
}

/** Manager queue row. Pending claims for a subdivision. Includes the
 *  submitting owner's name + lot label for at-a-glance scanning. */
export interface ManagerClaimQueueRow {
  id: string;
  subdivision_id: string;
  lot_id: string;
  lot_label: string;
  owner_display_name: string; // first_name last_name OR email fallback
  amount: number;
  claim_date: string;
  payment_method: OwnerClaimPaymentMethod;
  reference: string | null;
  notes: string | null;
  claim_status: ClaimStatus;
  created_at: string;
}
