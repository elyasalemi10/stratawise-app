"use client";

import { Plus } from "lucide-react";
import { OCPageTitle } from "@/components/shared/page-title";
import { Button } from "@/components/ui/button";
import { TableSkeleton } from "@/components/shared/table-skeleton";

// Mirrors levies-client.tsx. "Generate levies" is fixed, so it renders for
// real; only the batch rows are server data.

export function LeviesSkeleton() {
  return (
    <div className="space-y-4">
      <OCPageTitle page="Levies" />
      <div className="flex justify-end">
        <Button size="sm" disabled>
          <Plus className="mr-2 h-3.5 w-3.5" />
          Generate levies
        </Button>
      </div>

      <TableSkeleton
        rows={5}
        columns={[
          { label: "Type", cell: "w-16" },
          { label: "Financial Year", cell: "w-28" },
          { label: "Operating", cell: "w-16", align: "right" },
          { label: "Other", cell: "w-12", align: "right" },
          { label: "Due date", cell: "w-24" },
          { label: "Status", pill: true },
        ]}
      />
    </div>
  );
}
