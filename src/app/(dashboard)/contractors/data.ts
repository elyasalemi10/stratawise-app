"use server";

import { getContractors } from "@/lib/actions/contractors";
import { getCurrentProfile } from "@/lib/auth";

// One aggregate fetch, called from the client through useCachedData.
//
// The auth check lives HERE as well as in page.tsx. page.tsx only runs on
// the initial shell request, so once the client owns every subsequent
// refresh a check left only up there would be skipped. getCurrentProfile is
// memoised per request, so the duplicate costs nothing.

export interface ContractorsPageData {
  contractors: Awaited<ReturnType<typeof getContractors>>;
}

export async function getContractorsPageData(): Promise<ContractorsPageData> {
  const profile = await getCurrentProfile();
  if (!profile) throw new Error("Not authenticated.");
  if (profile.role === "lot_owner") throw new Error("Not available for lot owners.");
  return { contractors: await getContractors() };
}
