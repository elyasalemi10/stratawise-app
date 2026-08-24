import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue } from "@/components/ui/select";

// No shimmer here on purpose.
//
// Everything visible on first paint is fixed: the "Reports" heading, the
// "Report type" label, and the picker itself. The nine report types are a
// hardcoded REPORTS array in reports-content.tsx, and the server data (the
// lot list) only fills a secondary dropdown that appears after you have
// chosen a report. There is no page of content arriving, so a skeleton would
// be animating a wait that produces nothing visible.
//
// The picker is the real <Select>, disabled, rather than a div dressed up to
// look like one. That way the handover to reports-content.tsx changes one
// thing (the control becomes usable) instead of swapping the element out.
//
// Mirrors reports-content.tsx.

export function ReportsSkeleton() {
  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold text-foreground">Reports</h1>

      <Card>
        <CardContent className="pt-5">
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1.5 flex-1 min-w-[200px]">
              <Label>Report type</Label>
              <Select disabled>
                <SelectTrigger className="h-9 w-full">
                  <SelectValue placeholder="Select a report..." />
                </SelectTrigger>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
