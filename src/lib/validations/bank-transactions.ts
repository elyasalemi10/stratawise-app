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

export interface BankAccountSummary {
  id: string;
  subdivision_id: string;
  fund_type: "administrative" | "capital_works";
  account_name: string;
  bsb: string;
  account_number: string;
  bank_name: string | null;
  opening_balance: number;
  opening_balance_date: string | null;
  current_balance: number;
  last_transaction_date: string | null;
  transaction_count: number;
}

export interface BankTransactionRecord {
  id: string;
  bank_account_id: string;
  source: "manual" | "csv" | "basiq";
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
  duplicates: number;
  matched: number;
  errors: string[];
}
