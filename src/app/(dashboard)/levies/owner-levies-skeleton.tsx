import { FileText } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { KpiSkeleton } from "@/components/shared/kpi-skeleton";

// Mirrors owner-levies-client.tsx.
//
// The three summary labels are fixed, so only the figures shimmer. Below
// them the real page is a card of levy rows, each an icon tile, a reference,
// a meta line, an amount and a status pill. The skeleton stopped at the
// summary cards, so the whole list appeared from nothing.

export function OwnerLeviesSkeleton() {
  return (
    <div className="space-y-6">
      <KpiSkeleton labels={["Total levied", "Total paid", "Outstanding"]} columns={3} />

      <Card>
        <CardContent className="pt-5">
          <div className="divide-y divide-border">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between py-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <FileText className="h-4 w-4" />
                  </div>
                  <div>
                    <Skeleton className="h-3.5 w-32" />
                    <Skeleton className="mt-1.5 h-3 w-52" />
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <Skeleton className="h-3.5 w-20" />
                  <Skeleton className="h-5 w-16 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
