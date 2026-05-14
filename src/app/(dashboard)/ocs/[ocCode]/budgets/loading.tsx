import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

export default function BudgetsLoading() {
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Skeleton className="h-8 w-28 rounded-md" />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {[0, 1].map((i) => (
          <Card key={i}>
            <CardContent className="pt-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <Skeleton className="h-4 w-36" />
                  <Skeleton className="mt-1.5 h-3 w-20" />
                </div>
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
              <div className="rounded-lg border border-border overflow-hidden">
                <div className="bg-muted/50 px-4 py-2.5 flex justify-between">
                  <Skeleton className="h-3 w-12" />
                  <Skeleton className="h-3 w-14" />
                </div>
                {[0, 1, 2, 3].map((j) => (
                  <div key={j} className="px-4 py-2.5 flex justify-between border-t border-border/50">
                    <Skeleton className="h-3 w-28" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                ))}
                <div className="px-4 py-3 flex justify-between border-t-2 border-foreground/20">
                  <Skeleton className="h-3.5 w-12" />
                  <Skeleton className="h-3.5 w-20" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
