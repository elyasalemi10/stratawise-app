import { Building2, DollarSign, Users } from "lucide-react";
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
            <Skeleton className="mt-2 h-7 w-12" />
          </div>
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function LotDetailLoading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-4 w-16" />
      <div className="flex items-center gap-3">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-5 w-20 rounded-full" />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KPICardSkeleton label="Lot number" icon={<Building2 className="h-5 w-5" />} />
        <KPICardSkeleton label="Entitlement" icon={<Users className="h-5 w-5" />} />
        <KPICardSkeleton label="Balance" icon={<DollarSign className="h-5 w-5" />} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {[0, 1].map((i) => (
          <Card key={i}>
            <CardContent className="pt-5 space-y-3">
              <Skeleton className="h-4 w-24" />
              {Array.from({ length: 4 }).map((_, j) => (
                <div key={j} className="flex justify-between py-2">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-3 w-28" />
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
