import { Tag as TagIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { TAG_FIELD_SHELL } from "@/components/shared/tag-picker";
import { cn } from "@/lib/utils";

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
      <div className={cn(CARD_CHROME, "justify-end")}>
        <Skeleton className="h-3 w-14" />
      </div>
      {/* Same box as the card's preview: min-h-0 and nothing in flow, so
          the ratio is the only thing setting its height. */}
      <div className="relative block aspect-[4/3] w-full min-h-0 shrink-0 overflow-hidden">
        <Skeleton className="absolute inset-0 h-full w-full rounded-none" />
      </div>
      <div className={CARD_FOOTER}>
        {/* Both are bordered boxes of a known height, so they render as
            boxes. Only what goes in them is unknown, and most cards have
            nothing in them anyway. The note's height is the one-line
            textarea's: 12px of padding, a 16.5px line and 2px of border. */}
        <div className={cn(CARD_NOTE_HEIGHT, "w-full rounded-md border border-border bg-card")} />
        <div className={cn(TAG_FIELD_SHELL, "border border-border bg-card")}>
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

/**
 * The strip above the preview, at a fixed height.
 *
 * It used to be sized by whatever it happened to contain, and what a card
 * contains there is a checkbox on its own plate: 16px of box inside 8px of
 * padding, so 24px. An uploading card has no checkbox, only an 11px date, so
 * its strip came out eleven pixels shorter and the card jumped that far the
 * moment the upload finished and the real one replaced it. h-8 is the plate
 * plus the strip's own top padding, and now nothing inside decides it.
 */
export const CARD_CHROME = "relative flex h-8 shrink-0 items-center px-2 pt-2";

/** The footer under the preview. */
export const CARD_FOOTER = "flex flex-1 flex-col gap-2 border-t border-border p-2";

/** One line of note box: 12px of padding, a 16.5px line, 2px of border. */
export const CARD_NOTE_HEIGHT = "h-[30px]";

/** The upload tile's outer box. */
export const DOCUMENT_DROP_TILE =
  "flex cursor-pointer flex-col overflow-hidden rounded-lg border-2 border-dashed border-border bg-card text-center transition-colors";

/**
 * What goes inside it, so the tile is exactly a card tall.
 *
 * A min-height was a guess at that, and a guess is only right in the rows
 * where a real card happens to be stretching it anyway: on a lot with no
 * documents the tile was alone in its row and came out visibly shorter than
 * the same tile on the library page. Building it out of the card's own three
 * parts, a strip, a 4:3 box and a footer, makes it the right height with
 * nothing to keep in step.
 */
export function DocumentDropTileInner({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className={CARD_CHROME} />
      <div className="relative block aspect-[4/3] w-full min-h-0 shrink-0">
        <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4">
          {children}
        </span>
      </div>
      {/* The footer's exact height, assembled from the same pieces rather
          than added up into a single number that would have to be
          recalculated by hand every time one of them moved. */}
      <div className={cn(CARD_FOOTER, "border-transparent")}>
        <div className={CARD_NOTE_HEIGHT} />
        <div className="h-8" />
      </div>
    </>
  );
}
