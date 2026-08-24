"use server";

import { getBudgetById } from "@/lib/actions/budget";
import { listChartOfAccounts } from "@/lib/actions/chart-of-accounts";
import { getOcLots } from "@/lib/actions/funds";
import { requireOCAccess } from "@/lib/auth";

export interface BudgetDetailPageData {
  budget: NonNullable<Awaited<ReturnType<typeof getBudgetById>>>;
  accounts: Awaited<ReturnType<typeof listChartOfAccounts>>;
  lots: Awaited<ReturnType<typeof getOcLots>>;
}

export async function getBudgetDetailPageData(
  ocId: string,
  budgetId: string,
): Promise<BudgetDetailPageData> {
  await requireOCAccess(ocId);

  // getBudgetById used to run alone before the other two. It gates nothing
  // they need (both key off ocId), so all three go out together.
  const [budget, allAccounts, lots] = await Promise.all([
    getBudgetById(budgetId),
    listChartOfAccounts(),
    getOcLots(ocId),
  ]);
  if (!budget || budget.oc_id !== ocId) throw new Error("Budget not found.");

  // Same chart-of-accounts filter the create form uses.
  return {
    budget,
    accounts: allAccounts.filter(
      (a) => !a.archived_at && (a.account_type === "expense" || a.account_type === "income"),
    ),
    lots,
  };
}
