"use client";

import { useCallback } from "react";
import { useCachedData } from "@/lib/use-cached-data";
import { InsuranceTimeline } from "./insurance-timeline";
import { getInsurancePageData, type InsurancePageData } from "./data";
import { InsuranceSkeleton } from "./insurance-skeleton";

export function InsuranceClient({ ocId }: { ocId: string }) {
  const fetcher = useCallback(() => getInsurancePageData(ocId), [ocId]);
  const { data, loading } = useCachedData<InsurancePageData>(`insurance:${ocId}`, fetcher);

  if (loading || !data) return <InsuranceSkeleton />;

  return (
    <InsuranceTimeline
      ocId={ocId}
      policies={data.policies}
      readOnly={data.readOnly}
      managementStartDate={data.managementStartDate}
      fyStartMonth={data.fyStartMonth}
    />
  );
}
