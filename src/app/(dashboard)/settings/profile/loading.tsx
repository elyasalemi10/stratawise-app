import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// Field labels are fixed; only the values load.
export default function Loading() {
  return (
    <Card>
      <CardContent className="space-y-4 pt-5">
        <div key="First name" className="space-y-1.5">
          <p className="text-sm text-muted-foreground">First name</p>
          <Skeleton className="h-9 w-full rounded-md" />
        </div>
        <div key="Last name" className="space-y-1.5">
          <p className="text-sm text-muted-foreground">Last name</p>
          <Skeleton className="h-9 w-full rounded-md" />
        </div>
        <div key="Email" className="space-y-1.5">
          <p className="text-sm text-muted-foreground">Email</p>
          <Skeleton className="h-9 w-full rounded-md" />
        </div>
        <div key="Phone" className="space-y-1.5">
          <p className="text-sm text-muted-foreground">Phone</p>
          <Skeleton className="h-9 w-full rounded-md" />
        </div>
      </CardContent>
    </Card>
  );
}
