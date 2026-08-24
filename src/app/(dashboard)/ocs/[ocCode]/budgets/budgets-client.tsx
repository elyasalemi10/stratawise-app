"use client";

import { useCallback } from "react";
import { useCachedData } from "@/lib/use-cached-data";
import { BudgetPageContent } from "./budget-page-content";
import { getBudgetsPageData, type BudgetsPageData } from "./data";
import { BudgetsSkeleton } from "./budgets-skeleton";

export function BudgetsClient({ ocId }: { ocId: string }) {
  const fetcher = useCallback(() => getBudgetsPageData(ocId), [ocId]);
  const { data, loading } = useCachedData<BudgetsPageData>(`budgets:${ocId}`, fetcher);

  if (loading || !data) return <BudgetsSkeleton />;

  return (
    <BudgetPageContent
      budgets={data.budgets}
      financialYearStartMonth={data.financialYearStartMonth}
    />
  );
}
