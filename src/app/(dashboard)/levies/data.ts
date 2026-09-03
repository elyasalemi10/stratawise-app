"use server";

import { getCurrentProfile } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";
import { getLotBalances, sumBalances } from "@/lib/lot-balance";

export interface OwnerLevyRow {
  id: string;
  lot_id: string;
  reference_number: string;
  period_start: string;
  period_end: string;
  amount: number | null;
  status: string;
  due_date: string;
  created_at: string;
  pdf_url: string | null;
  amount_paid: number;
  reminder_sent: boolean;
  lot_number: number | null;
  oc_name: string;
}

export interface OwnerLeviesPageData {
  levies: OwnerLevyRow[];
  totalLevied: number;
  totalPaid: number;
  outstanding: number;
  hasLots: boolean;
}

const EMPTY: OwnerLeviesPageData = {
  levies: [],
  totalLevied: 0,
  totalPaid: 0,
  outstanding: 0,
  hasLots: false,
};

export async function getOwnerLeviesPageData(): Promise<OwnerLeviesPageData> {
  const profile = await getCurrentProfile();
  if (!profile) throw new Error("Not authenticated.");
  if (profile.role !== "lot_owner") throw new Error("Access denied.");

  const supabase = createServerClient();

  // Every lot this owner holds, across all OCs.
  const { data: memberships } = await supabase
    .from("v_lot_current_owners")
    .select("oc_id, lot_id")
    .eq("profile_id", profile.id);

  const lotIds = (memberships ?? []).map((m) => m.lot_id).filter(Boolean) as string[];
  if (lotIds.length === 0) return EMPTY;

  // This used to fire a third query here for payments, keyed on lotIds
  // against levy_notice_id. It matched nothing and its result was never
  // read: a wasted round trip on every visit. The real payments lookup is
  // the one below, keyed on the levy ids.
  const [{ data: leviesRaw }, { data: lotsRaw }] = await Promise.all([
    supabase
      .from("levy_notices")
      .select(
        "id, lot_id, reference_number, period_start, period_end, amount, status, due_date, created_at, pdf_url",
      )
      .in("lot_id", lotIds)
      .in("status", ["issued", "partially_paid", "paid", "overdue"])
      .order("due_date", { ascending: false }),
    supabase
      .from("lots")
      .select("id, oc_id, lot_number, unit_number, ocs:oc_id (name)")
      .in("id", lotIds),
  ]);

  const levies = leviesRaw ?? [];
  const levyIds = levies.map((l) => l.id);
  if (levyIds.length === 0) return { ...EMPTY, hasLots: true };

  // Payments and escalations key off the same levy ids, so they go out
  // together rather than one after the other.
  const [{ data: allPayments }, { data: escalations }] = await Promise.all([
    supabase.from("payments").select("levy_notice_id, amount").in("levy_notice_id", levyIds),
    supabase
      .from("escalation_instances")
      .select("levy_notice_id, current_step")
      .in("levy_notice_id", levyIds),
  ]);

  const paidByLevy = new Map<string, number>();
  for (const p of allPayments ?? []) {
    paidByLevy.set(p.levy_notice_id, (paidByLevy.get(p.levy_notice_id) ?? 0) + Number(p.amount));
  }

  // Per-levy reminder_sent flag for the LevyStatusBadge. Row presence with
  // current_step >= 1 means the overdue cron fired step 1.
  const reminded = new Set(
    (escalations ?? [])
      .filter((e) => (e as { current_step: number }).current_step >= 1)
      .map((e) => (e as { levy_notice_id: string }).levy_notice_id),
  );

  const lotById = new Map(
    (lotsRaw ?? []).map((l) => [
      l.id,
      {
        lot_number: l.lot_number as number | null,
        oc_name: (l as unknown as { ocs?: { name?: string } }).ocs?.name ?? "",
      },
    ]),
  );

  // Same definition as everywhere else, opening balance included. The list
  // above shows paid notices too, so it cannot double as the arrears figure.
  const balances = await getLotBalances(supabase, lotIds);
  const totals = sumBalances(balances.values());
  const totalLevied = totals.opening + totals.levied;
  const totalPaid = totals.paid;

  return {
    levies: levies.map((l) => ({
      ...l,
      amount_paid: paidByLevy.get(l.id) ?? 0,
      reminder_sent: reminded.has(l.id),
      lot_number: lotById.get(l.lot_id)?.lot_number ?? null,
      oc_name: lotById.get(l.lot_id)?.oc_name ?? "",
    })),
    totalLevied,
    totalPaid,
    outstanding: totals.balance,
    hasLots: true,
  };
}
