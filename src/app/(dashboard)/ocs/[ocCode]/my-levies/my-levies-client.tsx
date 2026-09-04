"use client";

import { useCallback } from "react";
import { OCPageTitle } from "@/components/shared/page-title";
import { useCachedData } from "@/lib/use-cached-data";
import { MyLeviesContent } from "./my-levies-content";
import { getMyLeviesPageData, type MyLeviesPageData } from "./data";
import { MyLeviesSkeleton } from "./my-levies-skeleton";

export function MyLeviesClient({ ocId }: { ocId: string }) {
  const fetcher = useCallback(() => getMyLeviesPageData(ocId), [ocId]);
  const { data, loading } = useCachedData<MyLeviesPageData>(`my-levies:${ocId}`, fetcher);

  if (loading || !data) return <MyLeviesSkeleton />;

  return (
    <div className="space-y-6">
      <OCPageTitle page="Levies" />
      <MyLeviesContent levies={data.levies} />
    </div>
  );
}
