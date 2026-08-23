import { MoreVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// Loading state for the lot detail page.
//
// The eight tab labels are a hardcoded TABS array in lot-detail-content.tsx
// and the "More actions" button is fixed, so all nine render for real. Only
// the lot heading (it carries the lot number, unit and owner) and the card
// contents come from the server.
//
// The tab strip was previously nine grey bars, which is a lot of shimmer
// standing in for text the app already knows.
//
// Mirrors lot-detail-content.tsx. Keep TABS in step.

const TABS = [
  "Overview",
  "Owner",
  "Tenancy",
  "Ledger",
  "Levies",
  "Communications",
  "Documents",
  "History",
];

export default function LotDetailLoading() {
  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-5 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <Skeleton className="h-8 w-72" />
            <Button variant="secondary" size="sm" disabled>
              <MoreVertical className="mr-1.5 h-3.5 w-3.5" />
              More actions
            </Button>
          </div>
          <div className="flex flex-wrap gap-6">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-48" />
          </div>
        </CardContent>
      </Card>

      {/* Tab strip, real labels. Overview is the default tab, so it carries
          the gold underline exactly as the live strip does. */}
      <div className="flex w-full flex-wrap justify-start gap-0">
        {TABS.map((label, i) => (
          <span
            key={label}
            className={`relative flex h-11 min-w-[6.5rem] items-center justify-center px-4 text-sm font-medium ${
              i === 0
                ? "text-foreground after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-[color:var(--brand-gold)]"
                : "text-muted-foreground"
            }`}
          >
            {label}
          </span>
        ))}
      </div>

      <Card>
        <CardContent className="pt-5 space-y-3">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-3 w-2/3" />
          <Skeleton className="h-3 w-1/2" />
          <Skeleton className="h-3 w-3/5" />
        </CardContent>
      </Card>
    </div>
  );
}
