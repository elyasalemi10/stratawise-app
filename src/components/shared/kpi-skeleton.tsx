import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

// Loading state for a row of KPI cards.
//
// The labels are fixed, so they render as real text and only the numbers
// shimmer. Greying out "Total levied" tells the user nothing they did not
// already know, and it visibly swaps for identical text a moment later.
//
// Pass the same labels, in the same order, as the real page.

export function KpiSkeleton({
  labels,
  columns = 3,
}: {
  labels: string[];
  /** Match the real grid so the cards do not reflow on hydration. */
  columns?: 2 | 3 | 4;
}) {
  const grid =
    columns === 4
      ? "sm:grid-cols-2 lg:grid-cols-4"
      : columns === 2
        ? "sm:grid-cols-2"
        : "sm:grid-cols-3";

  return (
    <div className={`grid grid-cols-1 gap-4 ${grid}`}>
      {labels.map((label) => (
        <Card key={label}>
          <CardContent className="pt-5">
            <p className="text-xs font-medium tracking-normal text-muted-foreground">
              {label}
            </p>
            <Skeleton className="mt-1 h-7 w-28" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
