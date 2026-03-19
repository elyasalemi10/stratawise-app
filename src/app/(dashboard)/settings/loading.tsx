import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

export default function SettingsLoading() {
  return (
    <div className="space-y-6">
      {/* Tab bar skeleton */}
      <div className="flex gap-4 border-b border-border pb-2">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-4 w-24" />
      </div>

      {/* Form skeleton */}
      <Card>
        <CardContent className="pt-5 space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-9 w-full rounded-md" />
            </div>
          ))}
          <Skeleton className="h-9 w-24 rounded-md mt-2" />
        </CardContent>
      </Card>
    </div>
  );
}
