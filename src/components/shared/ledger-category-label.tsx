import type { LedgerEntryCategory } from "@/lib/validations/ledger";

const LABELS: Record<LedgerEntryCategory, string> = {
  levy: "Levy",
  special_levy: "Special levy",
  interest: "Interest",
  payment: "Payment",
  writeoff: "Write-off",
  adjustment_debit: "Adjustment (debit)",
  adjustment_credit: "Adjustment (credit)",
  refund: "Refund",
  void_offset: "Void offset",
};

export function ledgerCategoryLabel(category: LedgerEntryCategory): string {
  return LABELS[category];
}

interface LedgerCategoryLabelProps {
  category: LedgerEntryCategory;
  className?: string;
}

export function LedgerCategoryLabel({
  category,
  className,
}: LedgerCategoryLabelProps) {
  return <span className={className}>{LABELS[category]}</span>;
}
