import { MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// Loading state for a past-tenure lot.
//
// "Past tenure", the "Your tenure" heading, its three stat labels and the
// map pin are all fixed copy, so they render for real. Only the OC name,
// the lot line, the address and the three values come from the server.
//
// Mirrors dashboard/past-lots/[lotId]/page.tsx.

function StatSkeleton({ label }: { label: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <Skeleton className="mt-1 h-4 w-24" />
    </div>
  );
}

export function PastLotSkeleton() {
  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-64" />
          <Badge variant="neutral">Past tenure</Badge>
        </div>
        <Skeleton className="mt-2 h-4 w-56" />
        <p className="mt-1 text-xs text-muted-foreground flex items-center gap-1">
          <MapPin className="h-3 w-3" />
          <Skeleton className="h-3 w-64" />
        </p>
      </div>

      <Card>
        <CardContent className="pt-5">
          <h2 className="text-sm font-semibold text-foreground mb-3">Your tenure</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 text-sm">
            <StatSkeleton label="Owned from" />
            <StatSkeleton label="Owned until" />
            <StatSkeleton label="Net paid" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5 space-y-3">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-3 w-2/3" />
          <Skeleton className="h-3 w-1/2" />
        </CardContent>
      </Card>
    </div>
  );
}
