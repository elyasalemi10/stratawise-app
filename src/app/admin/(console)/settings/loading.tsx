import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// Mirrors the platform settings page: cards of label / value rows where the
// labels are fixed and only the values load.
export default function Loading() {
  return (
    <div className="space-y-6">
      {Array.from({ length: 2 }).map((_, i) => (
        <Card key={i}>
          <CardContent className="pt-5">
            {Array.from({ length: 4 }).map((_, j) => (
              <div
                key={j}
                className="flex items-start justify-between border-b border-border/50 py-2.5 last:border-b-0"
              >
                <Skeleton className="h-3.5 w-36" />
                <Skeleton className="h-3.5 w-48" />
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
