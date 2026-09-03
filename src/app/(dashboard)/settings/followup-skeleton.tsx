import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// The ONE follow-up skeleton. Both the route boundary (loading.tsx) and the
// client render this exact component, so arriving at the page shows a single
// continuous shimmer rather than a boundary skeleton, then a spinner, then
// the content , three different loading states for one wait.
export function FollowupSkeleton() {
  return (
    <div className="space-y-4">
      {/* Merge-field palette */}
      <div className="rounded-md border border-border bg-card px-3 py-2.5">
        <Skeleton className="mb-2 h-3 w-64" />
        <div className="flex flex-wrap gap-1.5">
          {[16, 20, 14, 18, 22].map((w, i) => (
            <Skeleton key={i} className="h-6 rounded-full" style={{ width: `${w * 4}px` }} />
          ))}
        </div>
      </div>

      {/* Step cards */}
      {Array.from({ length: 3 }).map((_, i) => (
        <Card key={i}>
          <CardContent className="space-y-3 pt-5">
            <div className="flex items-center justify-between gap-3">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-5 w-9 rounded-full" />
            </div>
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-9 w-28 rounded-md" />
            </div>
            <Skeleton className="h-9 w-full rounded-md" />
            <Skeleton className="h-24 w-full rounded-md" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
