"use client";

import { Search, Upload } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { OCPageTitle } from "@/components/shared/page-title";

// Loading state for the OC documents library.
//
// Mirrors components/shared/document-manager.tsx, which is now a search bar
// over a three-column grid whose first tile is the upload target. All three
// of those are things the app already knows, so they render for real: the
// heading (the OC name comes from the module-scope map, not a fetch), the
// search box, and the drop tile. Only the document cards shimmer, and they
// shimmer in the shape of a card: a tall preview over a description line and
// a tag row, so the layout does not re-flow when the data lands.
//
// Owned by DocumentsClient, NOT by loading.tsx. Rendering it from both gave
// two mounts of the same skeleton with a blank gap between them.

const TILES = 5;

export function DocumentsSkeleton() {
  return (
    <div className="space-y-6">
      <OCPageTitle page="Documents" />

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input disabled placeholder="Search documents" className="pl-9" />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="flex min-h-[22rem] flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-card p-4 text-center">
          <Upload className="h-7 w-7 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">Add a document</span>
          <span className="text-xs text-muted-foreground">Drop it here, or click to choose</span>
        </div>

        {Array.from({ length: TILES }).map((_, i) => (
          <div key={i} className="overflow-hidden rounded-lg border border-border bg-card">
            <Skeleton className="h-64 w-full rounded-none" />
            <div className="flex flex-col gap-1.5 border-t border-border p-2.5">
              <Skeleton className="h-8 w-full rounded-md" />
              <div className="flex items-center gap-1">
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="h-5 w-12 rounded-full" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
