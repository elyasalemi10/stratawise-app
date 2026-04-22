"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { BankTransactionDetail } from "@/lib/validations/reconciliation";
import { TransactionCard } from "./transaction-card";
import { ExistingMatchesSection } from "./existing-matches-section";
import { ClearPendingReceiptsCard } from "./clear-pending-receipts-card";
import { AllocateSummary } from "./allocate-summary";
import { AllocateForm } from "./allocate-form";

interface Props {
  subdivisionId: string;
  transaction: BankTransactionDetail;
}

export function MatchDetailContent({ subdivisionId, transaction }: Props) {
  const [isFullyMatched, setIsFullyMatched] = useState(
    transaction.remaining === 0
  );

  const clearCardApplicable =
    transaction.undeposited_candidates &&
    transaction.undeposited_candidates.length > 0;

  const totalUndepositedFunds =
    transaction.undeposited_candidates?.reduce((sum, u) => sum + u.amount, 0) ?? 0;

  const undepositedMatchesExactly = totalUndepositedFunds === transaction.remaining;
  const undepositedPartialMatch =
    clearCardApplicable && totalUndepositedFunds < transaction.remaining && totalUndepositedFunds > 0;

  const showClearCard = undepositedMatchesExactly || undepositedPartialMatch;
  const showAllocateForm = !undepositedMatchesExactly;

  const base = `/subdivisions/${subdivisionId}/finance/reconciliation`;

  return (
    <div className="px-6 py-6">
      {/* Header with back link */}
      <div className="flex items-center gap-2 mb-6">
        <Link href={base}>
          <Button variant="ghost" size="sm" className="h-8 px-2">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <span className="text-sm text-muted-foreground">
          Back to reconciliation
        </span>
      </div>

      {/* Main layout: left (40%) | right (60%) on desktop, stacked on mobile */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.5fr] gap-6">
        {/* LEFT PANEL */}
        <div className="space-y-6">
          <TransactionCard transaction={transaction} showAllocateForm={showAllocateForm} />

          {transaction.matches.length > 0 && (
            <ExistingMatchesSection
              matches={transaction.matches}
              bankTxnId={transaction.id}
              subdivisionId={subdivisionId}
            />
          )}
        </div>

        {/* RIGHT PANEL */}
        <div className="space-y-6">
          {isFullyMatched && (
            <Card className="shadow-none border-[1.5px] border-green-500/30 bg-green-50">
              <CardContent className="p-4 flex items-center gap-3">
                <Check className="h-5 w-5 text-green-600" />
                <div className="flex-1">
                  <div className="text-sm font-medium text-green-900">
                    This transaction is fully matched
                  </div>
                  <div className="text-xs text-green-700 mt-0.5">
                    All funds have been reconciled to ledger entries.
                  </div>
                </div>
                <Link href={`${base}?status=all`}>
                  <Button variant="outline" size="sm" className="text-xs">
                    Back to queue
                  </Button>
                </Link>
              </CardContent>
            </Card>
          )}

          {showClearCard && (
            <ClearPendingReceiptsCard
              bankTxnId={transaction.id}
              subdivisionId={subdivisionId}
              undepositedEntries={transaction.undeposited_candidates || []}
              totalAmount={totalUndepositedFunds}
              onSuccess={() => {
                if (undepositedMatchesExactly) {
                  setIsFullyMatched(true);
                  toast.success(
                    `Cleared ${transaction.undeposited_candidates?.length ?? 0} pending receipt(s)`
                  );
                } else {
                  toast.success(`Cleared $${totalUndepositedFunds.toFixed(2)} in pending receipts`);
                }
              }}
            />
          )}

          {showAllocateForm && (
            <>
              <AllocateSummary
                bankTxnTotal={transaction.amount}
                alreadyMatched={transaction.matched_total}
                remainingBeforeForm={transaction.remaining}
              />
              <AllocateForm
                bankTxnId={transaction.id}
                subdivisionId={subdivisionId}
                bankAccountFundType={transaction.bank_account_fund_type}
                transactionAmount={transaction.amount}
                alreadyMatched={transaction.matched_total}
                detectedReference={transaction.detected_reference}
                onSuccess={(allocated) => {
                  const newRemaining = transaction.remaining - allocated;
                  if (newRemaining === 0) {
                    setIsFullyMatched(true);
                    toast.success("Matched $" + allocated.toFixed(2) + " to " + transaction.matches.length + 1 + " lot(s).");
                  } else {
                    toast.success("Matched $" + allocated.toFixed(2) + " to lot(s).");
                  }
                }}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
