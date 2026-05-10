import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function MyArrearsLoading() {
  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold text-foreground">My arrears</h1>

      {/* KPI skeleton (mirrors loaded layout: icon + label + value) */}
      <Card>
        <CardContent className="pt-5">
          <div className="flex items-center gap-3">
            <Skeleton className="h-9 w-9 rounded-md" />
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Outstanding amount
              </p>
              <Skeleton className="mt-0.5 h-7 w-32" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Levy list skeleton — 3 rows mirroring the parent + nested
          penalty layout. Static structure (icons, labels) preserved
          per CLAUDE.md design rule; only dynamic values shimmer. */}
      <Card>
        <CardContent className="pt-5 px-0">
          <div className="divide-y divide-border/50">
            {[0, 1, 2].map((i) => (
              <div key={i} className="px-5 py-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3 w-56" />
                  </div>
                  <div className="text-right shrink-0 space-y-1.5">
                    <Skeleton className="h-4 w-20 ml-auto" />
                    <Skeleton className="h-3 w-28 ml-auto" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
