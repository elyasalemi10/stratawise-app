import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

export default function PastLotLoading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-4 w-24" />

      <div className="space-y-2">
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-3 w-72" />
      </div>

      <Card>
        <CardContent className="pt-5 space-y-3">
          <Skeleton className="h-4 w-24" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="space-y-1.5">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-5 w-28" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {[0, 1, 2].map((i) => (
        <Card key={i}>
          <CardContent className="pt-5">
            <div className="flex items-center justify-between mb-3">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-24" />
            </div>
            {Array.from({ length: 3 }).map((_, j) => (
              <div key={j} className="flex justify-between border-b border-border last:border-b-0 py-3">
                <div className="space-y-1.5">
                  <Skeleton className="h-3 w-40" />
                  <Skeleton className="h-3 w-28" />
                </div>
                <Skeleton className="h-3 w-20" />
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
