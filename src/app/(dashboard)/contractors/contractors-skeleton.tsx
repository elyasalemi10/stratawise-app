import { Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { TableSkeleton } from "@/components/shared/table-skeleton";

// Mirrors contractors-content.tsx. Search box and "Add contractor" are
// fixed, so they render for real; only the count and the rows are server
// data.

export function ContractorsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Skeleton className="h-3.5 w-24" />
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input disabled placeholder="Search contractors" className="h-9 w-64 pl-7" />
          </div>
        </div>
        <Button disabled>
          <Plus className="mr-2 h-4 w-4" />
          Add contractor
        </Button>
      </div>

      <TableSkeleton
        columns={[
          { label: "Business", cell: "w-40" },
          { label: "Trade", pill: true },
          { label: "Primary contact", cell: "w-32" },
          { label: "ABN", cell: "w-24" },
          { label: "GST", pill: true },
          { label: "Public liability expiry", cell: "w-24" },
        ]}
      />
    </div>
  );
}
