import { getSubdivision } from "@/lib/actions/subdivision";
import { redirect } from "next/navigation";
import { CreateBudgetForm } from "./create-budget-form";
import { getBudgetCategories } from "@/lib/actions/budget";

export default async function CreateBudgetPage({
  params,
}: {
  params: Promise<{ subdivisionId: string }>;
}) {
  const { subdivisionId } = await params;
  const [subdivision, categories] = await Promise.all([
    getSubdivision(subdivisionId),
    getBudgetCategories(),
  ]);

  if (!subdivision) redirect("/dashboard");

  // Calculate current financial year
  const now = new Date();
  const fyStartMonth = subdivision.financial_year_start_month ?? 7;
  const currentYear = now.getFullYear();
  const fyStartYear = now.getMonth() + 1 >= fyStartMonth ? currentYear : currentYear - 1;
  const financialYear = `${fyStartYear}-${fyStartYear + 1}`;

  return (
    <CreateBudgetForm
      subdivisionId={subdivisionId}
      categories={categories}
      financialYear={financialYear}
    />
  );
}
