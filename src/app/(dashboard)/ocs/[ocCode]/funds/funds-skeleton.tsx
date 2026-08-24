import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TableSkeleton } from "@/components/shared/table-skeleton";

// Mirrors funds-client.tsx. "Create fund" is fixed, so it renders for real.
export function FundsSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" disabled>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Create fund
        </Button>
      </div>

      <TableSkeleton
        rows={4}
        columns={[
          { label: "Fund", cell: "w-36" },
          { label: "Kind", pill: true },
          { label: "Lots", cell: "w-8", align: "right" },
          { label: "Accounts", cell: "w-8", align: "right" },
          { label: "Balance", cell: "w-20", align: "right" },
        ]}
      />
    </div>
  );
}
