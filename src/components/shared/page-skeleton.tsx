import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

// Last-resort skeleton, for pages whose shape is genuinely a stack of cards
// and nothing more specific fits.
//
// Prefer a specific one. <TableSkeleton> renders a table's real column
// headings with only the cells shimmering, and <KpiSkeleton> does the same
// for a row of KPI labels. Both look correct because they know what is
// fixed; this one cannot know, so it can only approximate.
//
// showTitle now defaults to FALSE. It used to shimmer a heading on every
// page, but per CLAUDE.md flat list pages deliberately have no H1 (the
// breadcrumb already names the page), so on most routes that bar was
// promising a title that never arrived. Pass showTitle on the detail pages
// that really do render one.

export function PageSkeleton({
  rows = 3,
  showTitle = false,
}: { rows?: number; showTitle?: boolean }) {
  return (
    <div className="space-y-6">
      {showTitle && <Skeleton className="h-6 w-48" />}
      <div className="space-y-4">
        {Array.from({ length: rows }).map((_, i) => (
          <Card key={i}>
            <CardContent className="pt-5 space-y-3">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-3 w-2/3" />
              <Skeleton className="h-3 w-1/2" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
