import { DollarSign, AlertTriangle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

function KPICardSkeleton({ label, icon }: { label: string; icon: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {label}
            </p>
            <Skeleton className="mt-2 h-7 w-24" />
          </div>
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
            {icon}
          </div>
        </div>
        <Skeleton className="mt-3 h-3 w-32" />
      </CardContent>
    </Card>
  );
}

export default function SubdivisionDashboardLoading() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <KPICardSkeleton label="Total levied" icon={<DollarSign className="h-5 w-5" />} />
        <KPICardSkeleton label="Outstanding" icon={<AlertTriangle className="h-5 w-5" />} />
      </div>

      <Card>
        <CardContent className="pt-5 space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between py-3 border-t border-border first:border-t-0">
              <div className="flex items-center gap-3">
                <Skeleton className="h-9 w-9 rounded-md" />
                <div>
                  <Skeleton className="h-3.5 w-32" />
                  <Skeleton className="mt-1 h-3 w-20" />
                </div>
              </div>
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
