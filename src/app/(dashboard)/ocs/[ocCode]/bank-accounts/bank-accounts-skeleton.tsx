"use client";

import { Landmark, Upload } from "lucide-react";
import { OCPageTitle } from "@/components/shared/page-title";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

// Mirrors bank-accounts-list.tsx: a tab strip of accounts, a card holding
// the Fund / BSB / Account number block alongside the actions, then the
// statement, which is one table from the newest line to the oldest.
//
// Everything fixed renders for real: the page title, the Import button, the
// three field labels and all four column headings. Only the account name,
// the field values and the lines shimmer.

export function BankAccountsSkeleton() {
  return (
    <div className="space-y-6">
      <OCPageTitle page="Bank accounts" />

      {/* One tab is the common case; a second OC account slides in without
          moving anything else. */}
      <div className="space-y-4">
        <div className="flex w-full flex-wrap justify-start gap-0 border-b border-border">
          <span className="relative flex h-11 min-w-[6.5rem] items-center gap-2 px-4 text-sm font-medium text-foreground after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-[color:var(--brand-gold)]">
            <Landmark className="h-4 w-4 shrink-0 text-muted-foreground" />
            <Skeleton className="h-3.5 w-24" />
          </span>
        </div>

        <div className="flex flex-wrap items-start justify-between gap-4 rounded-md border border-border bg-card p-5">
          <div className="grid min-w-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-3">
            {["Fund", "BSB", "Account number"].map((label) => (
              <div key={label}>
                <p className="text-xs font-medium tracking-normal text-muted-foreground">
                  {label}
                </p>
                <Skeleton className="mt-1.5 h-3.5 w-28" />
              </div>
            ))}
          </div>
          <Button disabled>
            <Upload className="mr-1.5 h-3.5 w-3.5" />
            Import CSV
          </Button>
        </div>

        {/* The statement. Column headings are ours, so they render; only
            the lines shimmer. */}
        <div className="overflow-hidden rounded-md border border-border bg-card">
          <div className="grid grid-cols-[6.5rem_minmax(0,1fr)_10rem_7.5rem] items-center gap-3 border-b border-border bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground">
            <span>Date</span>
            <span>Description</span>
            <span>Entity</span>
            <span className="text-right">Amount</span>
          </div>
          {Array.from({ length: 10 }).map((_, i) => (
            <div
              key={i}
              className="grid grid-cols-[6.5rem_minmax(0,1fr)_10rem_7.5rem] items-center gap-3 border-b border-border px-4 py-2 last:border-b-0"
            >
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-3.5 w-56 max-w-full" />
              <Skeleton className="h-4 w-20 rounded-full" />
              <Skeleton className="ml-auto h-3.5 w-16" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
