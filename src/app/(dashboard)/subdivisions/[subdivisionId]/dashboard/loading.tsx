import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

export default function SubdivisionDashboardLoading() {
  return (
    <div className="space-y-6">
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

      <Card>
        <CardContent className="py-16">
          <Skeleton className="mx-auto h-4 w-64" />
        </CardContent>
      </Card>
    </div>
  );
}
