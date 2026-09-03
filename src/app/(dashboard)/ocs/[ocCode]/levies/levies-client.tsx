"use client";

import { useCallback } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { useCachedData } from "@/lib/use-cached-data";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { LeviesTable } from "./levies-table";
import { getLeviesPageData, type LeviesPageData } from "./data";
import { LeviesSkeleton } from "./levies-skeleton";

export function LeviesClient({ ocId, ocCode }: { ocId: string; ocCode: string }) {
  const fetcher = useCallback(() => getLeviesPageData(ocId), [ocId]);
  const { data, loading } = useCachedData<LeviesPageData>(`levies:${ocId}`, fetcher);

  if (loading || !data) return <LeviesSkeleton />;

  const { batches } = data;

  return (
    <div className="space-y-4">
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
        <LeviesTable ocCode={ocCode} batches={batches} />
      )}
    </div>
  );
}
