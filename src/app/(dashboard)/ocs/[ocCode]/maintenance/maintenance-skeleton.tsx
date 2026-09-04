"use client";

import { Plus, Search } from "lucide-react";
import { OCPageTitle } from "@/components/shared/page-title";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { TableSkeleton } from "@/components/shared/table-skeleton";

// Mirrors maintenance-content.tsx rendered with fixedOcId set, which is how
// the per-OC page uses it. That drops the OC column, so this skeleton drops
// it too, otherwise the table loses a column when the data lands.
//
// Search box and "New recurring job" are fixed, so they render for real.

export function OCMaintenanceSkeleton() {
  return (
    <div className="space-y-6">
      <OCPageTitle page="Maintenance" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Skeleton className="h-3.5 w-28" />
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input disabled placeholder="Search jobs" className="h-9 w-64 pl-7" />
          </div>
        </div>
        <Button disabled>
          <Plus className="mr-2 h-4 w-4" />
          New recurring job
        </Button>
      </div>

      <TableSkeleton
        columns={[
          { label: "Job", cell: "w-44" },
          { label: "Contractor", cell: "w-36" },
          { label: "Frequency", cell: "w-20" },
          { label: "Next due", cell: "w-20" },
          { label: "Cost / visit", cell: "w-16", align: "right" },
          { label: "Status", pill: true },
        ]}
      />
    </div>
  );
}
