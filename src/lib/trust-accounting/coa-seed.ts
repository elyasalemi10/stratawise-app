// Chart-of-accounts seed for trust accounting. Mirrors the categories
// Victorian strata managers file under for the quarterly trust statement
// + annual audit. Seeded per-firm on first trust account creation so
// every firm starts with the standard taxonomy; they can add / archive
// after.
//
// `kind` separates inflows from outflows so the upload pipeline can do
// sanity checks (a Levy receipt with a negative amount is suspicious).
// `transfer` covers inter-fund moves that net to zero.

export interface SeedCategory {
  code: string;
  label: string;
  kind: "income" | "expense" | "transfer";
}

export const DEFAULT_TRUST_COA: SeedCategory[] = [
  // ─── Income ──────────────────────────────────────────────────────────
  { code: "levy_receipt", label: "Levy receipt", kind: "income" },
  { code: "interest_earned", label: "Interest earned", kind: "income" },
  { code: "insurance_rebate", label: "Insurance rebate", kind: "income" },
  { code: "other_income", label: "Other income", kind: "income" },

  // ─── Expense ─────────────────────────────────────────────────────────
  { code: "insurance_premium", label: "Insurance premium", kind: "expense" },
  { code: "repairs_maintenance", label: "Repairs & maintenance", kind: "expense" },
  { code: "gardening", label: "Gardening", kind: "expense" },
  { code: "cleaning", label: "Cleaning", kind: "expense" },
  { code: "utilities", label: "Utilities (electricity, water)", kind: "expense" },
  { code: "audit_fee", label: "Audit fee", kind: "expense" },
  { code: "bank_charges", label: "Bank charges", kind: "expense" },
  { code: "loan_repayment", label: "Loan repayment", kind: "expense" },
  { code: "owner_refund", label: "Owner refund", kind: "expense" },
  { code: "oc_fee", label: "OC management fee", kind: "expense" },
  { code: "other_expense", label: "Other expense", kind: "expense" },

  // ─── Transfer (net-zero across funds) ────────────────────────────────
  { code: "fund_transfer", label: "Inter-fund transfer", kind: "transfer" },
];
