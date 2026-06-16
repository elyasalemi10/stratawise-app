import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase";
import { evaluateSuperAdminGate } from "@/lib/admin-auth";
import { FirmsTable, type FirmRow } from "./firms-table";

// Super-admin view of every management firm on the platform, with per-firm
// rollups (OCs, lots under management, managers). Each row opens that firm's
// own detail page.
export default async function AdminFirmsPage() {
  const gate = await evaluateSuperAdminGate();
  if (gate.kind === "redirect") redirect(gate.to);

  const supabase = createServerClient();
  const [{ data: companies }, { data: ocs }, { data: managers }] = await Promise.all([
    supabase
      .from("management_companies")
      .select("id, name, trading_as, abn, subscription_status")
      .order("name", { ascending: true }),
    supabase.from("owners_corporations").select("management_company_id, total_lots"),
    supabase
      .from("profiles")
      .select("management_company_id")
      .eq("role", "strata_manager"),
  ]);

  const ocByFirm = new Map<string, { ocs: number; lots: number }>();
  for (const oc of ocs ?? []) {
    const key = oc.management_company_id as string;
    const cur = ocByFirm.get(key) ?? { ocs: 0, lots: 0 };
    cur.ocs += 1;
    cur.lots += (oc.total_lots as number) ?? 0;
    ocByFirm.set(key, cur);
  }
  const managersByFirm = new Map<string, number>();
  for (const m of managers ?? []) {
    const key = m.management_company_id as string | null;
    if (!key) continue;
    managersByFirm.set(key, (managersByFirm.get(key) ?? 0) + 1);
  }

  const rows: FirmRow[] = (companies ?? []).map((c) => {
    const agg = ocByFirm.get(c.id) ?? { ocs: 0, lots: 0 };
    return {
      id: c.id,
      name: c.name,
      tradingAs: c.trading_as,
      abn: c.abn,
      status: c.subscription_status,
      ocCount: agg.ocs,
      lotCount: agg.lots,
      managerCount: managersByFirm.get(c.id) ?? 0,
    };
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          {rows.length} {rows.length === 1 ? "firm" : "firms"} on the platform
        </p>
      </div>
      <FirmsTable firms={rows} />
    </div>
  );
}
