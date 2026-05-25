import { getOC } from "@/lib/actions/oc";
import { getOCBudgets } from "@/lib/actions/budget";
import { getAvailablePeriods, type AvailablePeriod } from "@/lib/actions/levy";
import { listChartOfAccounts } from "@/lib/actions/chart-of-accounts";
import { redirect } from "next/navigation";
import { GenerateLeviesForm } from "./generate-levies-form";

import { resolveOCFromCode } from "@/lib/oc-resolver";

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

  return (
    <GenerateLeviesForm
      ocId={ocId}
      budgets={approvedBudgets}
      periodsByBudgetId={periodsByBudgetId}
      coaOptions={adjustmentCoaOptions}
    />
  );
}
