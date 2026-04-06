import Link from "next/link";
import { Building2, DollarSign, AlertTriangle, Users, ArrowRight, Home, FileText, CalendarDays } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getSubdivision, getSubdivisionStats } from "@/lib/actions/subdivision";
import { getCurrentProfile } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";

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

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n);

// ─── Lot Owner Dashboard ─────────────────────────────────
async function LotOwnerDashboard({ subdivisionId, profileId }: { subdivisionId: string; profileId: string }) {
  const supabase = createServerClient();

  // Get the lot owner's lots in this subdivision
  const { data: memberships } = await supabase
    .from("subdivision_members")
    .select("lot_id")
    .eq("subdivision_id", subdivisionId)
    .eq("profile_id", profileId)
    .eq("role", "lot_owner")
    .is("left_at", null);

  const lotIds = (memberships ?? []).map((m) => m.lot_id).filter(Boolean) as string[];

  if (lotIds.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Home className="h-12 w-12 text-muted-foreground/30" />
        <p className="mt-4 text-base font-medium text-foreground">No lots assigned</p>
        <p className="mt-1 text-sm text-muted-foreground max-w-sm">
          Your strata manager hasn&apos;t assigned you to a lot in this subdivision yet.
        </p>
      </div>
    );
  }

  // Fetch lot details
  const { data: lots } = await supabase
    .from("lots")
    .select("id, lot_number, unit_number, lot_entitlement, lot_liability, owner_name, owner_email")
    .in("id", lotIds);

  // Fetch levies for these lots
  const { data: levies } = await supabase
    .from("levy_notices")
    .select("id, lot_id, reference_number, period_start, period_end, total_amount, status, due_date")
    .in("lot_id", lotIds)
    .order("due_date", { ascending: false });

  // Fetch payments for these lots
  const { data: payments } = await supabase
    .from("payments")
    .select("id, levy_notice_id, amount, payment_date, payment_method")
    .in("levy_notice_id", (levies ?? []).map((l) => l.id));

  const totalLevied = (levies ?? []).reduce((s, l) => s + (l.total_amount ?? 0), 0);
  const totalPaid = (payments ?? []).reduce((s, p) => s + (p.amount ?? 0), 0);
  const outstanding = totalLevied - totalPaid;

  return (
    <div className="space-y-6">
      {/* KPI cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <KPICard
          label="Total levied"
          value={formatCurrency(totalLevied)}
          description={`${(levies ?? []).length} levy notice${(levies ?? []).length !== 1 ? "s" : ""}`}
          icon={<DollarSign className="h-5 w-5" />}
        />
        <KPICard
          label="Outstanding"
          value={formatCurrency(outstanding)}
          description={outstanding > 0 ? "Amount due" : "All paid up"}
          icon={<AlertTriangle className="h-5 w-5" />}
        />
      </div>

      {/* Lot details */}
      {(lots ?? []).map((lot) => {
        const lotLevies = (levies ?? []).filter((l) => l.lot_id === lot.id);
        return (
          <Card key={lot.id}>
            <CardContent className="pt-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">
                    Lot {lot.lot_number}
                    {lot.unit_number ? ` (Unit ${lot.unit_number})` : ""}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    Entitlement: {lot.lot_entitlement} · Liability: {lot.lot_liability}
                  </p>
                </div>
              </div>

              {lotLevies.length > 0 ? (
                <div className="border-t border-border pt-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-3">Recent levies</p>
                  <div className="space-y-2">
                    {lotLevies.slice(0, 5).map((levy) => (
                      <div key={levy.id} className="flex items-center justify-between py-2 text-sm">
                        <div className="flex items-center gap-3">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <p className="font-medium text-foreground">{levy.reference_number}</p>
                            <p className="text-xs text-muted-foreground">Due {levy.due_date}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-medium tabular-nums">{formatCurrency(levy.total_amount ?? 0)}</span>
                          <Badge variant={levy.status === "paid" ? "success" : levy.status === "overdue" ? "destructive" : "info"}>
                            {levy.status}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="border-t border-border pt-4 text-center">
                  <p className="text-sm text-muted-foreground">No levies issued yet</p>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}

      {/* Placeholder for meetings */}
      <Card>
        <CardContent className="flex items-center gap-3 py-8 justify-center">
          <CalendarDays className="h-5 w-5 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">
            Meeting notices and minutes will appear here.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Manager Dashboard ───────────────────────────────────
async function ManagerDashboard({ subdivisionId }: { subdivisionId: string }) {
  const stats = await getSubdivisionStats(subdivisionId);

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

// ─── Main Page ───────────────────────────────────────────
export default async function SubdivisionDashboardPage({
  params,
}: {
  params: Promise<{ subdivisionId: string }>;
}) {
  const { subdivisionId } = await params;
  const profile = await getCurrentProfile();
  const subdivision = await getSubdivision(subdivisionId);

  // If setup is incomplete (managers only), show continue setup prompt
  if (
    subdivision &&
    (subdivision.setup_step ?? 0) < 5 &&
    profile?.role !== "lot_owner"
  ) {
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

  if (profile?.role === "lot_owner") {
    return <LotOwnerDashboard subdivisionId={subdivisionId} profileId={profile.id} />;
  }

  return <ManagerDashboard subdivisionId={subdivisionId} />;
}
