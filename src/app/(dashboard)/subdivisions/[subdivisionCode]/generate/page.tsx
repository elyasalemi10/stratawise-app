import { getSubdivision } from "@/lib/actions/subdivision";
import { getSubdivisionBudgets } from "@/lib/actions/budget";
import { redirect } from "next/navigation";
import { GenerateLeviesForm } from "./generate-levies-form";

import { resolveSubdivisionFromCode } from "@/lib/subdivision-resolver";

export default async function GenerateLeviesPage({
  params,
}: {
  params: Promise<{ subdivisionCode: string }>;
}) {
  const { subdivisionCode } = await params;
  const resolved = await resolveSubdivisionFromCode(subdivisionCode);
  if (!resolved) redirect("/dashboard");
  const subdivisionId = resolved.id;
  const [subdivision, budgets] = await Promise.all([
    getSubdivision(subdivisionId),
    getSubdivisionBudgets(subdivisionId),
  ]);

  if (!subdivision) redirect("/dashboard");

  // Only show approved budgets
  const approvedBudgets = budgets.filter((b) => b.status === "approved");

  return (
    <GenerateLeviesForm
      subdivisionId={subdivisionId}
      budgets={approvedBudgets}
    />
  );
}
