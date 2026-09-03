"use server";

import { getCurrentProfile } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";

export interface MyLeviesPageData {
  levies: Array<{
    id: string;
    lot_id: string;
    reference_number: string;
    period_start: string;
    period_end: string;
    amount: number;
    status: string;
    due_date: string;
    pdf_url: string | null;
    issued_at: string | null;
    amount_paid: number;
    reminder_sent: boolean;
  }>;
}

export async function getMyLeviesPageData(ocId: string): Promise<MyLeviesPageData> {
  const profile = await getCurrentProfile();
  if (!profile) throw new Error("Not authenticated.");
  if (profile.role !== "lot_owner") throw new Error("Access denied.");

  const supabase = createServerClient();

  const { data: memberships } = await supabase
    .from("v_lot_current_owners")
    .select("lot_id")
    .eq("oc_id", ocId)
    .eq("profile_id", profile.id);

  const lotIds = (memberships ?? []).map((m) => m.lot_id).filter(Boolean) as string[];
  if (lotIds.length === 0) return { levies: [] };

  const { data: levies } = await supabase
    .from("levy_notices")
    .select(
      "id, lot_id, reference_number, period_start, period_end, amount, status, due_date, pdf_url, issued_at",
    )
    .in("lot_id", lotIds)
    .in("status", ["issued", "partially_paid", "paid", "overdue"])
    .order("due_date", { ascending: false });

  const levyIds = (levies ?? []).map((l) => l.id);
  if (levyIds.length === 0) return { levies: [] };

  // Payments and escalations used to run as two sequential queries. Both key
  // off the same levy ids, so they go out together.
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

  // Per-levy reminder_sent flag from escalation_instances.
  const remindedLevyIds = new Set(
    (escalations ?? [])
      .filter((e) => (e as { current_step: number }).current_step >= 1)
      .map((e) => (e as { levy_notice_id: string }).levy_notice_id),
  );

  return {
    levies: (levies ?? []).map((l) => ({
      ...l,
      amount_paid: paidByLevy.get(l.id) ?? 0,
      reminder_sent: remindedLevyIds.has(l.id),
    })),
  };
}
