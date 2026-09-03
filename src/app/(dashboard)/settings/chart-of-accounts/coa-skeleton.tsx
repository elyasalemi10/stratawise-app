import { Download, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TableSkeleton } from "@/components/shared/table-skeleton";

// Mirrors chart-of-accounts-content.tsx.
//
// Only the table cells are server data. The code-band legend, the search
// box, both filters, Export CSV and Add account are all fixed, so they
// render for real (inert) instead of shimmering. A skeleton that greys out
// text the app already knows makes the page look like it is assembling
// itself from nothing.

export function ChartOfAccountsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
        <span><strong className="text-foreground">1000s</strong> Assets</span>
        <span><strong className="text-foreground">2000s</strong> Liabilities</span>
        <span><strong className="text-foreground">3000s</strong> Equity</span>
        <span><strong className="text-foreground">4000s</strong> Income</span>
        <span><strong className="text-foreground">5000s &amp; 6000s</strong> Expenses</span>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Input disabled placeholder="Search code or name" className="w-48" />
        <Select disabled>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All types" />
          </SelectTrigger>
        </Select>
        <Select disabled>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Active" />
          </SelectTrigger>
        </Select>
        <Button variant="secondary" disabled>
          <Download className="size-4" />
          Export CSV
        </Button>
        <Button disabled>
          <Plus className="size-4" />
          Add account
        </Button>
      </div>

      <TableSkeleton
        columns={[
          { label: "Code", cell: "w-12" },
          { label: "Name", cell: "w-44" },
          { label: "Type", pill: true },
          { label: "GST treatment", pill: true },
          { label: "Status", pill: true },
        ]}
      />
    </div>
  );
}
