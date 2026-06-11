import { redirect } from "next/navigation";
import { getBudgetById } from "@/lib/actions/budget";
import { listChartOfAccounts } from "@/lib/actions/chart-of-accounts";
import { getOcLots } from "@/lib/actions/funds";
import { resolveOCFromCode } from "@/lib/oc-resolver";
import { BudgetDetailContent } from "./budget-detail-content";

export default async function BudgetDetailPage({
  params,
}: {
  params: Promise<{ ocCode: string; budgetId: string }>;
}) {
  const { ocCode, budgetId } = await params;
  const resolved = await resolveOCFromCode(ocCode);
  if (!resolved) redirect("/dashboard");
  const budget = await getBudgetById(budgetId);
  if (!budget || budget.oc_id !== resolved.id) redirect(`/ocs/${ocCode}/budgets`);

  // Same CoA filter the create form uses (income / expense, not archived).
  const [allAccounts, lots] = await Promise.all([
    listChartOfAccounts(),
    getOcLots(resolved.id),
  ]);
  const accounts = allAccounts.filter(
    (a) => !a.archived_at && (a.account_type === "expense" || a.account_type === "income"),
  );

  return <BudgetDetailContent ocCode={ocCode} ocId={resolved.id} budget={budget} accounts={accounts} lots={lots} />;
}
