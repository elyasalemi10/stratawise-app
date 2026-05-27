import { redirect } from "next/navigation";
import { Landmark } from "lucide-react";
import { resolveOCFromCode } from "@/lib/oc-resolver";
import { createServerClient } from "@/lib/supabase";
import { requireOCAccess } from "@/lib/auth";
import { EmptyState } from "@/components/shared/empty-state";
import { BankAccountsList } from "./bank-accounts-list";

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
  const [{ data: accounts }, { data: funds }] = await Promise.all([
    supabase
      .from("bank_accounts")
      .select(
        "id, account_name, bsb, account_number, fund_type, fund_id, parent_account_id, bank_name, current_balance, current_balance_as_of",
      )
      .eq("oc_id", ocId)
      .order("fund_type", { ascending: true }),
    supabase
      .from("funds")
      .select("id, name, kind")
      .eq("oc_id", ocId),
  ]);

  const allRows = (accounts ?? []) as Array<{
    id: string;
    account_name: string | null;
    bsb: string | null;
    account_number: string | null;
    fund_type: string;
    fund_id: string | null;
    parent_account_id: string | null;
    bank_name: string | null;
    current_balance: number | string | null;
    current_balance_as_of: string | null;
  }>;
  const fundById = new Map(
    ((funds ?? []) as Array<{ id: string; name: string; kind: string }>).map((f) => [f.id, f]),
  );

  // Group by physical account: parent_account_id = null rows are
  // "primary"; rows with a parent are linked-shares. We render one
  // entry per physical account and list every fund that uses it.
  const physicalAccounts = allRows.filter((a) => !a.parent_account_id);
  const childrenByParent = new Map<string, typeof allRows>();
  for (const a of allRows) {
    if (!a.parent_account_id) continue;
    if (!childrenByParent.has(a.parent_account_id)) {
      childrenByParent.set(a.parent_account_id, []);
    }
    childrenByParent.get(a.parent_account_id)!.push(a);
  }

  const rows = physicalAccounts.map((primary) => {
    const linkedKids = childrenByParent.get(primary.id) ?? [];
    const fundIds = [primary.fund_id, ...linkedKids.map((k) => k.fund_id)]
      .filter((id): id is string => !!id);
    const fundLabels = fundIds
      .map((id) => fundById.get(id)?.name)
      .filter((n): n is string => !!n);
    return {
      id: primary.id,
      account_name: primary.account_name,
      bsb: primary.bsb,
      account_number: primary.account_number,
      bank_name: primary.bank_name,
      current_balance: primary.current_balance,
      current_balance_as_of: primary.current_balance_as_of,
      // Funds attached (primary + linked children). De-duped + sorted.
      fund_labels: Array.from(new Set(fundLabels)).sort(),
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
