import { Building2, DollarSign, AlertTriangle, Users } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

// Loading state for the OC overview.
//
// Only the numbers come from the server. The KPI labels, their icons, and
// two of the four descriptions are fixed strings in page.tsx, so they render
// for real. The two descriptions that ARE derived ("N members assigned",
// and the outstanding-amount wording, which changes on whether the balance
// is zero) shimmer, because the width genuinely varies.
//
// The card at the bottom is entirely static copy. It used to shimmer a
// 288px bar, which meant the page announced it was loading something it
// already knew.
//
// Mirrors ocs/[ocCode]/page.tsx, manager view.

function KpiSkeleton({
  label,
  icon,
  description,
}: {
  label: string;
  icon: React.ReactNode;
  /** Fixed copy renders as text; omit it when the real value is derived. */
  description?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium tracking-normal text-muted-foreground">
              {label}
            </p>
            <Skeleton className="mt-2 h-7 w-24" />
          </div>
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
            {icon}
          </div>
        </div>
        {description ? (
          <p className="mt-3 text-xs text-muted-foreground">{description}</p>
        ) : (
          <Skeleton className="mt-3 h-3 w-32" />
        )}
      </CardContent>
    </Card>
  );
}

export function OCOverviewSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiSkeleton label="Total lots" icon={<Building2 className="h-5 w-5" />} />
        <KpiSkeleton
          label="Collected"
          icon={<Users className="h-5 w-5" />}
        />
        <KpiSkeleton
          label="Total levied"
          icon={<DollarSign className="h-5 w-5" />}
        />
        <KpiSkeleton label="Outstanding" icon={<AlertTriangle className="h-5 w-5" />} />
      </div>

      <Card>
        <CardContent className="flex items-center justify-center py-16">
          <p className="text-sm text-muted-foreground">
            Levies, meetings, and activity will appear here as you build out this OC.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
