"use server";

import { listChartOfAccounts } from "@/lib/actions/chart-of-accounts";
import { getCurrentProfile } from "@/lib/auth";

// One aggregate fetch, called from the client through useCachedData.
//
// The auth check lives HERE as well as in page.tsx. page.tsx only runs on
// the initial shell request, so once the client owns every subsequent
// refresh a check left only up there would be skipped. getCurrentProfile is
// memoised per request, so the duplicate costs nothing.

export interface ChartOfAccountsPageData {
  accounts: Awaited<ReturnType<typeof listChartOfAccounts>>;
}

export async function getChartOfAccountsPageData(): Promise<ChartOfAccountsPageData> {
  const profile = await getCurrentProfile();
  if (!profile) throw new Error("Not authenticated.");
  if (profile.role === "lot_owner") throw new Error("Not available for lot owners.");
  if (!profile.management_company_id) throw new Error("No management company on this profile.");
  return { accounts: await listChartOfAccounts() };
}
