import { TableSkeleton } from "@/components/shared/table-skeleton";

// Column headings are fixed, so they render as real text; only the cells
// shimmer. Keep these labels in step with the real table or the columns
// jump when the data arrives.
export default function OcsBudgetsCreateLoading() {
  return (
    <div className="space-y-6">
      <TableSkeleton
        columns={[
          { label: "Code", cell: "w-12" },
          { label: "Account", cell: "w-40" },
          { label: "Paying lots", cell: "w-24" },
          { label: "Annual amount", cell: "w-16" },
        ]}
      />
    </div>
  );
}
