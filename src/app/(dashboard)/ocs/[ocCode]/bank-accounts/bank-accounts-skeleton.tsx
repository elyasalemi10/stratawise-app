"use client";

import { Landmark, Upload } from "lucide-react";
import { OCPageTitle } from "@/components/shared/page-title";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

// Mirrors bank-accounts-list.tsx: a tab strip of accounts, a card holding
// the Fund / BSB / Account number block alongside the actions, then the
// statement itself, which is one continuous list broken by month.
//
// Everything fixed renders for real: the page title, the Import button, all
// three field labels, the month header's In and Out captions. Only the
// account name, the field values, the month name and the rows shimmer.

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

        <div className="rounded-md border border-border bg-card">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3 border-b border-border bg-muted px-4 py-2 sm:grid-cols-[minmax(0,1fr)_16rem]">
            <Skeleton className="h-4 w-32" />
            <span className="flex justify-end gap-4 text-xs text-muted-foreground sm:gap-6">
              <span className="flex items-baseline gap-1.5">
                In <Skeleton className="h-3 w-16" />
              </span>
              <span className="flex items-baseline gap-1.5">
                Out <Skeleton className="h-3 w-16" />
              </span>
            </span>
          </div>
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="grid grid-cols-[minmax(0,1fr)_7rem] items-center gap-3 border-b border-l-2 border-l-transparent border-border px-4 py-2.5 last:border-b-0 sm:grid-cols-[4.5rem_minmax(0,1fr)_8rem_8rem]"
            >
              <Skeleton className="hidden h-3 w-12 sm:block" />
              <Skeleton className="h-3.5 w-56 max-w-full" />
              <Skeleton className="ml-auto h-3.5 w-16" />
              <Skeleton className="ml-auto hidden h-3.5 w-20 sm:block" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
