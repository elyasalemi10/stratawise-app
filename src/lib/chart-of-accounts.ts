// Pure helpers + types for the firm chart of accounts.
// Lives outside the "use server" file because client components import the
// labels + the range-mismatch helper. Next forbids non-async exports from
// server-action modules.

export type CoaAccountType = "asset" | "liability" | "equity" | "income" | "expense";

export type CoaGstTreatment =
  | "gst_on_income"
  | "gst_on_expenses"
  | "gst_free"
  | "bas_excluded";

export interface CoaAccount {
  id: string;
  code: string;
  name: string;
  account_type: CoaAccountType;
  gst_treatment: CoaGstTreatment;
  /** Non-null when the row is a built-in account the app references by name
   *  (trust bank, admin levy income, GST collected, etc.). Seed-only signal,
   *  not a protection signal , see is_fundamental for that. */
  system_role: string | null;
  is_system: boolean;
  /** True only for the small set of accounts the platform code path truly
   *  requires by role (trust bank, levy debtors, GST in/out, fund balances,
   *  levy income lines). Locked from rename + deactivate. Everything else,
   *  including most seeded defaults, can be freely edited. */
  is_fundamental: boolean;
  archived_at: string | null;
}

export const ACCOUNT_TYPE_LABEL: Record<CoaAccountType, string> = {
  asset: "Asset",
  liability: "Liability",
  equity: "Equity",
  income: "Income",
  expense: "Expense",
};

export const GST_TREATMENT_LABEL: Record<CoaGstTreatment, string> = {
  gst_on_income: "GST on income",
  gst_on_expenses: "GST on expenses",
  gst_free: "GST-free",
  bas_excluded: "BAS excluded",
};

export const ACCOUNT_TYPE_OPTIONS: { value: CoaAccountType; label: string }[] = [
  { value: "asset", label: ACCOUNT_TYPE_LABEL.asset },
  { value: "liability", label: ACCOUNT_TYPE_LABEL.liability },
  { value: "equity", label: ACCOUNT_TYPE_LABEL.equity },
  { value: "income", label: ACCOUNT_TYPE_LABEL.income },
  { value: "expense", label: ACCOUNT_TYPE_LABEL.expense },
];

export const GST_TREATMENT_OPTIONS: { value: CoaGstTreatment; label: string }[] = [
  { value: "gst_on_income", label: GST_TREATMENT_LABEL.gst_on_income },
  { value: "gst_on_expenses", label: GST_TREATMENT_LABEL.gst_on_expenses },
  { value: "gst_free", label: GST_TREATMENT_LABEL.gst_free },
  { value: "bas_excluded", label: GST_TREATMENT_LABEL.bas_excluded },
];

// Maps the leading digit of a code to its conventional account type so we can
// flag (not block) when a manager picks a type that doesn't match the range.
const CODE_RANGE_TO_TYPE: Record<string, CoaAccountType> = {
  "1": "asset",
  "2": "liability",
  "3": "equity",
  "4": "income",
  "5": "expense",
  "6": "expense",
};

export function expectedTypeForCode(code: string): CoaAccountType | null {
  if (!/^[0-9]{4}$/.test(code)) return null;
  return CODE_RANGE_TO_TYPE[code[0]] ?? null;
}

const RANGE_LABELS: Record<CoaAccountType, string> = {
  asset: "1000s",
  liability: "2000s",
  equity: "3000s",
  income: "4000s",
  expense: "5000s/6000s",
};

/** Inline warning copy when type + code sit in different bands. */
export function mismatchMessage(type: CoaAccountType, code: string): string | null {
  const expected = expectedTypeForCode(code);
  if (!expected || expected === type) return null;
  return `${ACCOUNT_TYPE_LABEL[type]} accounts usually sit in the ${RANGE_LABELS[type]} – using ${code} may put it in the wrong section of your reports.`;
}

/** True when the account is locked by the app (rename/deactivate blocked). */
export function isProtectedSystemAccount(a: { is_fundamental: boolean }): boolean {
  return a.is_fundamental;
}
