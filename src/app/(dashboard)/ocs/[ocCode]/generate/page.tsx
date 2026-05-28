import { getOC } from "@/lib/actions/oc";
import { getOCBudgets } from "@/lib/actions/budget";
import { getAvailablePeriods, type AvailablePeriod } from "@/lib/actions/levy";
import { listChartOfAccounts } from "@/lib/actions/chart-of-accounts";
import { createServerClient } from "@/lib/supabase";
import { redirect } from "next/navigation";
import { GenerateLeviesForm } from "./generate-levies-form";

import { resolveOCFromCode } from "@/lib/oc-resolver";

interface PreloadedLot {
  lot_id: string;
  lot_number: number;
  unit_number: string | null;
  owner_display_name: string | null;
  liability: number;
}

export default async function GenerateLeviesPage({
  params,
}: {
  params: Promise<{ ocCode: string }>;
}) {
  const { ocCode } = await params;
  const resolved = await resolveOCFromCode(ocCode);
  if (!resolved) redirect("/dashboard");
  const ocId = resolved.id;
  const [oc, budgets, coaAccounts] = await Promise.all([
    getOC(ocId),
    getOCBudgets(ocId),
    listChartOfAccounts(),
  ]);

  if (!oc) redirect("/dashboard");

  // Only show approved + single-fund budgets , drafts can't have levies
  // generated, and multi-fund budgets need a per-fund picker that's not
  // shipped yet. Pre-fetch every eligible budget's period set in parallel
  // so the period dropdown lights up instantly when the manager picks one.
  const approvedBudgets = budgets.filter(
    (b) => b.status === "approved" && b.fund_type !== null,
  );
  const periodEntries = await Promise.all(
    approvedBudgets.map(async (b) => {
      const periods = await getAvailablePeriods(ocId, b.id);
      return [b.id, periods] as const;
    }),
  );
  const periodsByBudgetId: Record<string, AvailablePeriod[]> = Object.fromEntries(periodEntries);

  // CoA accounts (expense / income, active only) drive the adjustment
  // picker. Keep the set tight , managers can't add free-text lines, so
  // every option here must be a real account the ledger can post to.
  const adjustmentCoaOptions = coaAccounts
    .filter((a) => !a.archived_at)
    .filter((a) => a.account_type === "expense" || a.account_type === "income")
    .map((a) => ({ id: a.id, code: a.code, name: a.name }));

  // Which funds does this OC actually have a budget for? Special-levy
  // wizard hides options the OC can't use (e.g. Maintenance Plan when no
  // maintenance budget exists). Derived from every budget the OC has,
  // approved or not.
  const fundsSet = new Set<string>();
  for (const b of budgets) {
    const fs = b.fund_types?.length ? b.fund_types : (b.fund_type ? [b.fund_type] : []);
    for (const f of fs) fundsSet.add(f);
  }
  // Default fallback: admin + capital works are always present in a
  // typical OC even before budgets exist.
  if (fundsSet.size === 0) {
    fundsSet.add("administrative");
    fundsSet.add("capital_works");
  }
  const availableFunds = Array.from(fundsSet) as Array<"administrative" | "capital_works" | "maintenance_plan">;

  // Pre-load OC lots + liability so the "Calculate per lot levies"
  // button in the special-levy flow is instant , the form does the
  // apportionment client-side instead of round-tripping to
  // previewSpecialLevy. Owner names included so the per-lot table
  // can render the "Lot 4, Jane Doe" header right away.
  const supabase = createServerClient();
  const { data: rawLots } = await supabase
    .from("lots")
    .select("id, lot_number, unit_number, lot_liability, lot_entitlement")
    .eq("oc_id", ocId)
    .order("lot_number");
  const lotIds = (rawLots ?? []).map((l) => l.id);
  let ownersByLot = new Map<string, string>();
  if (lotIds.length > 0) {
    const { data: ownerRows } = await supabase
      .from("lot_owners")
      .select("lot_id, name, email")
      .in("lot_id", lotIds);
    for (const row of (ownerRows ?? []) as Array<{ lot_id: string; name: string | null; email: string | null }>) {
      if (!ownersByLot.has(row.lot_id)) {
        const label = (row.name ?? row.email ?? "").trim();
        if (label) ownersByLot.set(row.lot_id, label);
      }
    }
  }
  const preloadedLots: PreloadedLot[] = ((rawLots ?? []) as Array<{
    id: string;
    lot_number: number;
    unit_number: string | null;
    lot_liability: number | null;
    lot_entitlement: number | null;
  }>).map((l) => ({
    lot_id: l.id,
    lot_number: l.lot_number,
    unit_number: l.unit_number,
    owner_display_name: ownersByLot.get(l.id) ?? null,
    liability:
      Number(l.lot_liability) > 0
        ? Number(l.lot_liability)
        : Number(l.lot_entitlement) > 0
        ? Number(l.lot_entitlement)
        : 1,
  }));

  return (
    <GenerateLeviesForm
      ocId={ocId}
      budgets={approvedBudgets}
      periodsByBudgetId={periodsByBudgetId}
      coaOptions={adjustmentCoaOptions}
      availableFunds={availableFunds}
      preloadedLots={preloadedLots}
    />
  );
}
