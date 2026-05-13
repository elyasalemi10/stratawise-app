import { z } from "zod";

export const FUND_TYPES = ["administrative", "capital_works", "maintenance_plan"] as const;
export type FundType = (typeof FUND_TYPES)[number];

export const LEDGER_ENTRY_TYPES = ["debit", "credit"] as const;
export type LedgerEntryType = (typeof LEDGER_ENTRY_TYPES)[number];

export const LEDGER_ENTRY_CATEGORIES = [
  "levy",
  "special_levy",
  "interest",
  "payment",
  "writeoff",
  "adjustment_debit",
  "adjustment_credit",
  "refund",
  "void_offset",
] as const;
export type LedgerEntryCategory = (typeof LEDGER_ENTRY_CATEGORIES)[number];

export const LEDGER_ENTRY_STATUSES = ["active", "voided"] as const;
export type LedgerEntryStatus = (typeof LEDGER_ENTRY_STATUSES)[number];

export const ADJUSTMENT_CATEGORIES = [
  "adjustment_debit",
  "writeoff",
  "adjustment_credit",
  "refund",
] as const;
export type AdjustmentCategory = (typeof ADJUSTMENT_CATEGORIES)[number];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const ledgerAdjustmentSchema = z
  .object({
    oc_id: z.string().uuid(),
    lot_id: z.string().uuid(),
    fund_type: z.enum(FUND_TYPES),
    entry_type: z.enum(LEDGER_ENTRY_TYPES),
    category: z.enum(ADJUSTMENT_CATEGORIES),
    amount: z.number().positive("Amount must be positive").finite(),
    entry_date: z.string().regex(ISO_DATE, "Date must be YYYY-MM-DD"),
    description: z.string().trim().min(1, "Description is required").max(500),
  })
  .refine(
    (v) =>
      (v.entry_type === "debit" && (v.category === "adjustment_debit" || v.category === "refund")) ||
      (v.entry_type === "credit" && (v.category === "adjustment_credit" || v.category === "writeoff")),
    { message: "Category is not compatible with entry_type", path: ["category"] },
  );

export type LedgerAdjustmentInput = z.infer<typeof ledgerAdjustmentSchema>;

export const ledgerVoidSchema = z.object({
  entry_id: z.string().uuid(),
  reason: z.string().trim().min(1, "Reason is required").max(1000),
});

export type LedgerVoidInput = z.infer<typeof ledgerVoidSchema>;

export const ledgerEntriesQuerySchema = z.object({
  lot_id: z.string().uuid(),
  limit: z.number().int().min(1).max(500).default(50),
  before: z.string().regex(ISO_DATE).nullable().optional(),
  status: z.enum(LEDGER_ENTRY_STATUSES).nullable().optional(),
  category: z.enum(LEDGER_ENTRY_CATEGORIES).nullable().optional(),
});

export type LedgerEntriesQuery = z.infer<typeof ledgerEntriesQuerySchema>;

export const lotStatementQuerySchema = z
  .object({
    lot_id: z.string().uuid(),
    fromDate: z.string().regex(ISO_DATE),
    toDate: z.string().regex(ISO_DATE),
  })
  .refine((v) => v.fromDate <= v.toDate, {
    message: "fromDate must be on or before toDate",
    path: ["fromDate"],
  });

export type LotStatementQuery = z.infer<typeof lotStatementQuerySchema>;

export interface LotLedgerState {
  lot_id: string;
  oc_id: string;
  admin_balance: number;
  capital_balance: number;
  total_balance: number;
  oldest_unpaid_date_admin: string | null;
  oldest_unpaid_date_capital: string | null;
  last_entry_at: string | null;
  updated_at: string;
}

export interface LotLedgerEntry {
  id: string;
  oc_id: string;
  lot_id: string;
  fund_type: FundType;
  entry_type: LedgerEntryType;
  category: LedgerEntryCategory;
  amount: number;
  entry_date: string;
  description: string | null;
  reference: string | null;
  levy_notice_id: string | null;
  status: LedgerEntryStatus;
  voided_at: string | null;
  voided_by: string | null;
  void_reason: string | null;
  voided_by_entry_id: string | null;
  voids_entry_id: string | null;
  created_at: string;
  created_by: string;
  /** PP5-D-B: ledger-side duplicate review state. NULL = no flag.
   *  'suspected' = badge surfaced; click → LedgerDuplicateReviewDialog.
   *  'rejected' = manager said keep-as-overpayment; entry stays active.
   *  'confirmed' = manager voided as duplicate; entry's status='voided'.
   *  Type imported from validations/reconciliation.ts (PP5-A enum). */
  duplicate_of: string | null;
  duplicate_status: "suspected" | "confirmed" | "rejected" | null;
  /** PP5-B detection metadata (older entry id, lot/notice, amount,
   *  day_delta, category pair). Stored as JSONB; loosely-typed here
   *  to avoid a circular import from validations/reconciliation.ts.
   *  UI consumers cast to LedgerDuplicateMetadata at use site. */
  duplicate_metadata: Record<string, unknown> | null;
  /** PP5-D-B parent-status pre-fetch (per planning Gap I). When this row
   *  has duplicate_of set, this is the parent entry's `status` —
   *  surfaces as a "voided parent" warning banner in the review dialog
   *  (parent already voided post-detection, per PP5-B planning rat. (d)). */
  parent_status: LedgerEntryStatus | null;
}

export interface OCArrearsSummary {
  oc_id: string;
  lots_in_arrears: number;
  lots_total: number;
  total_arrears_admin: number;
  total_arrears_capital: number;
  total_arrears: number;
  oldest_unpaid_date: string | null;
}

export interface LotStatement {
  lot_id: string;
  oc_id: string;
  fromDate: string;
  toDate: string;
  opening_balance_admin: number;
  opening_balance_capital: number;
  opening_balance_total: number;
  entries: LotLedgerEntry[];
  closing_balance_admin: number;
  closing_balance_capital: number;
  closing_balance_total: number;
}

export interface LedgerSourceLink {
  bankTxnId?: string;
  receiptId?: string;
  receiptNumber?: string;
  bankAccountId?: string;
  levyBatchId?: string;
  levyReference?: string;
}

export interface LedgerAuditEntry {
  id: string;
  action: string;
  profile_id: string;
  performed_by_name: string | null;
  before_state: Record<string, unknown> | null;
  after_state: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface LedgerEntryDetail {
  entry: LotLedgerEntry;
  auditTrail: LedgerAuditEntry[];
  sourceLink: LedgerSourceLink;
  relatedEntry: LotLedgerEntry | null;
}
