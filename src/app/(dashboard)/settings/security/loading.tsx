import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// Field labels are fixed; only the values load.
export default function Loading() {
  return (
    <Card>
      <CardContent className="space-y-4 pt-5">
        <div key="Password" className="space-y-1.5">
          <p className="text-sm text-muted-foreground">Password</p>
          <Skeleton className="h-9 w-full rounded-md" />
        </div>
        <div key="Two-factor authentication" className="space-y-1.5">
          <p className="text-sm text-muted-foreground">Two-factor authentication</p>
          <Skeleton className="h-9 w-full rounded-md" />
        </div>
        <div key="Active sessions" className="space-y-1.5">
          <p className="text-sm text-muted-foreground">Active sessions</p>
          <Skeleton className="h-9 w-full rounded-md" />
        </div>
      </CardContent>
    </Card>
  );
}
