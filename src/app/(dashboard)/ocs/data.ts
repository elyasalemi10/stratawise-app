"use server";

import { getCompanyOCSummary } from "@/lib/actions/oc";
import { getCurrentProfile } from "@/lib/auth";

// One aggregate fetch, called from the client through useCachedData.
//
// The auth check lives HERE as well as in page.tsx: page.tsx only runs on the
// initial shell request, so once the client owns every subsequent refresh a
// check left only up there would be skipped.

export interface OCsPageData {
  summary: Awaited<ReturnType<typeof getCompanyOCSummary>>;
}

export async function getOCsPageData(): Promise<OCsPageData> {
  const profile = await getCurrentProfile();
  if (!profile) throw new Error("Not authenticated.");

  return { summary: await getCompanyOCSummary() };
}
