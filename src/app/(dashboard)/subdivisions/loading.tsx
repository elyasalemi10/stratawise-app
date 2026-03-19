import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

export default function SubdivisionsLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-36" />
        <Skeleton className="h-9 w-44 rounded-md" />
      </div>

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
