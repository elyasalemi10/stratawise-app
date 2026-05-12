import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { BankTransactionDetail } from "@/lib/validations/reconciliation";

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n);

const formatDate = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

interface Props {
  matches: BankTransactionDetail["matches"];
  bankTxnId: string;
  ocId: string;
  onUnlink?: (matchId: string) => void;
}

export function ExistingMatchesSection({ matches, onUnlink }: Props) {
  return (
    <Card className="shadow-none">
      <CardContent className="p-5">
        <h3 className="text-sm font-semibold mb-4">Existing matches</h3>

        <div className="space-y-3">
          {matches.map((match) => (
            <div
              key={match.id}
              className="p-3 border border-border rounded-md bg-muted/20"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div>
                  <div className="text-sm font-medium">
                    Lot {match.lot_number}
                    {match.unit_number && ` — Unit ${match.unit_number}`}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {match.fund_type === "administrative" ? "Admin fund" : "Capital works fund"}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold text-foreground">
                    {formatCurrency(match.amount_matched)}
                  </div>
                  {match.levy_reference && (
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {match.levy_reference}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="neutral" className="text-xs">
                  {match.match_method === "manual" ? "Manually matched" : "Auto matched"}
                </Badge>
                {match.matched_at && (
                  <span className="text-xs text-muted-foreground">
                    {formatDate(match.matched_at)}
                    {match.matched_by && ` by ${match.matched_by}`}
                  </span>
                )}
              </div>

              {match.notes && (
                <div className="mt-2 text-xs text-muted-foreground italic border-l-2 border-muted-foreground pl-2">
                  &quot;{match.notes}&quot;
                </div>
              )}

              {onUnlink && (
                <div className="mt-3">
                  <button
                    onClick={() => onUnlink(match.id)}
                    className="text-xs text-destructive hover:text-destructive/80 underline"
                  >
                    Unlink this match
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
