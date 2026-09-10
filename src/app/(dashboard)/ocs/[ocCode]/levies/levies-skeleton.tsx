"use client";

import { CalendarClock, Plus } from "lucide-react";
import { OCPageTitle } from "@/components/shared/page-title";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TableSkeleton } from "@/components/shared/table-skeleton";

// Mirrors levies-client.tsx: the schedule strip, the Generate button, then
// the batches. "Generate levies" and the strip's own frame are fixed, so
// they render for real; only what the schedule SAYS and the batch rows are
// server data.

export function LeviesSkeleton() {
  return (
    <div className="space-y-4">
      <OCPageTitle page="Levies" />

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-card px-4 py-3">
        <div className="flex items-center gap-3">
          <CalendarClock className="h-4 w-4 shrink-0 text-muted-foreground" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-8 w-32 rounded-md" />
      </div>

      <div className="flex justify-end">
        <Button size="sm" disabled>
          <Plus className="mr-2 h-3.5 w-3.5" />
          Generate levies
        </Button>
      </div>

      <TableSkeleton
        rows={5}
        columns={[
          { label: "Type", cell: "w-16" },
          { label: "Financial Year", cell: "w-28" },
          { label: "Operating", cell: "w-16", align: "right" },
          { label: "Other", cell: "w-12", align: "right" },
          { label: "Due date", cell: "w-24" },
          { label: "Status", pill: true },
        ]}
      />
    </div>
  );
}
