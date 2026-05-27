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
  const { data: accounts } = await supabase
    .from("bank_accounts")
    .select(
      "id, account_name, bsb, account_number, fund_type, bank_name, current_balance, current_balance_as_of",
    )
    .eq("oc_id", ocId)
    .order("fund_type", { ascending: true });

  const rows = (accounts ?? []) as Array<{
    id: string;
    account_name: string | null;
    bsb: string | null;
    account_number: string | null;
    fund_type: string;
    bank_name: string | null;
    current_balance: number | string | null;
    current_balance_as_of: string | null;
  }>;

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
