"use client";

import { useCallback } from "react";
import { useCachedData } from "@/lib/use-cached-data";
import { BudgetDetailContent } from "./budget-detail-content";
import { getBudgetDetailPageData, type BudgetDetailPageData } from "./data";
import { BudgetDetailSkeleton } from "./budget-detail-skeleton";

export function BudgetDetailClient({
  ocId,
  ocCode,
  budgetId,
}: {
  ocId: string;
  ocCode: string;
  budgetId: string;
}) {
  const fetcher = useCallback(() => getBudgetDetailPageData(ocId, budgetId), [ocId, budgetId]);
  const { data, loading } = useCachedData<BudgetDetailPageData>(
    `budget:${budgetId}`,
    fetcher,
  );

  if (loading || !data) return <BudgetDetailSkeleton />;

  return (
    <BudgetDetailContent
      ocCode={ocCode}
      ocId={ocId}
      budget={data.budget}
      accounts={data.accounts}
      lots={data.lots}
    />
  );
}
