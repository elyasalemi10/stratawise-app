"use client";

import { useCallback } from "react";
import { OCPageTitle } from "@/components/shared/page-title";
import { useCachedData } from "@/lib/use-cached-data";
import { LotsPageContent } from "./lots-page-content";
import { getLotsPageData, type LotsPageData } from "./data";
import { LotsSkeleton } from "./lots-skeleton";

// Client half of the lots register.
//
// The server page is now only a shell: it resolves the OC code to an id and
// nothing else. All the data comes through useCachedData, so returning to
// this page paints the previous lots instantly out of the tab cache while
// the refresh bar runs, instead of a server round trip behind loading.tsx.
//
// loading (no cache at all) renders the skeleton. isEntering (cache present,
// checking it) renders the real content and lets the hook drive the bar.
// They are mutually exclusive, so the page never shimmers and claims to be
// refreshing at the same time.

export function LotsClient({ ocId }: { ocId: string }) {
  const fetcher = useCallback(() => getLotsPageData(ocId), [ocId]);
  const { data, loading } = useCachedData<LotsPageData>(`lots:${ocId}`, fetcher);

  if (loading || !data) return <LotsSkeleton />;

  return (
    <div className="space-y-6">
      <OCPageTitle page="Lots" />
      <LotsPageContent
        lots={data.lots}
        ocId={ocId}
        ocName={data.ocName}
        isLotOwner={data.isLotOwner}
        initialInviteStatus={data.inviteStatus}
      />
    </div>
  );
}
