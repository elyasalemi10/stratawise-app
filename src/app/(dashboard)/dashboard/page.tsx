import { redirect } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";
import { Building2, DollarSign, Users, Plus, MapPin, AlertTriangle, CheckCircle2, ArrowRight, History } from "lucide-react";
import { WelcomeConfetti } from "./_components/welcome-confetti";
import { getCurrentProfile } from "@/lib/auth";
import { getCompanyOCSummary } from "@/lib/actions/oc";
import { createServerClient } from "@/lib/supabase";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface KPICardProps {
  label: string;
  value: string;
  description: string;
  icon: React.ReactNode;
}

interface PastMembershipRow {
  lot_id: string | null;
  oc_id: string;
  joined_at: string;
  left_at: string | null;
}

interface PastLotRow {
  id: string;
  lot_number: number;
  unit_number: string | null;
}

interface PastSubRow {
  id: string;
  name: string;
  address: string;
  plan_number: string;
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
      : "—";

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {pastMemberships.map((m) => {
        const lot = m.lot_id ? pastLots.find((l) => l.id === m.lot_id) : null;
        const sub = pastSubs.find((s) => s.id === m.oc_id);
        if (!lot || !sub) return null;
        return (
          <Link key={`${m.lot_id}-${m.left_at}`} href={`/dashboard/past-lots/${m.lot_id}`} className="block">
            <Card className="transition-colors hover:border-primary/30 cursor-pointer">
              <CardContent className="pt-5">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-foreground truncate">{sub.name}</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Lot {lot.lot_number}{lot.unit_number ? ` · Unit ${lot.unit_number}` : ""}
                    </p>
                  </div>
                  <Badge variant="neutral" className="shrink-0">Past</Badge>
                </div>

                <div className="mt-3 flex items-center gap-1 text-xs text-muted-foreground">
                  <MapPin className="h-3 w-3" />
                  <span className="truncate">{sub.address}</span>
                </div>

                <div className="mt-3 flex items-center gap-1 text-xs text-muted-foreground border-t border-border pt-3">
                  <History className="h-3 w-3" />
                  <span>{formatDate(m.joined_at)} → {formatDate(m.left_at)}</span>
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

export default async function DashboardPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/sign-in");

  // Lot owner main dashboard — unified view across all ocs
  if (profile.role === "lot_owner") {
    const supabase = createServerClient();
    const [activeMembershipsResult, pastMembershipsResult] = await Promise.all([
      supabase
        .from("oc_members")
        .select("oc_id, lot_id")
        .eq("profile_id", profile.id)
        .is("left_at", null),
      supabase
        .from("oc_members")
        .select("lot_id, oc_id, joined_at, left_at")
        .eq("profile_id", profile.id)
        .not("left_at", "is", null)
        .order("left_at", { ascending: false }),
    ]);

    const memberships = activeMembershipsResult.data;
    const pastMemberships = pastMembershipsResult.data ?? [];

    // Resolve oc + lot details for past memberships in one go.
    const pastLotIds = pastMemberships.map((m) => m.lot_id).filter(Boolean) as string[];
    const pastSubIds = pastMemberships.map((m) => m.oc_id);
    const [pastLotsResult, pastSubsResult] = pastLotIds.length > 0 || pastSubIds.length > 0
      ? await Promise.all([
          pastLotIds.length > 0
            ? supabase.from("lots").select("id, lot_number, unit_number").in("id", pastLotIds)
            : Promise.resolve({ data: [] }),
          pastSubIds.length > 0
            ? supabase.from("owners_corporations").select("id, name, address, plan_number").in("id", pastSubIds)
            : Promise.resolve({ data: [] }),
        ])
      : [{ data: [] }, { data: [] }];

    const pastLots = pastLotsResult.data ?? [];
    const pastSubs = pastSubsResult.data ?? [];

    if ((!memberships || memberships.length === 0) && pastMemberships.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Building2 className="h-12 w-12 text-muted-foreground/30" />
          <p className="mt-4 text-base font-medium text-foreground">
            No ocs assigned
          </p>
          <p className="mt-1 text-sm text-muted-foreground max-w-sm">
            Your strata manager hasn&apos;t assigned you to a oc yet.
            Check your email for an invitation link, or contact your strata manager.
          </p>
        </div>
      );
    }

    // If they only have past memberships, jump straight to the past-lots block.
    if (!memberships || memberships.length === 0) {
      return (
        <div className="space-y-6">
          <h2 className="text-base font-semibold text-foreground">Past lots</h2>
          <PastLotsGrid pastMemberships={pastMemberships} pastLots={pastLots} pastSubs={pastSubs} />
        </div>
      );
    }

    // Fetch ocs, lots, and financial data
    const subIds = memberships.map((m) => m.oc_id);
    const lotIds = memberships.map((m) => m.lot_id).filter(Boolean);

    const [subsResult, lotsResult, leviesResult, paymentsResult] = await Promise.all([
      supabase
        .from("owners_corporations")
        .select("id, short_code, name, address, plan_number")
        .in("id", subIds),
      lotIds.length > 0
        ? supabase
            .from("lots")
            .select("id, oc_id, lot_number, unit_number, lot_entitlement")
            .in("id", lotIds)
        : Promise.resolve({ data: [] }),
      lotIds.length > 0
        ? supabase
            .from("levy_notices")
            .select("lot_id, amount, status, due_date")
            .in("lot_id", lotIds)
            .in("status", ["issued", "partially_paid", "overdue"])
        : Promise.resolve({ data: [] }),
      lotIds.length > 0
        ? supabase
            .from("payments")
            .select("lot_id, amount")
            .in("lot_id", lotIds)
        : Promise.resolve({ data: [] }),
    ]);

    const subs = subsResult.data ?? [];
    const lots = lotsResult.data ?? [];

    // Calculate totals
    const totalLevied = leviesResult.data?.reduce((sum, l) => sum + Number(l.amount), 0) ?? 0;
    const totalPaid = paymentsResult.data?.reduce((sum, p) => sum + Number(p.amount), 0) ?? 0;
    const totalOwing = totalLevied - totalPaid;
    const overdueCount = leviesResult.data?.filter((l) => l.status === "overdue").length ?? 0;

    const formatCurrency = (n: number) =>
      new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n);

    return (
      <div className="space-y-6">
        {/* KPIs */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KPICard
            label="OCs"
            value={String(subs.length)}
            description={subs.length === 1 ? "You are a member of 1 oc" : `You are a member of ${subs.length} ocs`}
            icon={<Building2 className="h-5 w-5" />}
          />
          <KPICard
            label="Your lots"
            value={String(lots.length)}
            description={lots.length === 1 ? "1 lot assigned to you" : `${lots.length} lots assigned to you`}
            icon={<Users className="h-5 w-5" />}
          />
          <KPICard
            label="Total owing"
            value={formatCurrency(totalOwing)}
            description={totalOwing === 0 ? "You're all paid up" : `${overdueCount} overdue`}
            icon={totalOwing > 0 ? <AlertTriangle className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
          />
          <KPICard
            label="Total paid"
            value={formatCurrency(totalPaid)}
            description="Payments made to date"
            icon={<DollarSign className="h-5 w-5" />}
          />
        </div>

        {/* OCs */}
        <h2 className="text-base font-semibold text-foreground">Your ocs</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {subs.map((sub) => {
            const subLots = lots.filter((l) => l.oc_id === sub.id);
            const subLevies = leviesResult.data?.filter((l) => subLots.some((sl) => sl.id === l.lot_id)) ?? [];
            const subPayments = paymentsResult.data?.filter((p) => subLots.some((sl) => sl.id === p.lot_id)) ?? [];
            const subOwing = subLevies.reduce((s, l) => s + Number(l.amount), 0) - subPayments.reduce((s, p) => s + Number(p.amount), 0);

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
                        {subOwing > 0 ? formatCurrency(subOwing) + " owing" : "Paid"}
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
                              Lot {lot.lot_number}{lot.unit_number ? ` (Unit ${lot.unit_number})` : ""}
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
            <PastLotsGrid pastMemberships={pastMemberships} pastLots={pastLots} pastSubs={pastSubs} />
          </>
        )}
      </div>
    );
  }

  const summary = await getCompanyOCSummary();
  const ocs = summary?.ocs ?? [];
  const totalOCs = summary?.totalOCs ?? 0;
  const totalLots = summary?.totalLots ?? 0;

  return (
    <div className="space-y-6">
      <Suspense fallback={null}>
        <WelcomeConfetti />
      </Suspense>

      {/* Company KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KPICard
          label="OCs"
          value={String(totalOCs)}
          description={totalOCs === 0 ? "Create your first oc" : "Active ocs"}
          icon={<Building2 className="h-5 w-5" />}
        />
        <KPICard
          label="Total lots"
          value={String(totalLots)}
          description="Across all ocs"
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

      {/* OCs section */}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-foreground">OCs</h2>
        <div className="flex items-center gap-2">
          <Link href="/ocs/new">
            <Button size="sm">
              <Plus className="mr-2 h-4 w-4" />
              Create oc
            </Button>
          </Link>
        </div>
      </div>

      {ocs.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Building2 className="h-12 w-12 text-muted-foreground/30" />
            <p className="mt-4 text-base font-medium text-foreground">
              No ocs yet
            </p>
            <p className="mt-1 text-sm text-muted-foreground max-w-sm">
              Create your first oc to start managing lots, levies, and meetings.
            </p>
            <Link href="/ocs/new">
              <Button className="mt-4">
                <Plus className="mr-2 h-4 w-4" />
                Create oc
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ocs.map((sub) => (
            <Link
              key={sub.id}
              href={`/ocs/${sub.short_code}`}
              className="block"
            >
              <Card className="transition-colors hover:border-primary/30 cursor-pointer">
                <CardContent className="pt-5">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-foreground truncate">
                          {sub.name}
                        </h3>
                        <Badge variant="neutral" className="shrink-0">
                          {sub.status}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {sub.plan_number}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="h-3 w-3" />
                    <span className="truncate">{sub.address}</span>
                  </div>

                  <div className="mt-3 flex items-center gap-4 border-t border-border pt-3">
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
