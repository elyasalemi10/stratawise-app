"use client";

import { useCallback } from "react";
import { useCachedData } from "@/lib/use-cached-data";
import { BatchDetailContent } from "./batch-detail-content";
import { getBatchDetailPageData, type BatchDetailPageData } from "./data";
import { BatchDetailSkeleton } from "./batch-detail-skeleton";

export function BatchDetailClient({ ocId, batchId }: { ocId: string; batchId: string }) {
  const fetcher = useCallback(() => getBatchDetailPageData(ocId, batchId), [ocId, batchId]);
  const { data, loading } = useCachedData<BatchDetailPageData>(`batch:${batchId}`, fetcher);

  if (loading || !data) return <BatchDetailSkeleton />;

  return (
    <BatchDetailContent
      ocId={ocId}
      batch={data.batch}
      reminderSentLevyIds={data.reminderSentLevyIds}
      mailboxOptions={data.mailboxOptions}
    />
  );
}
