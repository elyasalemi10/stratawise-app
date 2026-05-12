import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MatchStatusBadge } from "@/components/shared/match-status-badge";
import type { BankTransactionDetail } from "@/lib/validations/reconciliation";

const SOURCE_LABEL: Record<string, string> = {
  manual: "Manual",
  csv: "CSV",
  basiq: "Bank feed",
};

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n);

const formatDate = (iso: string) => {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

interface Props {
  transaction: BankTransactionDetail;
  showAllocateForm?: boolean;
}

export function TransactionCard({ transaction, showAllocateForm = true }: Props) {
  const isCredit = transaction.amount > 0;
  const amountClass = isCredit ? "text-[hsl(160,100%,37%)]" : "text-destructive";

  return (
    <Card className="shadow-none">
      <CardContent className="p-5 space-y-4">
        {/* Date and amount header */}
        <div className="flex items-start justify-between">
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Date
            </div>
            <div className="mt-1 text-sm font-medium">
              {formatDate(transaction.transaction_date)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Amount
            </div>
            <div className={`mt-1 text-lg font-bold tabular-nums ${amountClass}`}>
              {formatCurrency(transaction.amount)}
            </div>
          </div>
        </div>

        {/* Source and status badges */}
        <div className="flex items-center gap-2">
          <Badge variant="neutral">{SOURCE_LABEL[transaction.source] || transaction.source}</Badge>
          <MatchStatusBadge
            status={transaction.match_status}
            isVoided={transaction.is_voided}
            matchedTotal={transaction.matched_total}
            amount={transaction.amount}
          />
        </div>

        {/* Bank account label */}
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Bank Account
          </div>
          <div className="mt-1 text-sm text-foreground">{transaction.bank_account_name}</div>
        </div>

        {/* Raw description */}
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Description
          </div>
          <div className="mt-1 text-sm text-foreground break-words">
            {transaction.description || "—"}
          </div>
        </div>

        {/* Detected reference — only show when allocate form will be visible */}
        {transaction.detected_reference && showAllocateForm && (
          <div className="mt-3 p-3 bg-blue-50 rounded-md border border-blue-200">
            <div className="text-xs font-medium text-blue-900 mb-2">
              Detected reference
            </div>
            <div className="text-sm font-mono text-blue-700 mb-2">
              {transaction.detected_reference}
            </div>
            <div className="text-xs text-blue-600">
              ℹ Reference detected. The first allocation row will suggest this levy and lot.
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
