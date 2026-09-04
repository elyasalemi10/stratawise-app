"use client";

import { useCachedData } from "@/lib/use-cached-data";
import { OCsContent } from "./ocs-content";
import { getOCsPageData, type OCsPageData } from "./data";
import { OCsSkeleton } from "./ocs-skeleton";

// Data lives here, not in page.tsx, so returning to this page paints the
// previous cards instantly from the tab cache instead of a server round trip.

export function OCsClient() {
  const { data, loading } = useCachedData<OCsPageData>("ocs", getOCsPageData);

  if (loading || !data) return <OCsSkeleton />;

  return <OCsContent summary={data.summary} isLotOwner={data.isLotOwner} />;
}
