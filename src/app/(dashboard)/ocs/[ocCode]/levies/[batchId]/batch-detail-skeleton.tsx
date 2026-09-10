import { ChevronDown } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// Mirrors batch-detail-content.tsx.
//
// The batch is a header (period, fund badge, status badge, actions) above a
// card holding one collapsible row per lot and a total across the bottom.
// The previous version had the rows on the bare page with no card and no
// total, so the whole frame arrived out of nowhere when the data landed, and
// it drew two shimmering buttons where there is now one button and a menu.
//
// Everything the app already knows renders for real: the "Actions" trigger
// and its chevron, each row's chevron, and the word Total. The period label,
// the badges, the lots, the amounts and the total figure are all server
// values, so they shimmer.

export function BatchDetailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-2">
          <Skeleton className="h-6 w-44" />
          <Skeleton className="h-5 w-24 rounded-full" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* "Send by email (N)" carries a count, so it shimmers whole; the
              menu next to it is the same on every batch. */}
          <Skeleton className="h-8 w-36 rounded-md" />
          <span className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-border bg-card px-3 text-sm font-medium text-muted-foreground">
            Actions
            <ChevronDown className="size-3.5" />
          </span>
        </div>
      </div>

      <Card>
        <CardContent className="pt-5">
          <div className="overflow-hidden rounded-lg border border-border">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center justify-between border-t border-border/50 px-4 py-3 first:border-t-0"
              >
                <div className="flex items-center gap-3">
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  <Skeleton className="h-3.5 w-24" />
                  <Skeleton className="h-3.5 w-36" />
                  <Skeleton className="h-3 w-20" />
                </div>
                <div className="flex items-center gap-3">
                  <Skeleton className="h-3.5 w-16" />
                  <Skeleton className="h-5 w-16 rounded-full" />
                </div>
              </div>
            ))}
            <div className="flex items-center justify-between border-t-2 border-foreground/20 px-4 py-3 text-sm">
              <span className="font-semibold text-foreground">Total</span>
              <Skeleton className="h-4 w-24" />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
