import { TableSkeleton } from "@/components/shared/table-skeleton";

// Column headings are fixed, so they render as real text; only the cells
// shimmer. Keep these labels in step with the real table or the columns
// jump when the data arrives.
export function ContractorsSkeleton() {
  return (
    <div className="space-y-6">
      <TableSkeleton
        columns={[
          { label: "Business", cell: "w-40" },
          { label: "Trade", cell: "w-24" },
          { label: "Primary contact", cell: "w-40" },
          { label: "ABN", cell: "w-24" },
          { label: "GST", pill: true },
          { label: "Public liability expiry", cell: "w-24" },
          { label: "Status", pill: true },
        ]}
      />
    </div>
  );
}
