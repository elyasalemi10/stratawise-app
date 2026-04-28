import { z } from "zod";
import { FUND_TYPES, type FundType } from "./ledger";

// ─── Shared constants ──────────────────────────────────────────

export const RECONCILIATION_MATCH_METHODS = [
  "manual",
  "auto_reference",
  "auto_bpay_crn",
  "auto_sender",
  "auto_amount",
  "system",
] as const;
export type ReconciliationMatchMethod =
  (typeof RECONCILIATION_MATCH_METHODS)[number];

export const MATCH_CONFIDENCES = [
  "exact_reference",
  "amount_match",
  "name_match",
  "manual",
  "auto_portal",
  "basiq_auto",
  "system_created",
] as const;
export type MatchConfidence = (typeof MATCH_CONFIDENCES)[number];

export const MATCH_STATUSES = [
  "unmatched",
  "auto_matched",
  "manually_matched",
  "excluded",
] as const;
export type MatchStatus = (typeof MATCH_STATUSES)[number];

export const TRANSACTION_SOURCES = ["manual", "csv", "basiq"] as const;
export type TransactionSource = (typeof TRANSACTION_SOURCES)[number];

export const RECEIPT_PAYMENT_METHODS = ["cash", "cheque"] as const;
export type ReceiptPaymentMethod = (typeof RECEIPT_PAYMENT_METHODS)[number];

export const UNDEPOSITED_STATUSES = [
  "pending_deposit",
  "deposited",
  "voided",
] as const;
export type UndepositedStatus = (typeof UNDEPOSITED_STATUSES)[number];

export const TRANSACTION_DIRECTIONS = ["credit", "debit"] as const;
export type TransactionDirection = (typeof TRANSACTION_DIRECTIONS)[number];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
// Strict per-OC reference format: "LEV-{n}" / "RCP-{n}" (PP4-0 refactor).
// Free-text parsing in auto-match uses a flexible variant; form input is
// still exact-form.
const LEVY_REFERENCE_REGEX = /^LEV-\d+$/i;
const RECEIPT_REFERENCE_REGEX = /^RCP-\d+$/i;

// Min reason length for exclude/void/unmatch — CLAUDE.md-adjacent rule from Prompt 2 spec.
const MIN_REASON_LEN = 10;
const MAX_REASON_LEN = 1000;

// ─── Manual bank transaction add ───────────────────────────────

export const addManualBankTransactionSchema = z.object({
  subdivision_id: z.string().uuid(),
  bank_account_id: z.string().uuid(),
  transaction_date: z.string().regex(ISO_DATE, "Date must be YYYY-MM-DD"),
  amount: z
    .number()
    .finite()
    .refine((n) => n !== 0, "Amount cannot be zero"),
  direction: z.enum(TRANSACTION_DIRECTIONS),
  description: z.string().trim().max(256, "Description too long").default(""),
  reference: z
    .string()
    .trim()
    .regex(LEVY_REFERENCE_REGEX, "Reference must be LEV-{n} (e.g. LEV-42)")
    .optional()
    .or(z.literal("")),
});
export type AddManualBankTransactionInput = z.infer<
  typeof addManualBankTransactionSchema
>;

// ─── Reconcile / match ─────────────────────────────────────────

export const reconcileAllocationSchema = z.object({
  lot_id: z.string().uuid(),
  fund_type: z.enum(FUND_TYPES),
  amount: z.number().positive("Allocation amount must be positive").finite(),
  levy_notice_id: z.string().uuid().nullable().optional(),
  reference: z.string().trim().max(100).nullable().optional(),
});
export type ReconcileAllocationInput = z.infer<typeof reconcileAllocationSchema>;

// Three-way collision-resolution options for the manual-match
// "remember this payer" flow. Set in the second call when the manager
// chooses how to resolve a collision detected on the first call.
const MAPPING_RESOLUTIONS = ["update", "keep_existing", "remove"] as const;
export type MappingResolution = (typeof MAPPING_RESOLUTIONS)[number];

