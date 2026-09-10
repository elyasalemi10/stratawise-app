import { Tag as TagIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * A card's shape, with nothing in it.
 *
 * Kept beside DocumentCard rather than copied into each page's skeleton,
 * because it has to agree with the card down to the pixel: same 4:3 preview,
 * same px-2 pt-2 strip, same p-2 gap-2 footer, same one-line note and
 * min-h-8 tag row. Change one, change the other, or the grid visibly jumps
 * the moment the data lands.
 */
export function DocumentCardSkeleton() {
  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex shrink-0 items-center justify-end px-2 pt-2">
        <Skeleton className="h-3 w-14" />
      </div>
      <Skeleton className="aspect-[4/3] w-full rounded-none" />
      <div className="flex flex-1 flex-col gap-2 border-t border-border p-2">
        {/* Both are bordered boxes of a known height, so they render as
            boxes. Only what goes in them is unknown, and most cards have
            nothing in them anyway. */}
        <div className="h-7 w-full rounded-md border border-border bg-card" />
        <div className="flex min-h-8 w-full items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1.5">
          <TagIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
          <Skeleton className="h-4 w-16 rounded-full" />
        </div>
      </div>
    </div>
  );
}

/** The grid the cards live in. One place, so the page skeleton and the page
 *  itself cannot drift on column count or gap. */
export const DOCUMENT_GRID = "grid grid-cols-2 gap-3 sm:grid-cols-3";
