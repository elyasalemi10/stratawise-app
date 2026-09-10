import { Hash, MoreVertical } from "lucide-react";
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

const TABS = ["Owner", "Levies", "Communications", "Documents"];

export function LotDetailSkeleton() {
  return (
    <div className="space-y-6">
      {/* Identity header. Not a card, matching the page. */}
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            {/* "Lot 12 · Unit 3A , Jane Smith" */}
            <Skeleton className="h-8 w-80" />
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="secondary" size="sm" disabled>
              <MoreVertical className="mr-1.5 h-3.5 w-3.5" />
              More actions
            </Button>
          </div>
        </div>

        <div className="border-t border-border" />

        {/* The balance strip. The caption is ours; only the figure
            shimmers. Last payment is not here: it renders only when there
            has been one, and a shimmer would promise a figure that may
            never arrive. */}
        <div className="flex flex-wrap items-baseline gap-x-8 gap-y-2 text-base">
          <div className="inline-flex items-baseline gap-2">
            <span className="text-muted-foreground">Balance:</span>
            <Skeleton className="h-6 w-24" />
          </div>
        </div>
      </div>

      {/* Tab strip, rendered for real. The labels never depend on the lot,
          and neither does the navy rule they sit on. */}
      <div className="relative flex w-full flex-wrap items-center gap-0 border-b-2 border-primary">
        {TABS.map((label, i) => (
          <span
            key={label}
            className={
              "relative flex h-11 min-w-[6.5rem] items-center justify-center px-4 text-sm font-medium " +
              (i === 0
                ? "z-10 text-foreground after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-[color:var(--brand-gold)]"
                : "text-muted-foreground")
            }
          >
            {label}
          </span>
        ))}
      </div>

      {/* Owner body: the person, then the lot's own fields. Their contact
          labels and the four lot field labels are ours, so they render. */}
      <div className="space-y-6">
        <Card>
          <CardContent className="space-y-4 pt-5">
            <div className="flex items-start gap-3">
              <Skeleton className="size-11 shrink-0 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-56" />
              </div>
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {["Full name", "Email", "Phone", "Payment reference"].map((label) => (
                <div key={label} className="space-y-1.5">
                  <p className="text-sm font-medium text-foreground">{label}</p>
                  <Skeleton className="h-9 w-full rounded-md" />
                </div>
              ))}
              <div className="space-y-1.5 sm:col-span-2">
                <p className="text-sm font-medium text-foreground">Service address</p>
                <Skeleton className="h-9 w-full rounded-md" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5">
            <div className="mb-3 flex items-center gap-2">
              <Hash className="h-4 w-4 text-[color:var(--brand-gold)]" />
              <h3 className="text-sm font-semibold text-foreground">Lot details</h3>
            </div>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
              {["Lot number", "Unit number", "Entitlement", "Liability"].map((label) => (
                <div key={label}>
                  <dt className="text-xs tracking-normal text-muted-foreground">
                    {label}
                  </dt>
                  <dd className="mt-1">
                    <Skeleton className="h-3.5 w-16" />
                  </dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>

      </div>
    </div>
  );
}
