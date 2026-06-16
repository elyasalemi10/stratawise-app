import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase";
import { evaluateSuperAdminGate } from "@/lib/admin-auth";
import { Card, CardContent } from "@/components/ui/card";
import { Building2, Users, Mail, ShieldCheck, Boxes } from "lucide-react";

// Super admin landing page.
//
// First iteration: surfaces platform-wide counts (companies, managers,
// OCs, lot owners) and links to the regular dashboard for spot-checking
// a specific firm. As the admin surface grows this becomes the home for
// tenant management, feature flags, audit log search, etc.

interface KpiCardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
}

function KpiCard({ label, value, icon }: KpiCardProps) {
  return (
    <Card>
      <CardContent className="pt-5 space-y-2">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
          {icon}
          {label}
        </div>
        <p className="text-3xl font-bold tabular-nums text-foreground">{value}</p>
      </CardContent>
    </Card>
  );
}

export default async function SuperAdminDashboardPage() {
  const gate = await evaluateSuperAdminGate();
  if (gate.kind === "redirect") redirect(gate.to);

  const supabase = createServerClient();
  const [
    { count: companyCount },
    { count: managerCount },
    { count: ocCount },
    { count: lotOwnerCount },
    { count: lotCount },
  ] = await Promise.all([
    supabase.from("management_companies").select("id", { count: "exact", head: true }),
    supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "strata_manager"),
    supabase.from("owners_corporations").select("id", { count: "exact", head: true }),
    supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "lot_owner"),
    supabase.from("lots").select("id", { count: "exact", head: true }),
  ]);

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Platform overview
        </h1>
        <p className="text-sm text-muted-foreground">
          You&apos;re signed in as a super admin with MFA verified. This view
          is separate from the regular manager / lot owner dashboard.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <KpiCard
          label="Management firms"
          value={companyCount ?? 0}
          icon={<Building2 className="h-3.5 w-3.5" />}
        />
        <KpiCard
          label="Strata managers"
          value={managerCount ?? 0}
          icon={<ShieldCheck className="h-3.5 w-3.5" />}
        />
        <KpiCard
          label="Owners corporations"
          value={ocCount ?? 0}
          icon={<Mail className="h-3.5 w-3.5" />}
        />
        <KpiCard
          label="Lots managed"
          value={lotCount ?? 0}
          icon={<Boxes className="h-3.5 w-3.5" />}
        />
        <KpiCard
          label="Lot owners"
          value={lotOwnerCount ?? 0}
          icon={<Users className="h-3.5 w-3.5" />}
        />
      </div>
    </div>
  );
}
