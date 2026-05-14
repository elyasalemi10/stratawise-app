import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

export default function DocumentsLoading() {
  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-5 space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between py-2 border-b border-border/50 last:border-b-0">
              <div className="flex items-center gap-3">
                <Skeleton className="h-8 w-8 rounded" />
                <div>
                  <Skeleton className="h-3.5 w-40" />
                  <Skeleton className="mt-1 h-3 w-20" />
                </div>
              </div>
              <Skeleton className="h-7 w-20 rounded-md" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
