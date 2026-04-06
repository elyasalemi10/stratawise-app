import { getSubdivision } from "@/lib/actions/subdivision";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { BudgetPageContent } from "./budget-page-content";

export default async function BudgetsPage({
  params,
}: {
  params: Promise<{ subdivisionId: string }>;
}) {
  const { subdivisionId } = await params;
  const subdivision = await getSubdivision(subdivisionId);
  if (!subdivision) redirect("/dashboard");

  return (
    <div className="space-y-6">
      <PageHeader title="Budgets" subtitle={subdivision.name} />
      <BudgetPageContent
        subdivisionId={subdivisionId}
        financialYearStartMonth={subdivision.financial_year_start_month}
      />
    </div>
  );
}
