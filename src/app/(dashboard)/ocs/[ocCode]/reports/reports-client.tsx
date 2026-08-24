"use client";

import { useCallback } from "react";
import { useCachedData } from "@/lib/use-cached-data";
import { ReportsContent } from "./reports-content";
import { getReportsPageData, type ReportsPageData } from "./data";
import { ReportsSkeleton } from "./reports-skeleton";

// The skeleton is the real page chrome with the picker disabled, so the only
// thing that changes when the data lands is that the control becomes usable.
// Gating on `loading` rather than rendering with placeholder values is
// deliberate: a report generated before the OC name arrives would put a blank
// name on the PDF.

export function ReportsClient({ ocId }: { ocId: string }) {
  const fetcher = useCallback(() => getReportsPageData(ocId), [ocId]);
  const { data, loading } = useCachedData<ReportsPageData>(`reports:${ocId}`, fetcher);

  if (loading || !data) return <ReportsSkeleton />;

  return (
    <ReportsContent
      ocId={ocId}
      ocName={data.ocName}
      ocAddress={data.ocAddress}
      ocPlanNumber={data.ocPlanNumber}
      logoUrl={data.logoUrl}
      isLotOwner={data.isLotOwner}
      lots={data.lots}
    />
  );
}
