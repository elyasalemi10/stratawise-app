"use server";

import { getCurrentProfile } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";

// ============================================================================
// getMyArrears (PP6-D-B)
// ----------------------------------------------------------------------------
// Owner-facing data loader for /ocs/[ocCode]/my-arrears.
// Returns all overdue / partially-paid / outstanding parent levies for
// the caller's lots in the given oc, with linked penalty_interest
// levies grouped under each parent.
//
// Two IN-clause queries (parent levies + linked penalty levies),
// JS-side group + outstanding compute. No per-row fan-out.
//
// Eligibility for inclusion:
//   - lot_id IN owner's active oc_members for this oc
//   - status IN ('issued','partially_paid','overdue')
//   - levy_type <> 'penalty_interest' (penalty levies appear nested
//     under their parent, not as top-level rows)
//   - amount > amount_paid (otherwise it's effectively settled)
// ============================================================================

export interface MyArrearsPenaltyRow {
  id: string;
  reference_number: string;
  amount: number;
  amount_paid: number;
  outstanding: number;
  due_date: string;
}

export interface MyArrearsLevyRow {
  id: string;
  lot_id: string;
  lot_number: number;
  unit_number: string | null;
  reference_number: string;
  amount: number;
  amount_paid: number;
  outstanding: number;
  due_date: string;
  status: "issued" | "partially_paid" | "overdue";
  fund_type: "administrative" | "capital_works" | "maintenance_plan";
  penalty_interest: MyArrearsPenaltyRow[];
}

export interface MyArrearsResult {
  rows: MyArrearsLevyRow[];
  outstandingTotal: number;
}

export async function getMyArrears(
  ocId: string,
): Promise<MyArrearsResult> {
  const profile = await getCurrentProfile();
  if (!profile) return { rows: [], outstandingTotal: 0 };
  if (profile.role !== "lot_owner") return { rows: [], outstandingTotal: 0 };

  const supabase = createServerClient();

  // ─── Step 1: Resolve owner's lots in this oc ──────────────
  const { data: memberships } = await supabase
    .from("oc_members")
    .select("lot_id")
    .eq("oc_id", ocId)
    .eq("profile_id", profile.id)
    .eq("role", "lot_owner")
    .is("left_at", null);
  const lotIds = (memberships ?? [])
    .map((m) => (m as { lot_id: string | null }).lot_id)
    .filter((id): id is string => !!id);
  if (lotIds.length === 0) return { rows: [], outstandingTotal: 0 };

  // ─── Step 2: Fetch parent levies + lots in parallel ────────────────
  const [parentLeviesResult, lotsResult] = await Promise.all([
    supabase
      .from("levy_notices")
      .select(
        "id, lot_id, reference_number, amount, amount_paid, due_date, status, fund_type, levy_type",
      )
      .in("lot_id", lotIds)
      .in("status", ["issued", "partially_paid", "overdue"])
      .neq("levy_type", "penalty_interest")
      .order("due_date", { ascending: true }),
    supabase
      .from("lots")
      .select("id, lot_number, unit_number")
      .in("id", lotIds),
  ]);

  type ParentLevyRow = {
    id: string;
    lot_id: string;
    reference_number: string;
    amount: number | string;
    amount_paid: number | string;
    due_date: string;
    status: "issued" | "partially_paid" | "overdue";
    fund_type: "administrative" | "capital_works" | "maintenance_plan";
    levy_type: string;
  };

  const parentLeviesRaw = (parentLeviesResult.data ?? []) as ParentLevyRow[];
  // Filter out fully-paid parents (amount === amount_paid) — they're
  // technically status='paid' too, but defensive predicate catches state
  // drift between status enum and amount fields.
  const parentLevies = parentLeviesRaw.filter(
    (l) => Number(l.amount) - Number(l.amount_paid) > 0,
  );
  if (parentLevies.length === 0) return { rows: [], outstandingTotal: 0 };

  const lotMap = new Map<string, { lot_number: number; unit_number: string | null }>();
  for (const l of lotsResult.data ?? []) {
    const lot = l as { id: string; lot_number: number; unit_number: string | null };
    lotMap.set(lot.id, { lot_number: lot.lot_number, unit_number: lot.unit_number });
  }

  // ─── Step 3: Fetch linked penalty levies (one IN query) ───────────
  const parentIds = parentLevies.map((p) => p.id);
  const { data: penaltyData } = await supabase
    .from("levy_notices")
    .select(
      "id, linked_levy_id, reference_number, amount, amount_paid, due_date",
    )
    .eq("levy_type", "penalty_interest")
    .in("linked_levy_id", parentIds);

  type PenaltyRow = {
    id: string;
    linked_levy_id: string | null;
    reference_number: string;
    amount: number | string;
    amount_paid: number | string;
    due_date: string;
  };
  const penaltiesByParent = new Map<string, MyArrearsPenaltyRow[]>();
  for (const p of (penaltyData ?? []) as PenaltyRow[]) {
    if (!p.linked_levy_id) continue;
    const out = Number(p.amount) - Number(p.amount_paid);
    if (out <= 0) continue; // Settled penalties don't appear in arrears.
    const list = penaltiesByParent.get(p.linked_levy_id) ?? [];
    list.push({
      id: p.id,
      reference_number: p.reference_number,
      amount: Number(p.amount),
      amount_paid: Number(p.amount_paid),
      outstanding: out,
      due_date: p.due_date,
    });
    penaltiesByParent.set(p.linked_levy_id, list);
  }

  // ─── Step 4: Assemble rows + total ────────────────────────────────
  const rows: MyArrearsLevyRow[] = [];
  let outstandingTotal = 0;

  for (const p of parentLevies) {
    const lot = lotMap.get(p.lot_id);
    const amount = Number(p.amount);
    const amountPaid = Number(p.amount_paid);
    const outstanding = amount - amountPaid;
    const penalties = penaltiesByParent.get(p.id) ?? [];

    rows.push({
      id: p.id,
      lot_id: p.lot_id,
      lot_number: lot?.lot_number ?? 0,
      unit_number: lot?.unit_number ?? null,
      reference_number: p.reference_number,
      amount,
      amount_paid: amountPaid,
      outstanding,
      due_date: p.due_date,
      status: p.status,
      fund_type: p.fund_type,
      penalty_interest: penalties,
    });

    outstandingTotal += outstanding;
    for (const pi of penalties) outstandingTotal += pi.outstanding;
  }

  return { rows, outstandingTotal: Math.round(outstandingTotal * 100) / 100 };
}
