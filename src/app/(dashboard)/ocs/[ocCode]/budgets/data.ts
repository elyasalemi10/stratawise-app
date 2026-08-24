"use server";

import { getOC } from "@/lib/actions/oc";
import { requireOCAccess } from "@/lib/auth";

// One aggregate fetch, called from the client through useCachedData. The
// auth check lives here, not in page.tsx: page.tsx only runs on the initial
// shell request, so a check left up there would be skipped on every refresh
// the client drives afterwards.

export interface BudgetsPageData {
  financialYearStartMonth: number;
  isLotOwner: boolean;
}

export async function getBudgetsPageData(ocId: string): Promise<BudgetsPageData> {
  const profile = await requireOCAccess(ocId);
  const oc = await getOC(ocId);
  if (!oc) throw new Error("Owners Corporation not found.");

  return {
    financialYearStartMonth: oc.financial_year_start_month,
    isLotOwner: profile.role === "lot_owner",
  };
}
