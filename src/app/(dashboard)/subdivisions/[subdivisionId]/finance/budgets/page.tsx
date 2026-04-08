import { getSubdivision } from "@/lib/actions/subdivision";
import { getCurrentProfile } from "@/lib/auth";
import { redirect } from "next/navigation";
import { BudgetPageContent } from "./budget-page-content";

export default async function BudgetsPage({
  params,
}: {
  params: Promise<{ subdivisionId: string }>;
}) {
  const { subdivisionId } = await params;
  const [subdivision, profile] = await Promise.all([getSubdivision(subdivisionId), getCurrentProfile()]);
  if (!subdivision) redirect("/dashboard");
  if (profile?.role === "lot_owner") redirect(`/subdivisions/${subdivisionId}/dashboard`);

  return (
    <BudgetPageContent
      subdivisionId={subdivisionId}
      financialYearStartMonth={subdivision.financial_year_start_month}
    />
  );
}