const collidingMappingSnapshotSchema = z.object({
  id: z.string().uuid(),
  lot_id: z.string().uuid(),
  previous_status: z.enum(["active", "ambiguous", "disabled"]),
  current_status: z.enum(["active", "ambiguous", "disabled"]),
});

export const reconcileTransactionSchema = z.object({
  subdivision_id: z.string().uuid(),
  bank_transaction_id: z.string().uuid(),
  allocations: z
    .array(reconcileAllocationSchema)
    .min(1, "At least one allocation required")
    .max(50, "Too many allocations in one match"),
  match_method: z.enum(RECONCILIATION_MATCH_METHODS),
  match_confidence: z.enum(MATCH_CONFIDENCES),
  notes: z.string().trim().max(500).nullable().optional(),
  // PP4-B: "Remember this payer for future transactions" checkbox.
  // Default false at the schema level so existing tests / non-UI callers
  // don't accidentally create mappings. The UI form sends true explicitly
  // (matching the spec's default-checked checkbox).
  remember_payer: z.boolean().default(false),
});

// PP4-C: collision-resolution moved to its own server action. PP4-B's
// reconcileTransaction tried to bundle resolution into the same call,
// but the second call would re-invoke rpc_reconcile_bank_transaction on
// an already-matched bank_transaction → over-allocation error. Splitting
// resolution into resolvePayerMappingCollision keeps reconcileTransaction
// idempotent for its narrow concern (one match, one DB write) and gives
// the dialog round-trip a clean dedicated endpoint.
export const resolvePayerMappingCollisionSchema = z.object({
  subdivision_id: z.string().uuid(),
  bank_transaction_id: z.string().uuid(), // for canonical-name lookup
  proposed_lot_id: z.string().uuid(),
  resolution: z.enum(MAPPING_RESOLUTIONS),
  expected_collisions: z
    .array(collidingMappingSnapshotSchema)
    .min(1, "expected_collisions snapshot must come from the first-call collision payload"),
});
export type ResolvePayerMappingCollisionInput = z.infer<
  typeof resolvePayerMappingCollisionSchema
>;

// PP4-D: mapping management actions (mappings page row-actions).
export const mappingActionSchema = z.object({
  mapping_id: z.string().uuid(),
  subdivision_id: z.string().uuid(),
});
export type MappingActionInput = z.infer<typeof mappingActionSchema>;

export const disableMappingSchema = mappingActionSchema.extend({
  reason: z.string().max(200, "Reason too long").optional(),
});
export type DisableMappingActionInput = z.infer<typeof disableMappingSchema>;

// PP4-D: collision resolution from the mappings page (re-activate flow).
// Different concern from `resolvePayerMappingCollisionSchema` (reconcile
// flow): no bank_transaction_id, no canonical-name lookup — the UI passes
// canonical_sender_name + proposed_lot_id directly.
export const resolveMappingCollisionSchema = z.object({
  subdivision_id: z.string().uuid(),
  canonical_sender_name: z.string().min(1),
  proposed_lot_id: z.string().uuid(),
  resolution: z.enum(MAPPING_RESOLUTIONS),
  expected_collisions: z
    .array(collidingMappingSnapshotSchema)
    .min(1, "expected_collisions snapshot must come from the first-call collision payload"),
});
export type ResolveMappingCollisionInput = z.infer<
  typeof resolveMappingCollisionSchema
>;
// Use z.input rather than z.infer so callers may omit `.default()` fields
// (remember_payer in particular). The schema applies the default during
// safeParse; consumers inside the action read parsed.data which has the
// output type with defaults filled in.
export type ReconcileTransactionInput = z.input<
  typeof reconcileTransactionSchema
>;

// ─── Unmatch ───────────────────────────────────────────────────

export const unmatchTransactionSchema = z.object({
  subdivision_id: z.string().uuid(),
  bank_transaction_id: z.string().uuid(),
  match_ids: z.array(z.string().uuid()).nullable().optional(),
  reason: z.string().trim().min(MIN_REASON_LEN, `Reason must be at least ${MIN_REASON_LEN} characters`).max(MAX_REASON_LEN),
});
export type UnmatchTransactionInput = z.infer<typeof unmatchTransactionSchema>;

