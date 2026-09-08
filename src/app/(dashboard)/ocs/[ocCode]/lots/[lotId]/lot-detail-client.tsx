"use client";

import { useCallback } from "react";
import { useCachedData } from "@/lib/use-cached-data";
import { EmptyState } from "@/components/shared/empty-state";
import { LotDetailContent } from "./lot-detail-content";
import { getLotDetailPageData, type LotDetailPageData } from "./data";
import { LotDetailSkeleton } from "./lot-detail-skeleton";

// Keyed per lot, so clicking through several lots and coming back to one
// paints it from the tab cache instead of re-running the aggregate fetch.

export function LotDetailClient({ ocId, lotId }: { ocId: string; lotId: string }) {
  const fetcher = useCallback(() => getLotDetailPageData(ocId, lotId), [ocId, lotId]);
  const { data, loading } = useCachedData<LotDetailPageData>(`lot:${lotId}`, fetcher);

  if (loading || !data) return <LotDetailSkeleton />;

  if (!data.lot) {
    return (
      <EmptyState
        illustration="building"
        title="Lot not found"
        description="This lot doesn't exist in this Owners Corporation, or it has been removed."
        card={false}
      />
    );
  }

  return (
    <LotDetailContent
      lot={data.lot}
      owner={data.owner}
      ocId={ocId}
      balance={data.balance}
      documents={data.documents}
      ownershipHistory={data.ownershipHistory}
      inviteStatus={data.inviteStatus}
      lotOwnerExtra={data.lotOwnerExtra}
      lastPaymentAt={data.lastPaymentAt}
      nextLevy={data.nextLevy}
      lotAddress={data.lotAddress}
      activity={data.activity}
      portalActivity={data.portalActivity}
      communications={data.communications}
      engagement={data.engagement}
      initialSenderEmailAddress={data.initialSenderEmailAddress}
      initialSmsSenderId={data.initialSmsSenderId}
      ocLots={data.ocLots}
    />
  );
}
