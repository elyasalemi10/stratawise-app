"use client";

import { useCallback } from "react";
import Link from "next/link";
import {
  Building2,
  DollarSign,
  AlertTriangle,
  Users,
  ArrowRight,
  Home,
} from "lucide-react";
import { formatDateLong } from "@/lib/utils";
import { useCachedData } from "@/lib/use-cached-data";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import {
  getOCOverviewData,
  type OCOverviewData,
  type OwnerOverviewData,
  type ManagerOverviewData,
} from "./data";
import { OCOverviewSkeleton } from "./oc-overview-skeleton";

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n);

function KPICard({
  label,
  value,
  description,
  icon,
}: {
  label: string;
  value: string;
  description: string;
  icon: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {label}
            </p>
            <p className="mt-2 text-2xl font-bold tabular-nums text-foreground">{value}</p>
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

function OwnerOverview({ data, ocCode }: { data: OwnerOverviewData; ocCode: string }) {
  if (!data.hasLots) {
    return (
      <EmptyState
        icon={Home}
        title="No lots assigned"
        description="Your strata manager hasn't assigned you to a lot in this OC yet."
        card={false}
      />
    );
  }

  const recent = data.levies.slice(0, 5);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <KPICard
          label="Total levied"
          value={formatCurrency(data.totalLevied)}
          description={`${data.levies.length} levy notice${data.levies.length !== 1 ? "s" : ""}`}
          icon={<DollarSign className="h-5 w-5" />}
        />
        <KPICard
          label="Outstanding"
          value={formatCurrency(data.outstanding)}
          description={data.outstanding > 0 ? "Amount due" : "All paid up"}
          icon={<AlertTriangle className="h-5 w-5" />}
        />
      </div>

      {recent.length > 0 ? (
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Recent levies
              </p>
              <Link
                href={`/ocs/${ocCode}/my-levies`}
                className="text-xs text-primary hover:text-primary/80"
              >
                View all
              </Link>
            </div>
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 text-xs font-medium text-muted-foreground">
                    <th className="px-4 py-2 text-left">Period</th>
                    <th className="px-4 py-2 text-left">Due date</th>
                    <th className="px-4 py-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((levy) => (
                    <tr key={levy.id} className="border-t border-border/50">
                      <td colSpan={3} className="p-0">
                        <Link
                          href={`/ocs/${ocCode}/my-levies`}
                          className="flex w-full hover:bg-muted/30 transition-colors"
                        >
                          <span className="px-4 py-2.5 text-foreground flex-1">
                            {formatDateLong(levy.period_start)} , {formatDateLong(levy.period_end)}
                          </span>
                          <span className="px-4 py-2.5 text-foreground">
                            {formatDateLong(levy.due_date)}
                          </span>
                          <span className="px-4 py-2.5 text-right font-semibold tabular-nums">
                            {formatCurrency(levy.amount ?? 0)}
                          </span>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="flex items-center justify-center py-8">
            <p className="text-sm text-muted-foreground">No levies issued yet</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ManagerOverview({
  data,
  ocId,
}: {
  data: ManagerOverviewData;
  ocId: string;
}) {
  if (data.setupIncomplete) {
    return (
      <EmptyState
        icon={Building2}
        title="Setup incomplete"
        description="This OC hasn't finished setup yet. Continue from where you left off."
        card={false}
        action={
          <Link href={`/ocs/new?step=${data.resumeStep}&id=${ocId}`}>
            <Button>
              Continue setup
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
        }
      />
    );
  }

  const stats = data.stats!;

  return (
    <div className="space-y-6">
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
          description={
            stats.outstanding > 0 ? "Amount pending collection" : "No outstanding amounts"
          }
          icon={<AlertTriangle className="h-5 w-5" />}
        />
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

export function OCOverviewClient({ ocId, ocCode }: { ocId: string; ocCode: string }) {
  const fetcher = useCallback(() => getOCOverviewData(ocId), [ocId]);
  const { data, loading } = useCachedData<OCOverviewData>(`oc-overview:${ocId}`, fetcher);

  if (loading || !data) return <OCOverviewSkeleton />;

  return data.kind === "manager" ? (
    <ManagerOverview data={data} ocId={ocId} />
  ) : (
    <OwnerOverview data={data} ocCode={ocCode} />
  );
}