// ─── Cash / cheque receipt ─────────────────────────────────────

export const recordCashReceiptSchema = z
  .object({
    subdivision_id: z.string().uuid(),
    lot_id: z.string().uuid(),
    bank_account_id: z.string().uuid(),
    fund_type: z.enum(FUND_TYPES),
    amount: z.number().positive("Amount must be positive").finite(),
    received_date: z.string().regex(ISO_DATE, "Date must be YYYY-MM-DD"),
    payment_method: z.enum(RECEIPT_PAYMENT_METHODS),
    cheque_number: z.string().trim().max(50).nullable().optional(),
    description: z.string().trim().max(500).nullable().optional(),
  })
  .refine(
    (v) =>
      v.payment_method === "cheque"
        ? !!v.cheque_number && v.cheque_number.length > 0
        : !v.cheque_number,
    {
      message: "Cheque number is required for cheques and must be empty for cash",
      path: ["cheque_number"],
    },
  );
export type RecordCashReceiptInput = z.infer<typeof recordCashReceiptSchema>;

// ─── Deposit undeposited funds ─────────────────────────────────

export const depositUndepositedFundsSchema = z.object({
  subdivision_id: z.string().uuid(),
  bank_transaction_id: z.string().uuid(),
  undeposited_entry_ids: z
    .array(z.string().uuid())
    .min(1, "Select at least one undeposited receipt"),
});
export type DepositUndepositedFundsInput = z.infer<
  typeof depositUndepositedFundsSchema
>;

// ─── Exclude / unexclude / void ───────────────────────────────

export const excludeTransactionSchema = z.object({
  subdivision_id: z.string().uuid(),
  bank_transaction_id: z.string().uuid(),
  reason: z.string().trim().min(MIN_REASON_LEN).max(MAX_REASON_LEN),
});
export type ExcludeTransactionInput = z.infer<typeof excludeTransactionSchema>;

export const unexcludeTransactionSchema = z.object({
  subdivision_id: z.string().uuid(),
  bank_transaction_id: z.string().uuid(),
});
export type UnexcludeTransactionInput = z.infer<
  typeof unexcludeTransactionSchema
>;

export const voidBankTransactionSchema = z.object({
  subdivision_id: z.string().uuid(),
  bank_transaction_id: z.string().uuid(),
  reason: z.string().trim().min(MIN_REASON_LEN).max(MAX_REASON_LEN),
});
export type VoidBankTransactionInput = z.infer<typeof voidBankTransactionSchema>;

export const voidUndepositedReceiptSchema = z.object({
  subdivision_id: z.string().uuid(),
  receipt_id: z.string().uuid(),
  reason: z.string().trim().min(MIN_REASON_LEN).max(MAX_REASON_LEN),
});
export type VoidUndepositedReceiptInput = z.infer<
  typeof voidUndepositedReceiptSchema
>;

// ─── Read-shape types (UI-facing) ──────────────────────────────

/** Inline fuzzy-hint payload as joined into the queue row. The lot label is
 *  resolved server-side (single round-trip) so the queue UI can render
 *  "Possibly: NAME (Lot N)" without per-row fetches. */
export interface QueueFuzzyHint {
  canonical_name: string;
  similarity: number;
  lot_id: string;
  lot_label: string;
}

/** Per-row aggregate match metadata for matched transactions. */
export interface QueueMatchSummary {
  match_method: ReconciliationMatchMethod;
  match_confidence: MatchConfidence;
  review_required: boolean;
}

