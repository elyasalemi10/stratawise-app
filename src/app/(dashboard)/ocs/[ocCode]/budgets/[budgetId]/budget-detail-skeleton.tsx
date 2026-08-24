import { TableSkeleton } from "@/components/shared/table-skeleton";

// Column headings are fixed, so they render as real text; only the cells
// shimmer. Keep these labels in step with the real table or the columns
// jump when the data arrives.
export function BudgetDetailSkeleton() {
  return (
    <div className="space-y-6">
      <TableSkeleton
        columns={[
          { label: "Account code", cell: "w-12" },
          { label: "Name", cell: "w-40" },
          { label: "Fund", pill: true },
          { label: "Paying lots", cell: "w-24" },
          { label: "Annual amount", cell: "w-16" },
        ]}
      />
    </div>
  );
}
