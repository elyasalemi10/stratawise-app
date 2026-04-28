"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { depositUndepositedFunds } from "@/lib/actions/reconciliation";

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n);

interface Props {
  bankTxnId: string;
  subdivisionId: string;
  undepositedEntries: Array<{
    id: string;
    receipt_number: string;
    lot_id: string;
    lot_number: string;
    amount: number;
    received_date: string;
    payment_method: "cash" | "cheque";
    cheque_number: string | null;
  }>;
  totalAmount: number;
  onSuccess: () => void;
}

export function ClearPendingReceiptsCard({
  bankTxnId,
  subdivisionId,
  undepositedEntries,
  totalAmount,
  onSuccess,
}: Props) {
  const [isPending, setIsPending] = useState(false);

  const handleClear = async () => {
    setIsPending(true);
    try {
      await depositUndepositedFunds({
        subdivision_id: subdivisionId,
        bank_transaction_id: bankTxnId,
        undeposited_entry_ids: undepositedEntries.map((e) => e.id),
      });
      onSuccess();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to clear receipts";
      toast.error(message);
    } finally {
      setIsPending(false);
    }
  };

  return (
    <Card className="shadow-none border-l-4 border-l-amber-500 bg-amber-50">
      <CardContent className="p-4">
        <div className="space-y-3">
          <div>
            <h3 className="font-semibold text-amber-900">Clear pending receipts</h3>
            <p className="text-sm text-amber-700 mt-1">
              This deposit matches{" "}
              <span className="font-medium">
                {undepositedEntries.length} pending receipt{undepositedEntries.length === 1 ? "" : "s"}
              </span>{" "}
              totalling <span className="font-medium">{formatCurrency(totalAmount)}</span>. Clear
              them to reconcile automatically.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={isPending}
            onClick={handleClear}
            className="bg-amber-100 hover:bg-amber-200 text-amber-900 border-amber-300"
          >
            {isPending ? "Clearing..." : "Clear pending receipts"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
