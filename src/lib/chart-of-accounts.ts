// Pure helpers + types for the firm chart of accounts.
// Lives outside the "use server" file because client components import the
// labels + the range-mismatch helper — Next forbids non-async exports from
// server-action modules.

export type CoaAccountType = "asset" | "liability" | "equity" | "income" | "expense";

export interface CoaAccount {
  id: string;
  code: string;
  name: string;
  account_type: CoaAccountType;
  is_system: boolean;
  archived_at: string | null;
}

export const ACCOUNT_TYPE_LABEL: Record<CoaAccountType, string> = {
  asset: "Asset",
  liability: "Liability",
  equity: "Equity",
  income: "Income",
  expense: "Expense",
};

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
  return `${ACCOUNT_TYPE_LABEL[type]} accounts usually sit in the ${RANGE_LABELS[type]} — using ${code} may put it in the wrong section of your reports.`;
}
