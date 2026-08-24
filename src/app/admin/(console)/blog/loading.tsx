import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TableSkeleton } from "@/components/shared/table-skeleton";

// Mirrors the blog list. Only the rows are server data.
export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button size="sm" disabled>
          <Plus className="mr-2 h-3.5 w-3.5" />
          New post
        </Button>
      </div>

      <TableSkeleton
        columns={[
          { label: "Title", cell: "w-56" },
          { label: "Status", pill: true },
          { label: "Updated", cell: "w-24" },
        ]}
      />
    </div>
  );
}
