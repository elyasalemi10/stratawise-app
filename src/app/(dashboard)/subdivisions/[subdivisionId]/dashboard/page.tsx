import Link from "next/link";
import { Building2, DollarSign, AlertTriangle, Users, ArrowRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getSubdivision, getSubdivisionStats } from "@/lib/actions/subdivision";

interface KPICardProps {
  label: string;
  value: string;
  description: string;
  icon: React.ReactNode;
}

function KPICard({ label, value, description, icon }: KPICardProps) {
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {label}
            </p>
            <p className="mt-2 text-2xl font-bold tabular-nums text-foreground">
              {value}
            </p>
          </div>
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
            {icon}
          </div>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}

export default async function SubdivisionDashboardPage({
  params,
}: {
  params: Promise<{ subdivisionId: string }>;
}) {
  const { subdivisionId } = await params;
  const subdivision = await getSubdivision(subdivisionId);

  // If setup is incomplete, show continue setup prompt
  if (subdivision && (subdivision.setup_step ?? 0) < 5) {
    const step = (subdivision.setup_step ?? 0) + 1;
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Building2 className="h-12 w-12 text-muted-foreground/30" />
        <p className="mt-4 text-base font-medium text-foreground">
          Setup incomplete
        </p>
        <p className="mt-1 text-sm text-muted-foreground max-w-sm">
          This subdivision hasn&apos;t finished setup yet. Continue from where you left off.
        </p>
        <Link href={`/subdivisions/new?step=${step}&id=${subdivisionId}`}>
          <Button className="mt-4">
            Continue setup
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </Link>
      </div>
    );
  }

  const stats = await getSubdivisionStats(subdivisionId);

  const formatCurrency = (n: number) =>
    new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n);

  return (
    <div className="space-y-6">
      {/* KPI cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KPICard
          label="Total lots"
          value={String(stats.totalLots)}
          description={`${stats.totalMembers} member${stats.totalMembers !== 1 ? "s" : ""} assigned`}
          icon={<Building2 className="h-5 w-5" />}
        />
        <KPICard
          label="Members"
          value={String(stats.totalMembers)}
          description="Active lot owners and managers"
          icon={<Users className="h-5 w-5" />}
        />
        <KPICard
          label="Total levied"
          value={formatCurrency(stats.totalLevied)}
          description="All issued levies"
          icon={<DollarSign className="h-5 w-5" />}
        />
        <KPICard
          label="Outstanding"
          value={formatCurrency(stats.outstanding)}
          description={stats.outstanding > 0 ? "Amount pending collection" : "No outstanding amounts"}
          icon={<AlertTriangle className="h-5 w-5" />}
        />
      </div>

      {/* Placeholder for future sections */}
      <Card>
        <CardContent className="flex items-center justify-center py-16">
          <p className="text-sm text-muted-foreground">
            Levies, meetings, and activity will appear here as you build out this subdivision.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
