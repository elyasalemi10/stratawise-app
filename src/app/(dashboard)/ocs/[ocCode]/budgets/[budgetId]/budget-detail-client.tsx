"use client";

import { useCallback } from "react";
import { useCachedData } from "@/lib/use-cached-data";
import { BudgetDetailContent } from "./budget-detail-content";
import { getBudgetDetailPageData, type BudgetDetailPageData } from "./data";
import { BudgetDetailSkeleton } from "./budget-detail-skeleton";
import type { BudgetWithItems } from "@/lib/actions/budget";

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
  const { data, loading, setData, mutate } = useCachedData<BudgetDetailPageData>(
    `budget:${budgetId}`,
    fetcher,
  );

  // Approving used to call router.refresh(), which did not update this page
  // at all: the page reads from the client cache, and a router refresh only
  // re-runs the server component. So the badge stayed on Draft until the 30s
  // poll came round, and it wiped the Router Cache for every other route on
  // the way past. Writing through the cache instead lands the change on the
  // frame the server confirms it.
  const patchBudget = useCallback(
    (patch: Partial<BudgetWithItems>) => {
      setData((prev) => {
        // Only reachable from the content component, which does not render
        // until data is on screen.
        if (!prev) return prev as unknown as BudgetDetailPageData;
        return { ...prev, budget: { ...prev.budget, ...patch } };
      });
    },
    [setData],
  );

  if (loading || !data) return <BudgetDetailSkeleton />;

  return (
    <BudgetDetailContent
      ocCode={ocCode}
      ocId={ocId}
      budget={data.budget}
      accounts={data.accounts}
      lots={data.lots}
      onBudgetChange={patchBudget}
      mutate={mutate}
    />
  );
}
