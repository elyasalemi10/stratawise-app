import { TableSkeleton } from "@/components/shared/table-skeleton";

// Column headings are fixed, so they render as real text; only the cells
// shimmer. Keep these labels in step with the real table or the columns
// jump when the data arrives.
export function BankAccountsSkeleton() {
  return (
    <div className="space-y-6">
      <TableSkeleton
        columns={[
          { label: "Date", cell: "w-24" },
          { label: "Description", cell: "w-40" },
          { label: "Amount", cell: "w-16", align: "right" },
          { label: "Balance", cell: "w-16", align: "right" },
        ]}
      />
    </div>
  );
}
