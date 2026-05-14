import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function PaymentClaimsLoading() {
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Pending claims submitted by lot owners. Review actions land in PP5-D.
      </p>

      <Card>
        <CardContent className="p-0">
          <div className="divide-y divide-border">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="p-5 flex items-start justify-between gap-4">
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-72" />
                </div>
                <Skeleton className="h-6 w-28 rounded-full" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
