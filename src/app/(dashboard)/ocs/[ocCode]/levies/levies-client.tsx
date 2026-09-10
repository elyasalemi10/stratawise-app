"use client";

import { useCallback } from "react";
import { OCPageTitle } from "@/components/shared/page-title";
import Link from "next/link";
import { Plus } from "lucide-react";
import { refetchCached, useCachedData } from "@/lib/use-cached-data";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { LeviesTable } from "./levies-table";
import { getLeviesPageData, type LeviesPageData } from "./data";
import { LeviesSkeleton } from "./levies-skeleton";
import { LevyScheduleStrip, QueuedRuns } from "./levy-schedule";

export function LeviesClient({ ocId, ocCode }: { ocId: string; ocCode: string }) {
  const fetcher = useCallback(() => getLeviesPageData(ocId), [ocId]);
  const { data, loading } = useCachedData<LeviesPageData>(`levies:${ocId}`, fetcher);

  if (loading || !data) return <LeviesSkeleton />;

  const { batches, schedule } = data;

  return (
    <div className="space-y-4">
      <OCPageTitle page="Levies" />

      {/* The schedule that produces the rows below, immediately above them.
          It used to be three clicks away at Settings > Automation, which is
          the wrong place for the decision about when levies go out: this
          page IS the record of that decision having been carried out. */}
      <LevyScheduleStrip
        ocId={ocId}
        data={schedule}
        onSaved={() => refetchCached(`levies:${ocId}`)}
      />

      {batches.length > 0 && (
        <div className="flex justify-end">
          <Link href={`/ocs/${ocCode}/generate`}>
            <Button size="sm">
              <Plus className="mr-2 h-3.5 w-3.5" />
              Generate levies
            </Button>
          </Link>
        </div>
      )}

      {batches.length === 0 ? (
        <EmptyState
          illustration="documents"
          title="No levies generated yet"
          description="Generate levies from an approved budget to start issuing levy notices to lot owners."
          action={
            <Link href={`/ocs/${ocCode}/generate`}>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Generate levies
              </Button>
            </Link>
          }
        />
      ) : (
        <>
          {/* Runs that have not happened yet, above the ones that have, so
              the page reads as one timeline. The dates were only ever
              visible inside the editor, which put the case that actually
              bites, a run landing on a day the manager does not want, two
              clicks from being noticed. */}
          <QueuedRuns schedule={schedule.schedule} />
          <LeviesTable ocCode={ocCode} batches={batches} />
        </>
      )}
    </div>
  );
}
