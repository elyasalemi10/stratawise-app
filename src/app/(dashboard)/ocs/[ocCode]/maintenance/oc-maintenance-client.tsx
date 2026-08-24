"use client";

import { useCallback } from "react";
import { useCachedData } from "@/lib/use-cached-data";
import { MaintenanceContent } from "../../../maintenance/maintenance-content";
import { getOCMaintenancePageData, type OCMaintenancePageData } from "./data";
import { OCMaintenanceSkeleton } from "./maintenance-skeleton";

export function OCMaintenanceClient({
  ocId,
  ocCode,
  ocName,
}: {
  ocId: string;
  ocCode: string;
  ocName: string;
}) {
  const fetcher = useCallback(() => getOCMaintenancePageData(ocId), [ocId]);
  const { data, loading } = useCachedData<OCMaintenancePageData>(
    `oc-maintenance:${ocId}`,
    fetcher,
  );

  if (loading || !data) return <OCMaintenanceSkeleton />;

  return (
    <MaintenanceContent
      jobs={data.jobs}
      ocs={[{ id: ocId, name: ocName, short_code: ocCode }]}
      contractors={data.contractors}
      fixedOcId={ocId}
    />
  );
}
