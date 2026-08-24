import { ChevronDown } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

// Mirrors batch-detail-content.tsx.
//
// The batch is a header (period, fund badge, status badge, actions) above a
// list of collapsible per-lot rows, NOT a table. The previous skeleton was a
// two-column table that appears nowhere on this page.
//
// The chevron on each row is fixed. Everything else here (period label, the
// two badges, lot lines, amounts) is server data, so it shimmers.

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
          <Skeleton className="h-9 w-28 rounded-md" />
          <Skeleton className="h-9 w-32 rounded-md" />
        </div>
      </div>

      <div className="overflow-hidden rounded-md border border-border bg-card">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center justify-between border-t border-border px-4 py-3 first:border-t-0"
          >
            <div className="flex items-center gap-3">
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
              <Skeleton className="h-3.5 w-28" />
              <Skeleton className="h-3.5 w-36" />
              <Skeleton className="h-3 w-20" />
            </div>
            <div className="flex items-center gap-3">
              <Skeleton className="h-3.5 w-16" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
