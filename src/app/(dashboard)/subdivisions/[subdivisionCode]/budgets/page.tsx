import { getSubdivision } from "@/lib/actions/subdivision";
import { getCurrentProfile } from "@/lib/auth";
import { redirect } from "next/navigation";
import { BudgetPageContent } from "./budget-page-content";

import { resolveSubdivisionFromCode } from "@/lib/subdivision-resolver";

export default async function BudgetsPage({
  params,
}: {
  params: Promise<{ subdivisionCode: string }>;
}) {
  const { subdivisionCode } = await params;
  const resolved = await resolveSubdivisionFromCode(subdivisionCode);
  if (!resolved) redirect("/dashboard");
  const subdivisionId = resolved.id;
  const [subdivision, profile] = await Promise.all([getSubdivision(subdivisionId), getCurrentProfile()]);
  if (!subdivision) redirect("/dashboard");
  if (profile?.role === "lot_owner") redirect(`/subdivisions/${subdivisionCode}`);

  return (
    <BudgetPageContent
      subdivisionId={subdivisionId}
      financialYearStartMonth={subdivision.financial_year_start_month}
    />
  );
}
