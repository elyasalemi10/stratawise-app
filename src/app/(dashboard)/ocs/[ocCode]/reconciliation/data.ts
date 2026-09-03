"use server";

import { createServerClient } from "@/lib/supabase";
import { requireOCAccess } from "@/lib/auth";

// One aggregate fetch plus the number coercion the page used to do inline.
//
// The auth check lives here, not in page.tsx: page.tsx only runs on the
// initial shell request, so a check left up there would be skipped on every
// refresh the client drives afterwards.

interface UnmatchedTxnRow {
  id: string;
  bank_account_id: string;
  transaction_date: string;
  description: string | null;
  amount: number | string;
  matched_total: number | string;
}

interface BankAccountRow {
  id: string;
  account_name: string | null;
  bank_name: string | null;
}

interface LotRow {
  id: string;
  lot_number: number | null;
  unit_number: string | null;
  owners: Array<{ name: string }> | null;
}

interface OpenLevyRow {
  id: string;
  lot_id: string;
  reference_number: string;
  fund_type: "operating" | "maintenance_plan";
  amount: number | string;
  amount_paid: number | string;
  due_date: string;
  status: string;
}

export interface ReconciliationPageData {
  transactions: Array<Omit<UnmatchedTxnRow, "amount" | "matched_total"> & {
    amount: number;
    matched_total: number;
  }>;
  accounts: BankAccountRow[];
  lots: Array<{
    id: string;
    lot_number: number | null;
    unit_number: string | null;
    primary_owner_name: string | null;
  }>;
  levies: Array<Omit<OpenLevyRow, "amount" | "amount_paid"> & {
    amount: number;
    amount_paid: number;
  }>;
}

export async function getReconciliationPageData(
  ocId: string,
): Promise<ReconciliationPageData> {
  await requireOCAccess(ocId);

  const supabase = createServerClient();
  const [
    { data: txnsRaw },
    { data: accountsRaw },
    { data: lotsRaw },
    { data: leviesRaw },
  ] = await Promise.all([
    supabase
      .from("bank_transactions")
      .select(
        "id, bank_account_id, transaction_date, description, amount, matched_total",
      )
      .eq("oc_id", ocId)
      .eq("match_status", "unmatched")
      .eq("is_voided", false)
      .gt("amount", 0)
      .order("transaction_date", { ascending: false }),
    supabase
      .from("bank_accounts")
      .select("id, account_name, bank_name")
      .eq("oc_id", ocId),
    supabase
      .from("lots")
      .select("id, lot_number, unit_number, owners:v_lot_current_owners(name)")
      .eq("oc_id", ocId)
      .order("lot_number", { ascending: true }),
    supabase
      .from("levy_notices")
      .select(
        "id, lot_id, reference_number, fund_type, amount, amount_paid, due_date, status",
      )
      .eq("oc_id", ocId)
      .in("status", ["issued", "partially_paid", "overdue"])
      .order("due_date", { ascending: true }),
  ]);

  return {
    transactions: ((txnsRaw ?? []) as UnmatchedTxnRow[]).map((t) => ({
      ...t,
      amount: Number(t.amount),
      matched_total: Number(t.matched_total),
    })),
    accounts: (accountsRaw ?? []) as BankAccountRow[],
    lots: ((lotsRaw ?? []) as LotRow[]).map((l) => ({
      id: l.id,
      lot_number: l.lot_number,
      unit_number: l.unit_number,
      primary_owner_name: l.owners?.[0]?.name ?? null,
    })),
    levies: ((leviesRaw ?? []) as OpenLevyRow[]).map((l) => ({
      ...l,
      amount: Number(l.amount),
      amount_paid: Number(l.amount_paid),
    })),
  };
}
