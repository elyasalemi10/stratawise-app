import { redirect } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { resolveOCFromCode } from "@/lib/oc-resolver";
import { createServerClient } from "@/lib/supabase";
import { requireOCAccess } from "@/lib/auth";
import { EmptyState } from "@/components/shared/empty-state";
import { ReconciliationQueue } from "./reconciliation-queue";

interface UnmatchedTxnRow {
  id: string;
  bank_account_id: string;
  transaction_date: string;
  description: string | null;
  amount: number | string;
  matched_total: number | string;
  deft_reference_number: string | null;
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

export default async function ReconciliationPage({
  params,
}: {
  params: Promise<{ ocCode: string }>;
}) {
  const { ocCode } = await params;
  const resolved = await resolveOCFromCode(ocCode);
  if (!resolved) redirect("/dashboard");
  const ocId = resolved.id;
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
        "id, bank_account_id, transaction_date, description, amount, matched_total, deft_reference_number",
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
      .select("id, lot_number, unit_number, owners:lot_owners(name)")
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

  const txns = (txnsRaw ?? []) as UnmatchedTxnRow[];
  const accounts = (accountsRaw ?? []) as BankAccountRow[];
  const lots = (lotsRaw ?? []) as LotRow[];
  const levies = (leviesRaw ?? []) as OpenLevyRow[];

  if (txns.length === 0) {
    return (
      <EmptyState
        icon={CheckCircle2}
        title="Nothing to reconcile"
        description="Every imported transaction is matched. New CSV imports that can't be auto-matched will appear here."
      />
    );
  }

  return (
    <ReconciliationQueue
      ocId={ocId}
      transactions={txns.map((t) => ({
        ...t,
        amount: Number(t.amount),
        matched_total: Number(t.matched_total),
      }))}
      accounts={accounts}
      lots={lots.map((l) => ({
        id: l.id,
        lot_number: l.lot_number,
        unit_number: l.unit_number,
        primary_owner_name: l.owners?.[0]?.name ?? null,
      }))}
      levies={levies.map((l) => ({
        ...l,
        amount: Number(l.amount),
        amount_paid: Number(l.amount_paid),
      }))}
    />
  );
}
