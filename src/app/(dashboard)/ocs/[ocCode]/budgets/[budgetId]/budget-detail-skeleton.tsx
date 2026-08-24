import { ChevronDown } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TableSkeleton } from "@/components/shared/table-skeleton";

// Mirrors budget-detail-content.tsx.
//
// The "Actions" trigger and the five column headings are fixed, so they
// render for real. The financial year, the status badge and the cells are
// server data. The table sits inside a card on this page, which the bare
// table skeleton was missing entirely.

export function BudgetDetailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-2">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-5 w-20 rounded-full" />
        </div>
        <span className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-border bg-card px-3 text-sm font-medium text-muted-foreground">
          Actions
          <ChevronDown className="size-3.5" />
        </span>
      </div>

      <Card>
        <CardContent className="pt-5">
          <TableSkeleton
            rows={6}
            columns={[
              { label: "Account code", cell: "w-14" },
              { label: "Name", cell: "w-48" },
              { label: "Fund", pill: true },
              { label: "Paying lots", cell: "w-24" },
              { label: "Annual amount", cell: "w-20" },
            ]}
          />
        </CardContent>
      </Card>
    </div>
  );
}
