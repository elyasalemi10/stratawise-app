"use server";

import { getOC } from "@/lib/actions/oc";
import { getOCBudgets, type BudgetWithItems } from "@/lib/actions/budget";
import { requireOCAccess } from "@/lib/auth";

// One aggregate fetch, called from the client through useCachedData.
//
// The budget list used to be fetched inside BudgetPageContent with its own
// useEffect and its own skeleton, so the page showed TWO loading states back
// to back: the route skeleton, then a second grey block. The data belongs
// here with everything else the page needs.
//
// The auth check lives here, not in page.tsx: page.tsx only runs on the
// initial shell request, so a check left up there would be skipped on every
// refresh the client drives afterwards.

export interface BudgetsPageData {
  budgets: BudgetWithItems[];
  financialYearStartMonth: number;
  isLotOwner: boolean;
}

export async function getBudgetsPageData(ocId: string): Promise<BudgetsPageData> {
  const profile = await requireOCAccess(ocId);

  const [oc, budgets] = await Promise.all([getOC(ocId), getOCBudgets(ocId)]);
  if (!oc) throw new Error("Owners Corporation not found.");

  return {
    budgets,
    financialYearStartMonth: oc.financial_year_start_month,
    isLotOwner: profile.role === "lot_owner",
  };
}
