import { getOC } from "@/lib/actions/oc";
import { redirect } from "next/navigation";
import { CreateBudgetForm } from "./create-budget-form";
import { listChartOfAccounts } from "@/lib/actions/chart-of-accounts";
import { ocHasMaintenanceFund } from "@/lib/actions/budget";
import { getFunds } from "@/lib/actions/funds";

import { resolveOCFromCode } from "@/lib/oc-resolver";

export default async function CreateBudgetPage({
  params,
}: {
  params: Promise<{ ocCode: string }>;
}) {
  const { ocCode } = await params;
  const resolved = await resolveOCFromCode(ocCode);
  if (!resolved) redirect("/dashboard");
  const ocId = resolved.id;
  const [oc, accounts, ocFunds, hasMaintenanceFund] = await Promise.all([
    getOC(ocId),
    listChartOfAccounts(),
    getFunds(ocId),
    ocHasMaintenanceFund(ocId),
  ]);

  if (!oc) redirect("/dashboard");

  // Available fund types: prefer the new `funds` table (manager-created
  // funds via /funds). If the OC hasn't created any yet (e.g. brand-new
  // OC, or hasn't visited /funds), fall back to the legacy capabilities
  // so the manager can still budget , Admin + Capital Works are
  // assumed; Maintenance Plan only when the OC settings flag is on.
  const ocFundKinds = new Set(ocFunds.map((f) => f.kind));
  const systemKinds = (["administrative", "capital_works", "maintenance_plan"] as const).filter((k) => ocFundKinds.has(k));
  const availableSystemFunds = systemKinds.length > 0
    ? systemKinds
    : (["administrative", "capital_works", ...(hasMaintenanceFund ? ["maintenance_plan" as const] : [])] as ("administrative" | "capital_works" | "maintenance_plan")[]);

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
    />
  );
}