export interface ReconciliationQueueRow {
  id: string;
  bank_account_id: string;
  bank_account_name: string;
  bank_account_fund_type: FundType;
  source: TransactionSource;
  transaction_date: string;
  amount: number;
  description: string | null;
  matched_total: number;
  remaining: number;
  match_status: MatchStatus;
  is_voided: boolean;
  excluded_reason: string | null;
  detected_reference: string | null;
  imported_at: string;
  /** Populated for matched rows. Reflects the FIRST allocation's metadata
   *  (in practice all share method + confidence + review_required). Null on
   *  unmatched rows. */
  match_summary: QueueMatchSummary | null;
  /** Populated when bank_transactions.fuzzy_hint_metadata is non-null AND
   *  the match_status is unmatched. */
  fuzzy_hint: QueueFuzzyHint | null;
}

export interface BankAccountOption {
  id: string;
  name: string;
  fund_type: FundType;
}

export interface ReconciliationQueueResult {
  rows: ReconciliationQueueRow[];
  total: number;
  page: number;
  pageSize: number;
  unmatchedCount: number;
  unmatchedValue: number;
  oldestUnmatchedDays: number | null;
  matchedThisMonthValue: number;
  /**
   * Distinct transaction_source values present in this subdivision's data.
   * Drives the dynamic source-filter dropdown — the UI prepends "All" to
   * this list. Filter-agnostic: doesn't depend on the currently-applied
   * status/source/bank filters. New sources (basiq, future integrations)
   * appear automatically once a transaction of that source is recorded.
   */
  availableSources: TransactionSource[];
  /** Bank accounts for this subdivision, for the account-picker filter. */
  bankAccounts: BankAccountOption[];
}

export interface BankTransactionDetail {
  id: string;
  bank_account_id: string;
  bank_account_name: string;
  bank_account_fund_type: FundType;
  subdivision_id: string;
  source: TransactionSource;
  transaction_date: string;
  amount: number;
  description: string | null;
  balance: number | null;
  match_status: MatchStatus;
  matched_total: number;
  remaining: number;
  is_voided: boolean;
  voided_at: string | null;
  voided_by: string | null;
  void_reason: string | null;
  excluded_reason: string | null;
  detected_reference: string | null;
  imported_at: string;
  matches: Array<{
    id: string;
    ledger_entry_id: string;
    lot_id: string;
    lot_number: string;
    unit_number: string | null;
    fund_type: FundType;
    amount_matched: number;
    match_method: ReconciliationMatchMethod;
    match_confidence: MatchConfidence;
    matched_at: string;
    matched_by: string | null;
    notes: string | null;
    levy_notice_id: string | null;
    levy_reference: string | null;
  }>;
  undeposited_candidates: Array<{
    id: string;
    receipt_number: string;
    lot_id: string;
    lot_number: string;
    amount: number;
    received_date: string;
    payment_method: ReceiptPaymentMethod;
    cheque_number: string | null;
  }>;
}

export interface UndepositedFundsEntry {
  id: string;
  subdivision_id: string;
  lot_id: string;
  lot_number: string;
  unit_number: string | null;
  bank_account_id: string;
  fund_type: FundType;
  amount: number;
  received_date: string;
  payment_method: ReceiptPaymentMethod;
  cheque_number: string | null;
  receipt_number: string;
  description: string | null;
  status: UndepositedStatus;
  deposited_at: string | null;
  deposited_by_bank_transaction_id: string | null;
  linked_ledger_credit_id: string;
  created_at: string;
}

// Preview shapes — returned by previewVoid* actions, consumed by the
// destructive-confirm dialog.
export interface VoidCascadePreview {
  kind: "bank_transaction" | "ledger_entry" | "undeposited_receipt";
  target_summary: string;
  matches_to_unlink: Array<{
    match_id: string;
    lot_number: string;
    amount: number;
    levy_reference: string | null;
  }>;
  credits_to_void: Array<{
    ledger_entry_id: string;
    lot_number: string;
    amount: number;
    category: string;
  }>;
  undeposited_receipts_to_reopen: Array<{
    receipt_id: string;
    receipt_number: string;
    lot_number: string;
    amount: number;
  }>;
  distinct_lot_count: number;
  cascade_amount_total: number;
  blocker: string | null;
}

// Helpers
export { LEVY_REFERENCE_REGEX, RECEIPT_REFERENCE_REGEX, ISO_DATE };
