import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

// No shimmer here on purpose.
//
// Everything visible on first paint is fixed: the "Reports" heading, the
// "Report type" label, and the picker. The nine report types are a hardcoded
// REPORTS array in reports-content.tsx, and the server data (the lot list)
// only fills a secondary dropdown that appears after you have chosen a
// report. There is no page of content arriving, so a skeleton would be
// animating a wait that produces nothing visible.
//
// Mirrors reports-content.tsx.

export default function ReportsLoading() {
  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold text-foreground">Reports</h1>

      <Card>
        <CardContent className="pt-5">
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1.5 flex-1 min-w-[200px]">
              <Label>Report type</Label>
              <div className="flex h-9 w-full items-center rounded-md border border-border bg-card px-3 text-sm text-muted-foreground">
                Select a report...
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
