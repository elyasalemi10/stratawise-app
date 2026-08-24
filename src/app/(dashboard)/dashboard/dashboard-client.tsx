"use client";

import { useCachedData } from "@/lib/use-cached-data";
import { DashboardContent } from "./dashboard-content";
import { getDashboardPageData, type DashboardPageData } from "./data";
import { DashboardSkeleton } from "./dashboard-skeleton";

// Data lives here, not in page.tsx, so coming back to the dashboard paints
// the previous cards instantly from the tab cache instead of a server round
// trip behind loading.tsx.

export function DashboardClient() {
  const { data, loading } = useCachedData<DashboardPageData>(
    "dashboard",
    getDashboardPageData,
  );

  if (loading || !data) return <DashboardSkeleton />;

  return <DashboardContent data={data} />;
}
