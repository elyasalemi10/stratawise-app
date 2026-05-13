import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

// Default skeleton for pages that don't need a precise structural mirror.
// Renders a title shimmer + a few full-width card placeholders so users see
// "the page is loading" instantly instead of staring at a blank viewport
// while server data fetches. CLAUDE.md "Snappy navigation" rule: every
// page.tsx that does any server-side data fetching MUST have a sibling
// loading.tsx — use this component when you don't have a more specific one.

export function PageSkeleton({
  rows = 3,
  showTitle = true,
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
