import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

export default function MatchDetailLoading() {
  return (
    <div className="px-6 py-6">
      {/* Back link */}
      <div className="flex items-center gap-2 mb-6">
        <Skeleton className="h-8 w-8 rounded-md" />
        <Skeleton className="h-4 w-32" />
      </div>

      {/* Layout: left (40%) | right (60%) */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.5fr] gap-6">
        {/* LEFT PANEL */}
        <div className="space-y-6">
          {/* Transaction card skeleton */}
          <Card className="shadow-none">
            <CardContent className="p-5 space-y-4">
              <div className="flex items-start justify-between">
                <div className="w-full">
                  <Skeleton className="h-3 w-12 mb-2" />
                  <Skeleton className="h-5 w-20" />
                </div>
                <div className="text-right w-full">
                  <Skeleton className="h-3 w-12 mb-2 ml-auto" />
                  <Skeleton className="h-6 w-32 ml-auto" />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="h-5 w-24 rounded-full" />
              </div>

              <div>
                <Skeleton className="h-3 w-20 mb-2" />
                <Skeleton className="h-4 w-40" />
              </div>

              <div>
                <Skeleton className="h-3 w-24 mb-2" />
                <Skeleton className="h-4 w-64" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* RIGHT PANEL */}
        <div className="space-y-6">
          {/* Allocate summary skeleton */}
          <Card className="shadow-none border-l-4 border-l-primary">
            <CardContent className="p-4 space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-24" />
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Allocate form skeleton */}
          <Card className="shadow-none">
            <CardContent className="p-5 space-y-4">
              <Skeleton className="h-4 w-24" />

              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="p-4 border border-border rounded-lg space-y-3">
                  <div>
                    <Skeleton className="h-3 w-12 mb-2" />
                    <Skeleton className="h-9 w-full rounded-md" />
                  </div>
                  <div>
                    <Skeleton className="h-3 w-12 mb-2" />
                    <Skeleton className="h-9 w-full rounded-md" />
                  </div>
                  <div>
                    <Skeleton className="h-3 w-12 mb-2" />
                    <Skeleton className="h-9 w-full rounded-md" />
                  </div>
                  <div>
                    <Skeleton className="h-3 w-20 mb-2" />
                    <Skeleton className="h-9 w-full rounded-md" />
                  </div>
                </div>
              ))}

              <Skeleton className="h-9 w-full rounded-md" />
              <Skeleton className="h-9 w-full rounded-md" />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
