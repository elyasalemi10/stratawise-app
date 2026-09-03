import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// Field labels are fixed; only the values load.
export default function Loading() {
  return (
    <Card>
      <CardContent className="space-y-4 pt-5">
        <div key="Mail provider" className="space-y-1.5">
          <p className="text-sm text-muted-foreground">Mail provider</p>
          <Skeleton className="h-9 w-full rounded-md" />
        </div>
        <div key="Sending address" className="space-y-1.5">
          <p className="text-sm text-muted-foreground">Sending address</p>
          <Skeleton className="h-9 w-full rounded-md" />
        </div>
        <div key="Mailbox prefix" className="space-y-1.5">
          <p className="text-sm text-muted-foreground">Mailbox prefix</p>
          <Skeleton className="h-9 w-full rounded-md" />
        </div>
      </CardContent>
    </Card>
  );
}
