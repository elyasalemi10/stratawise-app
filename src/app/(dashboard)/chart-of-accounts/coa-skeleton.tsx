import { TableSkeleton } from "@/components/shared/table-skeleton";

// Column headings are fixed, so they render as real text; only the cells
// shimmer. Keep these labels in step with the real table or the columns
// jump when the data arrives.
export function ChartOfAccountsSkeleton() {
  return (
    <div className="space-y-6">
      <TableSkeleton
        columns={[
          { label: "Code", cell: "w-12" },
          { label: "Name", cell: "w-40" },
          { label: "Type", pill: true },
          { label: "GST treatment", pill: true },
          { label: "Status", pill: true },
        ]}
      />
    </div>
  );
}
