import { Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { TableSkeleton } from "@/components/shared/table-skeleton";

// Mirrors maintenance-content.tsx. Search box and "Add job" are fixed, so
// they render for real; only the count and the rows are server data.

export function MaintenanceSkeleton() {
  return (
    <div className="space-y-6">
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
          { label: "Job", cell: "w-40" },
          { label: "OC", cell: "w-24" },
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
