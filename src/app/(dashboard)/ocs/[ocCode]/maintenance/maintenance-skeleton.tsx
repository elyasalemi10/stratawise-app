import { TableSkeleton } from "@/components/shared/table-skeleton";

// Column headings are fixed, so they render as real text; only the cells
// shimmer. Keep these labels in step with the real table or the columns
// jump when the data arrives.
export function OCMaintenanceSkeleton() {
  return (
    <div className="space-y-6">
      <TableSkeleton
        columns={[
          { label: "Job", cell: "w-40" },
          { label: "OC", cell: "w-24" },
          { label: "Contractor", cell: "w-40" },
          { label: "Frequency", cell: "w-24" },
          { label: "Next due", cell: "w-24" },
          { label: "Cost / visit", cell: "w-16", align: "right" },
          { label: "Status", pill: true },
        ]}
      />
    </div>
  );
}
