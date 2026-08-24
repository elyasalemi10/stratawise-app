import { TableSkeleton } from "@/components/shared/table-skeleton";

// Column headings are fixed, so they render as real text; only the cells
// shimmer. Keep these labels in step with the real table.
export function FundsSkeleton() {
  return (
    <div className="space-y-6">
      <TableSkeleton
        columns={[
          { label: "Fund", cell: "w-40" },
          { label: "Kind", pill: true },
          { label: "Lots", cell: "w-12" },
          { label: "Accounts", cell: "w-12" },
          { label: "Balance", cell: "w-16", align: "right" },
        ]}
      />
    </div>
  );
}
