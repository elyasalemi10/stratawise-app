import { MoreVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// Mirrors lot-detail-content.tsx.
//
// The old version was a boxed header over three generic cards, which is not
// the page: the identity header is not a card any more, the tab strip was
// missing entirely, and the body is a two-column Overview, so the loading
// state re-flowed into something else the moment the data arrived.
//
// Everything the app already knows renders for real: the tab labels, the
// "More actions" button, the divider, and the "Owes:" / "Last payment"
// captions. Those are fixed strings, not server values, and shimmering them
// would be pretending we do not know our own page.

const TABS = ["Overview", "Owner", "Levies", "Communications", "Documents", "History"];

export function LotDetailSkeleton() {
  return (
    <div className="space-y-6">
      {/* Identity header. Not a card, matching the page. */}
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            {/* "Lot 12 · Unit 3A , Jane Smith" */}
            <Skeleton className="h-8 w-80" />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Skeleton className="h-5 w-24 rounded-full" />
              <Skeleton className="h-4 w-44" />
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="secondary" size="sm" disabled>
              <MoreVertical className="mr-1.5 h-3.5 w-3.5" />
              More actions
            </Button>
          </div>
        </div>

        <div className="border-t border-border" />

        {/* The balance strip. Captions are ours; only the figures shimmer. */}
        <div className="flex flex-wrap items-baseline gap-x-8 gap-y-2 text-base">
          <div className="inline-flex items-baseline gap-2">
            <span className="text-muted-foreground">Balance:</span>
            <Skeleton className="h-6 w-24" />
          </div>
          <div className="inline-flex items-baseline gap-2">
            <span className="text-muted-foreground">Last payment:</span>
            <Skeleton className="h-6 w-28" />
          </div>
        </div>
      </div>

      {/* Tab strip, rendered for real. The labels never depend on the lot. */}
      <div className="flex w-full flex-wrap items-center gap-0">
        {TABS.map((label, i) => (
          <span
            key={label}
            className={
              "relative flex h-11 min-w-[6.5rem] items-center justify-center px-4 text-sm font-medium " +
              (i === 0
                ? "text-foreground after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-[color:var(--brand-gold)]"
                : "text-muted-foreground")
            }
          >
            {label}
          </span>
        ))}
      </div>

      {/* Overview body: two columns of key/value cards. */}
      <div className="grid gap-4 lg:grid-cols-2">
        {[0, 1].map((col) => (
          <Card key={col}>
            <CardContent className="space-y-3 pt-5">
              <Skeleton className="h-4 w-32" />
              {[0, 1, 2, 3].map((row) => (
                <div key={row} className="flex items-center justify-between gap-4">
                  <Skeleton className="h-3 w-28" />
                  <Skeleton className="h-3 w-24" />
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
