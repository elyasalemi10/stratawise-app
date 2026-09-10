"use client";

import { Search, Tag as TagIcon, Upload } from "lucide-react";
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
// shimmer in the shape of a card: a square preview over a one-line note box
// and a tag FIELD, so the layout does not re-flow when the data lands. The
// tag row used to be two loose pills, which is what it looked like before
// the tags became a bordered strip like the note box above them.
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
        <div className="flex aspect-square flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-card p-4 text-center">
          <Upload className="h-7 w-7 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">Add a document</span>
          <span className="text-xs text-muted-foreground">Drop it here, or click to choose</span>
        </div>

        {Array.from({ length: TILES }).map((_, i) => (
          <div key={i} className="flex flex-col overflow-hidden rounded-lg border border-border bg-card">
            {/* The chrome strip a card has, carrying its date. */}
            <div className="flex h-9 shrink-0 items-center justify-end px-2">
              <Skeleton className="h-3 w-16" />
            </div>
            <Skeleton className="aspect-square w-full rounded-none" />
            <div className="flex shrink-0 flex-col gap-1.5 border-t border-border p-2.5">
              {/* Both are bordered boxes of a known height, so they render as
                  boxes. Only what goes IN them is unknown, and at this point
                  most cards have nothing in them anyway. */}
              <div className="h-[38px] w-full rounded-md border border-border bg-card" />
              <div className="flex h-9 w-full items-center gap-1.5 rounded-md border border-border bg-card px-2.5">
                <TagIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
                <Skeleton className="h-4 w-20 rounded-full" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
