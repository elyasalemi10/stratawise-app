import { TableSkeleton } from "@/components/shared/table-skeleton";

// Column headings are fixed, so they render as real text; only the cells
// shimmer. Keep these labels in step with the real table or the columns
// jump when the data arrives.
export default function AdminFirmsLoading() {
  return (
    <div className="space-y-6">
      <TableSkeleton
        columns={[
          { label: "Owners corporation", cell: "w-40" },
          { label: "Plan", cell: "w-12" },
          { label: "Lots", cell: "w-12", align: "right" },
          { label: "Tier", pill: true },
          { label: "Status", pill: true },
        ]}
      />
    </div>
  );
}
