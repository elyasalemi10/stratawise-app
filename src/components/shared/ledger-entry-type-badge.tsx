import { Badge } from "@/components/ui/badge";
import type { LedgerEntryType } from "@/lib/validations/ledger";

interface LedgerEntryTypeBadgeProps {
  entryType: LedgerEntryType;
  voided?: boolean;
}

export function LedgerEntryTypeBadge({
  entryType,
  voided = false,
}: LedgerEntryTypeBadgeProps) {
  if (voided) {
    return <Badge variant="neutral">Voided</Badge>;
  }
  return entryType === "credit" ? (
    <Badge variant="success">Credit</Badge>
  ) : (
    <Badge variant="destructive">Debit</Badge>
  );
}
