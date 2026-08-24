import { TableSkeleton } from "@/components/shared/table-skeleton";

// Column headings are fixed, so they render as real text; only the cells
// shimmer. Keep these labels in step with the real table or the columns
// jump when the data arrives.
export function LeviesSkeleton() {
  return (
    <div className="space-y-6">
      <TableSkeleton
        columns={[
          { label: "Type", pill: true },
          { label: "Financial Year", cell: "w-24" },
          { label: "Operating", cell: "w-16", align: "right" },
          { label: "Maintenance", cell: "w-16", align: "right" },
          { label: "Other", cell: "w-12", align: "right" },
          { label: "Due date", cell: "w-24" },
          { label: "Status", pill: true },
        ]}
      />
    </div>
  );
}
