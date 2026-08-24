import { Skeleton } from "@/components/ui/skeleton";
import { TableSkeleton } from "@/components/shared/table-skeleton";

// Mirrors reconciliation-queue.tsx. Only the unmatched count and the rows
// are server data; the six column headings are fixed.

export function ReconciliationSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-3.5 w-40" />
      </div>

      <TableSkeleton
        columns={[
          { label: "Date", cell: "w-16" },
          { label: "Account", cell: "w-32" },
          { label: "Description", cell: "w-56" },
          { label: "Reference", cell: "w-24" },
          { label: "Amount", cell: "w-16", align: "right" },
          { label: "Action", pill: true, align: "right" },
        ]}
      />
    </div>
  );
}
