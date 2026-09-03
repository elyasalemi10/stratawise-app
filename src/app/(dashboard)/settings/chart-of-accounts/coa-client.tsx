"use client";

import { useCachedData } from "@/lib/use-cached-data";
import { ChartOfAccountsContent } from "./chart-of-accounts-content";
import { getChartOfAccountsPageData, type ChartOfAccountsPageData } from "./data";
import { ChartOfAccountsSkeleton } from "./coa-skeleton";

// Data lives here, not in page.tsx, so returning to this page paints the
// previous rows instantly from the tab cache instead of a server round trip
// behind loading.tsx.

export function ChartOfAccountsClient() {
  const { data, loading } = useCachedData<ChartOfAccountsPageData>("coa", getChartOfAccountsPageData);

  if (loading || !data) return <ChartOfAccountsSkeleton />;

  return <ChartOfAccountsContent initialAccounts={data.accounts} />;
}
