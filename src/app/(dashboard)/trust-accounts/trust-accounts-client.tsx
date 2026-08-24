"use client";

import { useCachedData } from "@/lib/use-cached-data";
import { TrustAccountsContent } from "./trust-accounts-content";
import { getTrustAccountsPageData, type TrustAccountsPageData } from "./data";
import { TrustAccountsSkeleton } from "./trust-accounts-skeleton";

export function TrustAccountsClient() {
  const { data, loading } = useCachedData<TrustAccountsPageData>(
    "trust-accounts",
    getTrustAccountsPageData,
  );

  if (loading || !data) return <TrustAccountsSkeleton />;

  return <TrustAccountsContent accounts={data.accounts} />;
}
