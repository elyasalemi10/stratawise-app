import { redirect } from "next/navigation";
import { Landmark } from "lucide-react";
import { resolveOCFromCode } from "@/lib/oc-resolver";
import { createServerClient } from "@/lib/supabase";
import { requireOCAccess } from "@/lib/auth";
import { EmptyState } from "@/components/shared/empty-state";
import { BankAccountsList } from "./bank-accounts-list";

interface RawAccountRow {
  id: string;
  account_name: string | null;
  bsb: string | null;
  account_number: string | null;
  fund_type: string;
  fund_id: string | null;
  parent_account_id: string | null;
  bank_name: string | null;
  created_at: string;
}

interface RawTxnRow {
  id: string;
  bank_account_id: string;
  transaction_date: string | null;
  description: string;
  amount: number | string | null;
  balance: number | string | null;
}

export default async function BankAccountsPage({
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
  const [{ data: accounts }, { data: funds }, { data: txns }] = await Promise.all([
    supabase
      .from("bank_accounts")
      .select(
        "id, account_name, bsb, account_number, fund_type, fund_id, parent_account_id, bank_name, created_at",
      )
      .eq("oc_id", ocId),
    supabase
      .from("funds")
      .select("id, name, kind")
      .eq("oc_id", ocId),
    supabase
      .from("bank_transactions")
      .select("id, bank_account_id, transaction_date, description, amount, balance")
      .eq("oc_id", ocId)
      .order("transaction_date", { ascending: false, nullsFirst: false })
      .order("id", { ascending: false }),
  ]);

  const allRows = (accounts ?? []) as RawAccountRow[];
  const fundById = new Map(
    ((funds ?? []) as Array<{ id: string; name: string; kind: string }>).map((f) => [f.id, f]),
  );

  // Group by physical account (parent_account_id = null = primary). One
  // row per physical account; list every fund attached.
  const physicalAccounts = allRows.filter((a) => !a.parent_account_id);
  const childrenByParent = new Map<string, RawAccountRow[]>();
  for (const a of allRows) {
    if (!a.parent_account_id) continue;
    if (!childrenByParent.has(a.parent_account_id)) {
      childrenByParent.set(a.parent_account_id, []);
    }
    childrenByParent.get(a.parent_account_id)!.push(a);
  }

  // Stable display order: operating account first; then by created_at.
  // Without this the tabs reorder every time the table is touched (no
  // secondary order key in Postgres) , item 9.
  physicalAccounts.sort((a, b) => {
    const aOp = a.fund_type === "operating" ? 0 : 1;
    const bOp = b.fund_type === "operating" ? 0 : 1;
    if (aOp !== bOp) return aOp - bOp;
    return (a.created_at ?? "").localeCompare(b.created_at ?? "");
  });

  const txnsByAccount = new Map<string, RawTxnRow[]>();
  for (const t of ((txns ?? []) as RawTxnRow[])) {
    if (!txnsByAccount.has(t.bank_account_id)) txnsByAccount.set(t.bank_account_id, []);
    txnsByAccount.get(t.bank_account_id)!.push(t);
  }

  const rows = physicalAccounts.map((primary) => {
    const linkedKids = childrenByParent.get(primary.id) ?? [];
    const fundIds = [primary.fund_id, ...linkedKids.map((k) => k.fund_id)]
      .filter((id): id is string => !!id);
    const fundLabels = fundIds
      .map((id) => fundById.get(id)?.name)
      .filter((n): n is string => !!n);
    const accountTxns = (txnsByAccount.get(primary.id) ?? []).map((t) => ({
      id: t.id,
      date: t.transaction_date,
      description: t.description,
      amount: t.amount !== null ? Number(t.amount) : null,
      balance: t.balance !== null ? Number(t.balance) : null,
    }));
    return {
      id: primary.id,
      account_name: primary.account_name,
      bsb: primary.bsb,
      account_number: primary.account_number,
      bank_name: primary.bank_name,
      fund_labels: Array.from(new Set(fundLabels)).sort(),
      transactions: accountTxns,
    };
  });

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={Landmark}
        title="No bank accounts"
        description="This OC has no bank accounts on file yet."
      />
    );
  }

  return <BankAccountsList ocId={ocId} accounts={rows} />;
}
