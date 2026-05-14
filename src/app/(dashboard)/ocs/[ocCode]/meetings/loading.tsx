import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

export default function MeetingsLoading() {
  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16">
          <Skeleton className="h-12 w-12 rounded-md" />
          <Skeleton className="mt-4 h-4 w-32" />
          <Skeleton className="mt-2 h-3 w-56" />
        </CardContent>
      </Card>
    </div>
  );
}
