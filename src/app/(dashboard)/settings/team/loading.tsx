import { TableSkeleton } from "@/components/shared/table-skeleton";

// Column headings are fixed; only the rows load.
export default function Loading() {
  return (
    <TableSkeleton
      rows={4}
      columns={[
        { label: "Member", cell: "w-40" },
        { label: "Email", cell: "w-48" },
        { label: "Role", pill: true },
      ]}
    />
  );
}
