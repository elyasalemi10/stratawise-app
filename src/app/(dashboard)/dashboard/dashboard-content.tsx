"use client";

import { Suspense } from "react";
import Link from "next/link";
import {
  Building2,
  DollarSign,
  Users,
  Plus,
  MapPin,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  History,
} from "lucide-react";
import { WelcomeConfetti } from "./_components/welcome-confetti";
import { OCStatusIcon } from "@/components/shared/oc-status-icon";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import type {
  DashboardPageData,
  OwnerDashboardData,
  PastLotRow,
  PastMembershipRow,
  PastSubRow,
} from "./data";

const currency = (n: number) =>
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

function PastLotsGrid({
  pastMemberships,
  pastLots,
  pastSubs,
}: {
  pastMemberships: PastMembershipRow[];
  pastLots: PastLotRow[];
  pastSubs: PastSubRow[];
}) {
  const formatDate = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })
      : "";

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {pastMemberships.map((m) => {
        const lot = m.lot_id ? pastLots.find((l) => l.id === m.lot_id) : null;
        const sub = pastSubs.find((s) => s.id === m.oc_id);
        if (!lot || !sub) return null;
        return (
          <Link
            key={`${m.lot_id}-${m.left_at}`}
            href={`/dashboard/past-lots/${m.lot_id}`}
            className="block"
          >
            <Card className="transition-colors hover:border-primary/30 cursor-pointer">
              <CardContent className="pt-5">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-foreground truncate">{sub.name}</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Lot {lot.lot_number}
                      {lot.unit_number ? ` · Unit ${lot.unit_number}` : ""}
                    </p>
                  </div>
                  <Badge variant="neutral" className="shrink-0">
                    Past
                  </Badge>
                </div>

                <div className="mt-3 flex items-center gap-1 text-xs text-muted-foreground">
                  <MapPin className="h-3 w-3" />
                  <span className="truncate">{sub.address}</span>
                </div>

                <div className="mt-3 flex items-center gap-1 text-xs text-muted-foreground border-t border-border pt-3">
                  <History className="h-3 w-3" />
                  <span>
                    {formatDate(m.joined_at)} → {formatDate(m.left_at)}
                  </span>
                </div>

                <div className="mt-3 flex items-center justify-end text-xs text-primary">
                  View records <ArrowRight className="ml-1 h-3 w-3" />
                </div>
              </CardContent>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}

function OwnerDashboard({ data }: { data: OwnerDashboardData }) {
  const { subs, lots, levies, payments, pastMemberships, pastLots, pastSubs } = data;

  // Nothing at all, current or historic.
  if (!data.hasActiveMemberships && pastMemberships.length === 0) {
    return (
      <div className="space-y-6">
        {/* Confetti still fires here , a freshly-onboarded owner whose
            manager hasn't assigned a lot yet should still get the
            welcome moment. */}
        <Suspense fallback={null}>
          <WelcomeConfetti />
        </Suspense>
        <EmptyState
          icon={Building2}
          title="No Owners Corporations assigned"
          description="Your strata manager hasn't assigned you to an Owners Corporation yet. Check your email for an invitation link, or contact your strata manager."
          card={false}
        />
      </div>
    );
  }

  // Past tenure only.
  if (!data.hasActiveMemberships) {
    return (
      <div className="space-y-6">
        <Suspense fallback={null}>
          <WelcomeConfetti />
        </Suspense>
        <h2 className="text-base font-semibold text-foreground">Past lots</h2>
        <PastLotsGrid
          pastMemberships={pastMemberships}
          pastLots={pastLots}
          pastSubs={pastSubs}
        />
      </div>
    );
  }

  const totalLevied = levies.reduce((sum, l) => sum + Number(l.amount), 0);
  const totalPaid = payments.reduce((sum, p) => sum + Number(p.amount), 0);
  const totalOwing = totalLevied - totalPaid;
  const overdueCount = levies.filter((l) => l.status === "overdue").length;

  return (
    <div className="space-y-6">
      {/* Lot-owner welcome confetti , fires once after onboarding when
          ?welcome=1 lands on this page. Same component the manager
          dashboard uses; auto-strips the query param afterwards. */}
      <Suspense fallback={null}>
          <WelcomeConfetti />
        </Suspense>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KPICard
          label="OCs"
          value={String(subs.length)}
          description={
            subs.length === 1
              ? "You are a member of 1 OC"
              : `You are a member of ${subs.length} OCs`
          }
          icon={<Building2 className="h-5 w-5" />}
        />
        <KPICard
          label="Your lots"
          value={String(lots.length)}
          description={
            lots.length === 1 ? "1 lot assigned to you" : `${lots.length} lots assigned to you`
          }
          icon={<Users className="h-5 w-5" />}
        />
        <KPICard
          label="Total owing"
          value={currency(totalOwing)}
          description={totalOwing === 0 ? "You're all paid up" : `${overdueCount} overdue`}
          icon={
            totalOwing > 0 ? (
              <AlertTriangle className="h-5 w-5" />
            ) : (
              <CheckCircle2 className="h-5 w-5" />
            )
          }
        />
        <KPICard
          label="Total paid"
          value={currency(totalPaid)}
          description="Payments made to date"
          icon={<DollarSign className="h-5 w-5" />}
        />
      </div>

      <h2 className="text-base font-semibold text-foreground">Your OCs</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {subs.map((sub) => {
          const subLots = lots.filter((l) => l.oc_id === sub.id);
          const subLevies = levies.filter((l) => subLots.some((sl) => sl.id === l.lot_id));
          const subPayments = payments.filter((p) => subLots.some((sl) => sl.id === p.lot_id));
          const subOwing =
            subLevies.reduce((s, l) => s + Number(l.amount), 0) -
            subPayments.reduce((s, p) => s + Number(p.amount), 0);

          return (
            <Link key={sub.id} href={`/ocs/${sub.short_code}`} className="block">
              <Card className="transition-colors hover:border-primary/30 cursor-pointer">
                <CardContent className="pt-5">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-semibold text-foreground truncate">
                        {sub.name}
                      </h3>
                      <p className="mt-1 text-xs text-muted-foreground">{sub.plan_number}</p>
                    </div>
                    <Badge variant={subOwing > 0 ? "destructive" : "success"}>
                      {subOwing > 0 ? currency(subOwing) + " owing" : "Paid"}
                    </Badge>
                  </div>

                  <div className="mt-3 flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="h-3 w-3" />
                    <span className="truncate">{sub.address}</span>
                  </div>

                  {subLots.length > 0 && (
                    <div className="mt-3 border-t border-border pt-3 space-y-1">
                      {subLots.map((lot) => (
                        <div key={lot.id} className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">
                            Lot {lot.lot_number}
                            {lot.unit_number ? ` (Unit ${lot.unit_number})` : ""}
                          </span>
                          <span className="text-foreground font-medium">
                            {lot.lot_entitlement ? `${lot.lot_entitlement} UE` : ""}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="mt-3 flex items-center justify-end text-xs text-primary">
                    View details <ArrowRight className="ml-1 h-3 w-3" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      {pastMemberships.length > 0 && (
        <>
          <h2 className="text-base font-semibold text-foreground pt-2">Past lots</h2>
          <PastLotsGrid
            pastMemberships={pastMemberships}
            pastLots={pastLots}
            pastSubs={pastSubs}
          />
        </>
      )}
    </div>
  );
}

function ManagerDashboard({
  firstName,
  totalOCs,
  totalLots,
  ocs,
}: Extract<DashboardPageData, { kind: "manager" }>) {
  return (
    <div className="space-y-6">
      <Suspense fallback={null}>
          <WelcomeConfetti />
        </Suspense>

      {/* The one place an H1 is right on a list-ish page: it is not repeating
          the breadcrumb, it is addressing the person. Falls back to a plain
          "Welcome back" when the profile has no first name yet. */}
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">
        {firstName ? `Welcome back, ${firstName}` : "Welcome back"}
      </h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KPICard
          label="OCs"
          value={String(totalOCs)}
          description={totalOCs === 0 ? "Create your first OC" : "Active OCs"}
          icon={<Building2 className="h-5 w-5" />}
        />
        <KPICard
          label="Total lots"
          value={String(totalLots)}
          description="Across all OCs"
          icon={<Users className="h-5 w-5" />}
        />
        <KPICard
          label="Total levied"
          value="$0.00"
          description="No levies issued yet"
          icon={<DollarSign className="h-5 w-5" />}
        />
        <KPICard
          label="Outstanding"
          value="$0.00"
          description="No outstanding amounts"
          icon={<DollarSign className="h-5 w-5" />}
        />
      </div>

      {/* OCs section. Top-right Create OC is hidden when there are no OCs
          , the empty state below carries the single CTA in that case so we
          aren't double-stamping the same action on one screen. */}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-foreground">OCs</h2>
        {ocs.length > 0 && (
          <Link href="/ocs/new">
            <Button size="sm">
              <Plus className="mr-2 h-4 w-4" />
              Create OC
            </Button>
          </Link>
        )}
      </div>

      {ocs.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No OCs yet"
          description="Create your first OC to start managing lots, levies, and meetings."
          action={
            <Link href="/ocs/new">
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Create OC
              </Button>
            </Link>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ocs.map((sub) => (
            <Link key={sub.id} href={`/ocs/${sub.short_code}`} className="block">
              <Card className="transition-colors hover:border-primary/30 cursor-pointer">
                <CardContent className="pt-5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold text-foreground truncate">
                        {sub.name}
                      </h3>
                      <p className="mt-1 text-xs text-muted-foreground">{sub.plan_number}</p>
                    </div>
                    <OCStatusIcon status={sub.status} />
                  </div>

                  <div className="mt-4 flex items-center gap-4 border-t border-border pt-3">
                    <div>
                      <p className="text-lg font-bold tabular-nums text-foreground">
                        {sub.total_lots}
                      </p>
                      <p className="text-xs text-muted-foreground">Lots</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export function DashboardContent({ data }: { data: DashboardPageData }) {
  return data.kind === "manager" ? <ManagerDashboard {...data} /> : <OwnerDashboard data={data} />;
}
