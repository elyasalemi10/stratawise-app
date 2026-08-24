import { ChevronLeft, ChevronRight, Landmark, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TableSkeleton } from "@/components/shared/table-skeleton";

// Mirrors bank-accounts-list.tsx.
//
// The page is not a bare table: it is a tab strip of accounts above a card
// holding the two action buttons, a three-up Fund / BSB / Account number
// block, a month stepper, and only THEN the transactions table. The previous
// skeleton rendered the table alone, so the whole frame appeared out of
// nowhere when the data landed.
//
// Everything fixed renders for real, disabled: both buttons, all three field
// labels, the stepper chevrons, the four column headings. Only the account
// names, the field values, the month label and the cells shimmer.

export function BankAccountsSkeleton() {
  return (
    <div className="space-y-4">
      {/* Account tab strip. One tab is a reasonable guess for the common
          case; a second OC account slides in without moving anything else. */}
      <div className="flex w-full flex-wrap justify-start gap-0 border-b border-border">
        <span className="relative flex h-11 min-w-[6.5rem] items-center gap-2 px-4 text-sm font-medium text-foreground after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-[color:var(--brand-gold)]">
          <Landmark className="h-4 w-4 shrink-0 text-muted-foreground" />
          <Skeleton className="h-3.5 w-24" />
        </span>
      </div>

      <div className="space-y-5 rounded-md border border-border bg-card p-5">
        <div className="flex items-center justify-end gap-2">
          <Button variant="secondary" disabled className="text-destructive">
            <Trash2 className="mr-1.5 h-3.5 w-3.5" />
            Delete account
          </Button>
          <Button disabled>
            <Upload className="mr-1.5 h-3.5 w-3.5" />
            Import CSV
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-3 border-t border-border pt-4 sm:grid-cols-3">
          {["Fund", "BSB", "Account number"].map((label) => (
            <div key={label}>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {label}
              </p>
              <Skeleton className="mt-1.5 h-3.5 w-28" />
            </div>
          ))}
        </div>

        <div className="border-t border-border pt-4">
          <div className="mb-4 flex items-center justify-center gap-2">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground">
              <ChevronLeft className="h-5 w-5" />
            </span>
            <span className="flex min-w-[12rem] justify-center">
              <Skeleton className="h-6 w-36" />
            </span>
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground">
              <ChevronRight className="h-5 w-5" />
            </span>
          </div>

          <TableSkeleton
            rows={6}
            columns={[
              { label: "Date", cell: "w-16" },
              { label: "Description", cell: "w-56" },
              { label: "Amount", cell: "w-16", align: "right" },
              { label: "Balance", cell: "w-20", align: "right" },
            ]}
          />
        </div>
      </div>
    </div>
  );
}
