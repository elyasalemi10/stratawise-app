import { getOC } from "@/lib/actions/oc";
import { notFound, redirect } from "next/navigation";
import { CreateBudgetForm } from "./create-budget-form";
import { listChartOfAccounts } from "@/lib/actions/chart-of-accounts";
import { getFunds, getOcLots } from "@/lib/actions/funds";

import { resolveOCFromCode } from "@/lib/oc-resolver";

export default async function CreateBudgetPage({
  params,
}: {
  params: Promise<{ ocCode: string }>;
}) {
  const { ocCode } = await params;
  const resolved = await resolveOCFromCode(ocCode);
  if (!resolved) notFound();
  const ocId = resolved.id;
  const [oc, accounts, ocFunds, lots] = await Promise.all([
    getOC(ocId),
    listChartOfAccounts(),
    getFunds(ocId),
    getOcLots(ocId),
  ]);

  if (!oc) redirect("/dashboard");

  // Available fund types for the budget picker. The funds table tracks the
  // FUND kind ('admin' | 'custom'); budgets.fund_type is the DB enum, of
  // which only 'operating' is offered now that the Maintenance Plan Fund is
  // gone. Everything else an OC wants is a custom fund, carried on
  // budgets.fund_id rather than the enum.
  const hasAdminFund = ocFunds.some((f) => f.kind === "admin");
  const availableSystemFunds: "operating"[] = [];
  if (hasAdminFund || ocFunds.length === 0) availableSystemFunds.push("operating");

  // Custom funds from /funds. Each gets passed to the form so the
  // multi-select shows them alongside system funds. Budget submit
  // writes the FK on budgets.fund_id for these.
  const customFunds = ocFunds
    .filter((f) => f.kind === "custom")
    .map((f) => ({ id: f.id, name: f.name }));

  // Financial year runs from the OC's configured start month. The "current"
  // FY is the one we're inside today; budgets can only be for the current FY
  // or up to three years ahead , never the past.
  const now = new Date();
  const fyStartMonth = oc.financial_year_start_month ?? 7;
  const currentYear = now.getFullYear();
  const currentFyStart = now.getMonth() + 1 >= fyStartMonth ? currentYear : currentYear - 1;
  const fyOptions = [0, 1, 2, 3].map((offset) => {
    const start = currentFyStart + offset;
    return `${start}-${start + 1}`;
  });
  const defaultFinancialYear = `${currentFyStart}-${currentFyStart + 1}`;

  // Budgets are forecasts of expense and income , only expose those types
  // from the firm's chart of accounts to keep the picker focused. Assets /
  // liabilities / equity don't belong on a budget line.
  const budgetableAccounts = accounts.filter(
    (a) => !a.archived_at && (a.account_type === "expense" || a.account_type === "income"),
  );

  return (
    <CreateBudgetForm
      ocId={ocId}
      accounts={budgetableAccounts}
      fyOptions={fyOptions}
      defaultFinancialYear={defaultFinancialYear}
      availableFunds={availableSystemFunds}
      customFunds={customFunds}
      lots={lots}
    />
  );
}
