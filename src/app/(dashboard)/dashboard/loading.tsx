import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

export default function DashboardLoading() {
  return (
    <div className="space-y-6">
      {/* KPI cards skeleton */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="pt-5">
              <div className="flex items-start justify-between">
                <div>
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="mt-3 h-7 w-16" />
                </div>
                <Skeleton className="h-9 w-9 rounded-md" />
              </div>
              <Skeleton className="mt-4 h-3 w-28" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Section header skeleton */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-5 w-28" />
        <Skeleton className="h-9 w-40 rounded-md" />
      </div>

      {/* Cards grid skeleton */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="pt-5">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="mt-2 h-3 w-20" />
              <Skeleton className="mt-4 h-3 w-full" />
              <div className="mt-3 border-t border-border pt-3">
                <Skeleton className="h-6 w-8" />
                <Skeleton className="mt-1 h-3 w-12" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
