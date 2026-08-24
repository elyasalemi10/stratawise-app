"use server";

import { getRecurringJobs, getCompanyOCsForSelect } from "@/lib/actions/recurring-jobs";
import { getContractorOptions } from "@/lib/actions/contractors";
import { getCurrentProfile } from "@/lib/auth";

// One aggregate fetch, called from the client through useCachedData. The
// three queries are independent, so they go out together rather than in
// sequence.
//
// The auth check lives HERE as well as in page.tsx: page.tsx only runs on the
// initial shell request, so once the client owns every subsequent refresh a
// check left only up there would be skipped.

export interface MaintenancePageData {
  jobs: Awaited<ReturnType<typeof getRecurringJobs>>;
  ocs: Awaited<ReturnType<typeof getCompanyOCsForSelect>>;
  contractors: Awaited<ReturnType<typeof getContractorOptions>>;
}

export async function getMaintenancePageData(): Promise<MaintenancePageData> {
  const profile = await getCurrentProfile();
  if (!profile) throw new Error("Not authenticated.");
  if (profile.role === "lot_owner") throw new Error("Not available for lot owners.");

  const [jobs, ocs, contractors] = await Promise.all([
    getRecurringJobs(),
    getCompanyOCsForSelect(),
    getContractorOptions(),
  ]);

  return { jobs, ocs, contractors };
}
