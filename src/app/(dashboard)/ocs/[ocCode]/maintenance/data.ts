"use server";

import { getRecurringJobsForOC } from "@/lib/actions/recurring-jobs";
import { getContractorOptions } from "@/lib/actions/contractors";
import { requireOCAccess } from "@/lib/auth";

export interface OCMaintenancePageData {
  jobs: Awaited<ReturnType<typeof getRecurringJobsForOC>>;
  contractors: Awaited<ReturnType<typeof getContractorOptions>>;
}

export async function getOCMaintenancePageData(ocId: string): Promise<OCMaintenancePageData> {
  await requireOCAccess(ocId);

  const [jobs, contractors] = await Promise.all([
    getRecurringJobsForOC(ocId),
    getContractorOptions(),
  ]);

  return { jobs, contractors };
}
