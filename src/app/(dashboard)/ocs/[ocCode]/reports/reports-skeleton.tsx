import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue } from "@/components/ui/select";

// No shimmer here on purpose. Nothing on this page shimmers, because nothing
// on it is server data until you pick a report.
//
// The heading, the "Report type" label, the picker, the Generate button and
// the "select a report" panel are all fixed, so all five render for real. The
// nine report types are a hardcoded REPORTS array in reports-content.tsx; the
// server data (the lot list) only fills a secondary dropdown that appears
// after a report is chosen.
//
// The controls are real components, disabled, rather than divs dressed up to
// look like them, so the handover to reports-content.tsx changes exactly one
// thing: they become usable.
//
// Mirrors reports-content.tsx.

export function ReportsSkeleton() {
  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold text-foreground">Reports</h1>

      <Card>
        <CardContent className="pt-5">
          <div className="flex flex-wrap items-end gap-4">
            <div className="min-w-[200px] flex-1 space-y-1.5">
              <Label>Report type</Label>
              <Select disabled>
                <SelectTrigger className="h-9 w-full">
                  <SelectValue placeholder="Select a report..." />
                </SelectTrigger>
              </Select>
            </div>

            <Button disabled>Generate report</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex items-center justify-center py-16">
          <p className="text-sm text-muted-foreground">
            Select a report type and click generate to preview.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
