import { notFound, redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase";
import { evaluateSuperAdminGate } from "@/lib/admin-auth";
import { FirmTabs, type FirmDetail } from "./firm-tabs";

export default async function AdminFirmDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const gate = await evaluateSuperAdminGate();
  if (gate.kind === "redirect") redirect(gate.to);

  const { id } = await params;
  const supabase = createServerClient();

  const { data: company } = await supabase
    .from("management_companies")
    .select(
      "id, name, trading_as, registered_name, abn, address, phone, email, subscription_status, created_at",
    )
    .eq("id", id)
    .maybeSingle();

  if (!company) notFound();

  const [{ data: ocs }, { data: managers }] = await Promise.all([
    supabase
      .from("owners_corporations")
      .select("id, name, trading_name, plan_number, total_lots, oc_tier, status")
      .eq("management_company_id", id)
      .order("name", { ascending: true }),
    supabase
      .from("profiles")
      .select("id, first_name, last_name, email, company_role")
      .eq("management_company_id", id)
      .eq("role", "strata_manager")
      .order("first_name", { ascending: true }),
  ]);

  const detail: FirmDetail = {
    id: company.id,
    name: company.name,
    tradingAs: company.trading_as,
    registeredName: company.registered_name,
    abn: company.abn,
    address: company.address,
    phone: company.phone,
    email: company.email,
    status: company.subscription_status,
    createdAt: company.created_at,
    ocs: (ocs ?? []).map((o) => ({
      id: o.id,
      name: o.name,
      tradingName: o.trading_name,
      planNumber: o.plan_number,
      totalLots: o.total_lots ?? 0,
      tier: o.oc_tier,
      status: o.status,
    })),
    managers: (managers ?? []).map((m) => ({
      id: m.id,
      name: [m.first_name, m.last_name].filter(Boolean).join(" ") || "Unnamed",
      email: m.email,
      companyRole: m.company_role,
    })),
  };

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {detail.name}
        </h1>
        {detail.tradingAs && (
          <p className="text-sm text-muted-foreground">Trading as {detail.tradingAs}</p>
        )}
      </div>

      <FirmTabs firm={detail} />
    </div>
  );
}
