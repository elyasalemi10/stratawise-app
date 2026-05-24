import { Building2, Users, Award, Activity } from "lucide-react";
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
            <Skeleton className="mt-2 h-7 w-16" />
          </div>
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function ManageLoading() {
  return (
    <div className="space-y-6">
      {/* Header skeleton , matches manage-content header exactly */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <Skeleton className="h-8 w-40" />
            <Skeleton className="h-5 w-14 rounded-full" />
          </div>
          <Skeleton className="mt-1 h-4 w-72" />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Skeleton className="h-8 w-[68px] rounded-md" />
          <Skeleton className="h-8 w-8 rounded-md" />
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KPICardSkeleton label="OC Tier" icon={<Award className="h-5 w-5" />} />
        <KPICardSkeleton label="Total lots" icon={<Building2 className="h-5 w-5" />} />
        <KPICardSkeleton label="Owners assigned" icon={<Users className="h-5 w-5" />} />
        <KPICardSkeleton label="Status" icon={<Activity className="h-5 w-5" />} />
      </div>

      {/* Tabs skeleton */}
      <div className="flex gap-6 border-b border-border pb-2">
        {["Overview", "Lots & Owners", "Financials", "Meetings", "Documents"].map((t) => (
          <span key={t} className="text-sm text-muted-foreground">{t}</span>
        ))}
      </div>

      {/* Content skeleton */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="pt-5 space-y-3">
            <Skeleton className="h-4 w-24" />
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex justify-between py-2">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-3 w-32" />
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 space-y-3">
            <Skeleton className="h-4 w-32" />
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex justify-between py-2">
                <Skeleton className="h-3 w-28" />
                <Skeleton className="h-3 w-20" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
