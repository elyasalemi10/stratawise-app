"use client";

import { BudgetTab } from "../manage/budget-tab";

export function BudgetPageContent({
  ocId,
  financialYearStartMonth,
}: {
  ocId: string;
  financialYearStartMonth: number;
}) {
  return (
    <BudgetTab
      ocId={ocId}
      financialYearStartMonth={financialYearStartMonth}
    />
  );
}
