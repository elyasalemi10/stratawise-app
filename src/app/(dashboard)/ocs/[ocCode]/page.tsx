import Link from "next/link";
import { Building2, DollarSign, AlertTriangle, Users, ArrowRight, Home, FileText, CalendarDays, Download } from "lucide-react";
import { formatDateLong } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { redirect } from "next/navigation";
import { getOC, getOCStats } from "@/lib/actions/oc";
import { getCurrentProfile } from "@/lib/auth";
import { resolveOCFromCode } from "@/lib/oc-resolver";
import { createServerClient } from "@/lib/supabase";
import { DrnImportPrompt } from "./_components/drn-import-prompt";

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
async function LotOwnerDashboard({ ocId, ocCode, profileId }: { ocId: string; ocCode: string; profileId: string }) {
  const supabase = createServerClient();

  // Get the lot owner's lots in this OC
  const { data: memberships } = await supabase
    .from("oc_members")
    .select("lot_id")
    .eq("oc_id", ocId)
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
          Your strata manager hasn&apos;t assigned you to a lot in this OC yet.
        </p>
      </div>
    );
  }

  // Fetch lot details
  const { data: lots } = await supabase
    .from("lots")
    .select("id, lot_number, unit_number, lot_entitlement, lot_liability")
    .in("id", lotIds);

  // Fetch levies for these lots (only issued, not drafts)
  const { data: levies } = await supabase
    .from("levy_notices")
    .select("id, lot_id, reference_number, period_start, period_end, amount, status, due_date, pdf_url")
    .in("lot_id", lotIds)
    .in("status", ["issued", "partially_paid", "paid", "overdue"])
    .order("due_date", { ascending: false });

  // Fetch payments for these lots
  const levyIds = (levies ?? []).map((l) => l.id);
  const { data: payments } = levyIds.length > 0
    ? await supabase
        .from("payments")
        .select("id, levy_notice_id, amount, payment_date, payment_method")
        .in("levy_notice_id", levyIds)
    : { data: [] };

  const totalLevied = (levies ?? []).reduce((s, l) => s + (l.amount ?? 0), 0);
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

      {/* Recent levies */}
      {(() => {
        const allLevies = (levies ?? []).slice(0, 5);
        return allLevies.length > 0 ? (
          <Card>
            <CardContent className="pt-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Recent levies</p>
                <Link href={`/ocs/${ocCode}/my-levies`} className="text-xs text-primary hover:text-primary/80">
                  View all
                </Link>
              </div>
              <div className="rounded-lg border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      <th className="px-4 py-2 text-left">Period</th>
                      <th className="px-4 py-2 text-left">Due date</th>
                      <th className="px-4 py-2 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allLevies.map((levy) => (
                      <tr key={levy.id} className="border-t border-border/50">
                        <td colSpan={3} className="p-0">
                          <Link href={`/ocs/${ocCode}/my-levies`} className="flex w-full hover:bg-muted/30 transition-colors">
                            <span className="px-4 py-2.5 text-foreground flex-1">{formatDateLong(levy.period_start)} — {formatDateLong(levy.period_end)}</span>
                            <span className="px-4 py-2.5 text-foreground">{formatDateLong(levy.due_date)}</span>
                            <span className="px-4 py-2.5 text-right font-semibold tabular-nums">{formatCurrency(levy.amount ?? 0)}</span>
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
        );
      })()}

    </div>
  );
}

// ─── Manager Dashboard ───────────────────────────────────
async function ManagerDashboard({ ocId }: { ocId: string }) {
  const stats = await getOCStats(ocId);

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
            Levies, meetings, and activity will appear here as you build out this OC.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────
export default async function OCDashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ ocCode: string }>;
  searchParams?: Promise<{ created?: string; drn?: string }>;
}) {
  const { ocCode } = await params;
  const sp = (await searchParams) ?? {};
  const resolved = await resolveOCFromCode(ocCode);
  if (!resolved) redirect("/dashboard");
  const ocId = resolved.id;
  const profile = await getCurrentProfile();
  const oc = await getOC(ocId);

  // If setup is incomplete (managers only), show continue setup prompt
  if (
    oc &&
    (oc.setup_step ?? 0) < 5 &&
    profile?.role !== "lot_owner"
  ) {
    const step = (oc.setup_step ?? 0) + 1;
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Building2 className="h-12 w-12 text-muted-foreground/30" />
        <p className="mt-4 text-base font-medium text-foreground">
          Setup incomplete
        </p>
        <p className="mt-1 text-sm text-muted-foreground max-w-sm">
          This oc hasn&apos;t finished setup yet. Continue from where you left off.
        </p>
        <Link href={`/ocs/new?step=${step}&id=${ocId}`}>
          <Button className="mt-4">
            Continue setup
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </Link>
      </div>
    );
  }

  if (profile?.role === "lot_owner") {
    return <LotOwnerDashboard ocId={ocId} ocCode={ocCode} profileId={profile.id} />;
  }

  // When the wizard finishes and the OC uses Macquarie DEFT, prompt for the
  // DRN export CSV — but ONLY if no DRN mappings have been recorded yet.
  // The wizard now collects DRNs inline on Page 5, so most Macquarie OCs
  // arrive at the dashboard with lot_drns rows already written; firing the
  // dialog again would be a duplicate ask. Manager can dismiss with
  // "I'll do this later"; we don't block the dashboard behind the upload.
  let showDrnPrompt = false;
  let lotsForDrn: Array<{ id: string; lot_number: number; unit_number: string | null }> = [];
  if ((sp.created === "1" || sp.drn === "1") && oc?.bank_provider === "macquarie_deft") {
    const supabase = createServerClient();
    const { count: drnCount } = await supabase
      .from("lot_drns")
      .select("id", { count: "exact", head: true })
      .in("lot_id", (await supabase
        .from("lots")
        .select("id")
        .eq("oc_id", ocId)).data?.map((l) => l.id) ?? []);
    if ((drnCount ?? 0) === 0) {
      showDrnPrompt = true;
      const { data: lots } = await supabase
        .from("lots")
        .select("id, lot_number, unit_number")
        .eq("oc_id", ocId)
        .order("lot_number");
      lotsForDrn = lots ?? [];
    }
  }

  return (
    <>
      <ManagerDashboard ocId={ocId} />
      {showDrnPrompt && (
        <DrnImportPrompt ocId={ocId} ocCode={ocCode} lots={lotsForDrn} />
      )}
    </>
  );
}
