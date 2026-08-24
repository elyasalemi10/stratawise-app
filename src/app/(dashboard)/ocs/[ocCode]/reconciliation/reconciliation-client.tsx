"use client";

import { useCallback } from "react";
import { CheckCircle2 } from "lucide-react";
import { useCachedData } from "@/lib/use-cached-data";
import { EmptyState } from "@/components/shared/empty-state";
import { ReconciliationQueue } from "./reconciliation-queue";
import { getReconciliationPageData, type ReconciliationPageData } from "./data";
import { ReconciliationSkeleton } from "./reconciliation-skeleton";

export function ReconciliationClient({ ocId }: { ocId: string }) {
  const fetcher = useCallback(() => getReconciliationPageData(ocId), [ocId]);
  const { data, loading } = useCachedData<ReconciliationPageData>(
    `reconciliation:${ocId}`,
    fetcher,
  );

  if (loading || !data) return <ReconciliationSkeleton />;

  if (data.transactions.length === 0) {
    return (
      <EmptyState
        icon={CheckCircle2}
        title="Nothing to reconcile"
        description="Every imported transaction is matched. New CSV imports that can't be auto-matched will appear here."
      />
    );
  }

  return (
    <ReconciliationQueue
      ocId={ocId}
      transactions={data.transactions}
      accounts={data.accounts}
      lots={data.lots}
      levies={data.levies}
    />
  );
}
