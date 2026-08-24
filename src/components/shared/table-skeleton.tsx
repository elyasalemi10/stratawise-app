import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// Loading state for a table page.
//
// Column headings are FIXED, so they render as real text. The server only
// decides the cell values, so the cells are the only thing that shimmers.
// A skeleton that greys out its own headings makes the page look like it is
// assembling itself from nothing, and the headings visibly swap when the
// real table arrives.
//
// Pass the same labels, in the same order and with the same alignment, as
// the real table. If they drift the columns jump on hydration.

export interface SkeletonColumn {
  /** Exact heading text from the real table. */
  label: string;
  /** Tailwind width for the shimmer in this column's cells. Vary these:
   *  uniform bars read as a grid, not as data. */
  cell?: string;
  /** Set for numeric / action columns the real table right-aligns. */
  align?: "right";
  /** Render the cell shimmer as a pill, for status and badge columns. */
  pill?: boolean;
}

export function TableSkeleton({
  columns,
  rows = 6,
}: {
  columns: SkeletonColumn[];
  rows?: number;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <Table variant="striped">
        <TableHeader>
          <TableRow>
            {columns.map((c) => (
              <TableHead key={c.label} className={c.align === "right" ? "text-right" : undefined}>
                {c.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: rows }).map((_, i) => (
            <TableRow key={i}>
              {columns.map((c) => (
                // Right-aligned cells align their shimmer with ml-auto, NOT
                // by making the cell a flex container. `display:flex` on a
                // <td> takes it out of the table layout algorithm, so a run
                // of right-aligned columns stops claiming its own width and
                // the shimmers pile up in the first one. Three money columns
                // in a row (Operating / Maintenance / Other) rendered as
                // three pills stacked in Operating.
                <TableCell
                  key={c.label}
                  className={c.align === "right" ? "text-right" : undefined}
                >
                  <Skeleton
                    className={cn(
                      c.pill ? "h-5 w-20 rounded-full" : `h-3.5 ${c.cell ?? "w-24"}`,
                      c.align === "right" && "ml-auto",
                    )}
                  />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
