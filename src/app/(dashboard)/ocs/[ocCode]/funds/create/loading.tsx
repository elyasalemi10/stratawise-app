import { TableSkeleton } from "@/components/shared/table-skeleton";

// Column headings are fixed, so they render as real text; only the cells
// shimmer. Keep these labels in step with the real table or the columns
// jump when the data arrives.
export default function OcsFundsCreateLoading() {
  return (
    <div className="space-y-6">
      <TableSkeleton
        columns={[
          { label: "Lot", cell: "w-12" },
          { label: "Liability for this fund", cell: "w-16", align: "right" },
        ]}
      />
    </div>
  );
}
