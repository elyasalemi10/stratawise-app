import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

// Mirror the loaded layout exactly: one card with the "What kind of levy?"
// label + two side-by-side picker tiles. Avoids the generic PageSkeleton's
// stack of three tall cards, which made the page look like a lot of content
// was loading when in reality it's just a small picker.
export default function Loading() {
  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-5 space-y-3">
          <Skeleton className="h-4 w-40" />
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-md border border-border bg-card p-4 space-y-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3 w-4/5" />
              <Skeleton className="h-3 w-3/5" />
            </div>
            <div className="rounded-md border border-border bg-card p-4 space-y-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3 w-4/5" />
              <Skeleton className="h-3 w-3/5" />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
