import { getOC } from "@/lib/actions/oc";
import { redirect } from "next/navigation";
import { CreateBudgetForm } from "./create-budget-form";
import { getBudgetCategories, ocHasMaintenanceFund } from "@/lib/actions/budget";

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
  const [oc, categories, hasMaintenanceFund] = await Promise.all([
    getOC(ocId),
    getBudgetCategories(),
    ocHasMaintenanceFund(ocId),
  ]);

  if (!oc) redirect("/dashboard");

  // Financial year runs from the OC's configured start month. The "current"
  // FY is the one we're inside today; we offer the previous FY through two
  // years ahead so a committee can budget next year's at the AGM.
  const now = new Date();
  const fyStartMonth = oc.financial_year_start_month ?? 7;
  const currentYear = now.getFullYear();
  const currentFyStart = now.getMonth() + 1 >= fyStartMonth ? currentYear : currentYear - 1;
  const fyOptions = [-1, 0, 1, 2].map((offset) => {
    const start = currentFyStart + offset;
    return `${start}-${start + 1}`;
  });
  const defaultFinancialYear = `${currentFyStart}-${currentFyStart + 1}`;

  return (
    <CreateBudgetForm
      ocId={ocId}
      categories={categories}
      fyOptions={fyOptions}
      defaultFinancialYear={defaultFinancialYear}
      hasMaintenanceFund={hasMaintenanceFund}
    />
  );
}
