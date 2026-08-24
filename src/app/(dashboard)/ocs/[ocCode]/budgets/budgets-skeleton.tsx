import { Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TableSkeleton } from "@/components/shared/table-skeleton";

// Everything on this page except the cell values is fixed: the search box,
// the all / approved / draft filter chips, the Create button, and the six
// column headings. All of it renders for real, disabled, and only the cells
// shimmer.
//
// Mirrors budget-page-content.tsx.

const FILTERS = ["all", "approved", "draft"] as const;

export function BudgetsSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[16rem]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            disabled
            placeholder="Search by financial year or description"
            className="pl-9 h-9 text-sm"
          />
        </div>
        <div className="flex gap-1 rounded-md border border-border p-0.5 bg-card">
          {FILTERS.map((s, i) => (
            <span
              key={s}
              className={`flex h-7 items-center rounded-sm px-3 text-xs font-medium capitalize ${
                i === 0 ? "bg-primary text-primary-foreground" : "text-muted-foreground"
              }`}
            >
              {s}
            </span>
          ))}
        </div>
        <Button size="sm" disabled>
          <Plus className="mr-2 h-3.5 w-3.5" />
          Create budget
        </Button>
      </div>

      <TableSkeleton
        rows={5}
        columns={[
          { label: "Financial Year", cell: "w-20" },
          { label: "Status", pill: true },
          { label: "Description", cell: "w-56" },
          { label: "Admin", cell: "w-16", align: "right" },
          { label: "Maintenance", cell: "w-16", align: "right" },
          { label: "Other", cell: "w-16", align: "right" },
        ]}
      />
    </div>
  );
}
