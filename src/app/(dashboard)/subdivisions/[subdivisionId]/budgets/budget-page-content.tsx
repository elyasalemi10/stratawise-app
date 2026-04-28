"use client";

import { BudgetTab } from "../manage/budget-tab";

export function BudgetPageContent({
  subdivisionId,
  financialYearStartMonth,
}: {
  subdivisionId: string;
  financialYearStartMonth: number;
}) {
  return (
    <BudgetTab
      subdivisionId={subdivisionId}
      financialYearStartMonth={financialYearStartMonth}
    />
  );
}
