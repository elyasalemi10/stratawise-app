import { z } from "zod";

export const MAX_CSV_SIZE = 5 * 1024 * 1024; // 5MB
export const MAX_CSV_ROWS = 5000;

export const bankTransactionRowSchema = z.object({
  transaction_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
  amount: z.number().refine((n) => n !== 0, "Amount cannot be zero"),
  description: z.string().max(500, "Description too long").default(""),
  balance: z.number().nullable().optional(),
});

export type BankTransactionRow = z.infer<typeof bankTransactionRowSchema>;

export const importTransactionsSchema = z.object({
  bank_account_id: z.string().uuid(),
  rows: z.array(bankTransactionRowSchema).min(1, "At least one row required").max(MAX_CSV_ROWS, `Maximum ${MAX_CSV_ROWS} rows per import`),
});

export type ImportTransactionsInput = z.infer<typeof importTransactionsSchema>;

// ─── Bank account update ─────────────────────────────────────
//
// Generic mutable-fields schema. All fields are optional; the action only
// touches keys that are present (`!== undefined`). New mutable fields extend
// this schema, NOT the action signature.
//
// Future fields might include: account_name, bsb, account_number,
// statement_import_email, default_match_keywords, etc. Anything that should
// be a manager-editable setting on a bank account belongs here.
export const bankAccountUpdateSchema = z
  .object({
    id: z.string().uuid(),
    bpay_biller_code: z
      .string()
      .regex(/^\d{1,7}$/, "BPAY biller code must be 1-7 digits")
      .nullable()
      .optional(),
    bpay_crn_prefix: z
      .string()
      .max(15, "CRN prefix max 15 characters")
      .nullable()
      .optional(),
  })
  .refine(
    (v) =>
      v.bpay_biller_code !== undefined ||
      v.bpay_crn_prefix !== undefined,
    { message: "No fields to update" },
  );

export type BankAccountUpdateInput = z.input<typeof bankAccountUpdateSchema>;

export interface BankAccountSummary {
  id: string;
  oc_id: string;
  fund_type: "operating" | "maintenance_plan";
  account_name: string;
  bsb: string;
  account_number: string;
  bank_name: string | null;
  opening_balance: number;
  opening_balance_date: string | null;
  current_balance: number;
  last_transaction_date: string | null;
  transaction_count: number;
  bpay_biller_code: string | null;
  bpay_crn_prefix: string | null;
}

export interface BankTransactionRecord {
  id: string;
  bank_account_id: string;
  source: "manual" | "csv_import" | "macquarie_txn" | "macquarie_pay";
  transaction_date: string;
  amount: number;
  description: string | null;
  balance: number | null;
  match_status: "unmatched" | "auto_matched" | "manually_matched" | "excluded";
  matched_payment_id: string | null;
  matched_levy_id: string | null;
  matched_reference: string | null;
  imported_at: string;
}

export interface ImportSummary {
  imported: number;
  /** PP5-A renamed from `duplicates`. Catches both intra-batch duplicates
   *  (same CSV uploads the same row twice) AND prior-import duplicates
   *  (the row was already in the DB from an earlier import). Detection key
   *  is exact `(transaction_date|amount|description-trimmed)`; matching rows
   *  are silently dropped before insert. Distinct from the cross-source
   *  flow below , see CONTEXT.md PP5 §Duplicates. */
  exact_duplicates_dropped: number;
  /** PP5-A new field. Set when a row was successfully inserted but the
   *  bank-side detector subsequently flagged it as a suspected cross-source
   *  duplicate of an existing row (different source, +/-2-day window,
   *  hash-equal description). The row is persisted with
   *  duplicate_status='suspected' for manager review; the orchestrator was
   *  skipped for this row. */
  cross_source_duplicates_flagged: number;
  matched: number;
  errors: string[];
}
