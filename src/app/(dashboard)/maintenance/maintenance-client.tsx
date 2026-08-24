"use client";

import { useCachedData } from "@/lib/use-cached-data";
import { MaintenanceContent } from "./maintenance-content";
import { getMaintenancePageData, type MaintenancePageData } from "./data";
import { MaintenanceSkeleton } from "./maintenance-skeleton";

// Data lives here, not in page.tsx, so returning to this page paints the
// previous jobs instantly from the tab cache instead of a server round trip.

export function MaintenanceClient() {
  const { data, loading } = useCachedData<MaintenancePageData>(
    "maintenance",
    getMaintenancePageData,
  );

  if (loading || !data) return <MaintenanceSkeleton />;

  return (
    <MaintenanceContent jobs={data.jobs} ocs={data.ocs} contractors={data.contractors} />
  );
}
