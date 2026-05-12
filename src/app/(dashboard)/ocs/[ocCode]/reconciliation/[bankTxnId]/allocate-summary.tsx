import { Card, CardContent } from "@/components/ui/card";

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n);

interface Props {
  bankTxnTotal: number;
  alreadyMatched: number;
  remainingBeforeForm: number;
  beingMatched?: number;
}

export function AllocateSummary({
  bankTxnTotal,
  alreadyMatched,
  remainingBeforeForm,
  beingMatched = 0,
}: Props) {
  const finalRemaining = remainingBeforeForm - beingMatched;

  return (
    <Card className="shadow-none border-l-4 border-l-primary">
      <CardContent className="p-4">
        <div className="space-y-2 text-sm font-medium">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Bank txn total</span>
            <span className="tabular-nums">{formatCurrency(bankTxnTotal)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Already matched</span>
            <span className="tabular-nums">{formatCurrency(alreadyMatched)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Being matched</span>
            <span className="tabular-nums font-semibold text-primary">
              {formatCurrency(beingMatched)}
            </span>
          </div>
          <div className="pt-2 border-t border-border flex items-center justify-between">
            <span className="font-semibold">Remaining</span>
            <span
              className={`tabular-nums font-bold text-lg ${
                finalRemaining === 0
                  ? "text-green-600"
                  : finalRemaining > 0
                    ? "text-destructive"
                    : "text-destructive"
              }`}
            >
              {formatCurrency(finalRemaining)}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
