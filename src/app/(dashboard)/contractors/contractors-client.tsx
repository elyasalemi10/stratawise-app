"use client";

import { useCachedData } from "@/lib/use-cached-data";
import { ContractorsContent } from "./contractors-content";
import { getContractorsPageData, type ContractorsPageData } from "./data";
import { ContractorsSkeleton } from "./contractors-skeleton";

// Data lives here, not in page.tsx, so returning to this page paints the
// previous rows instantly from the tab cache instead of a server round trip
// behind loading.tsx.

export function ContractorsClient() {
  const { data, loading } = useCachedData<ContractorsPageData>("contractors", getContractorsPageData);

  if (loading || !data) return <ContractorsSkeleton />;

  return <ContractorsContent contractors={data.contractors} />;
}
