import { getSubdivision } from "@/lib/actions/subdivision";
import { redirect } from "next/navigation";
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
    <BudgetPageContent
      subdivisionId={subdivisionId}
      financialYearStartMonth={subdivision.financial_year_start_month}
    />
  );
}
