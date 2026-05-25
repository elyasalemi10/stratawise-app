import { getOC } from "@/lib/actions/oc";
import { getOCBudgets } from "@/lib/actions/budget";
import { getAvailablePeriods, type AvailablePeriod } from "@/lib/actions/levy";
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
  const [oc, budgets] = await Promise.all([
    getOC(ocId),
    getOCBudgets(ocId),
  ]);

  if (!oc) redirect("/dashboard");

  // Only show approved budgets , drafts can't have levies generated against
  // them. Pre-fetch every approved budget's period set in parallel so the
  // period dropdown lights up instantly when the manager picks a budget,
  // no second round trip.
  const approvedBudgets = budgets.filter((b) => b.status === "approved");
  const periodEntries = await Promise.all(
    approvedBudgets.map(async (b) => {
      const periods = await getAvailablePeriods(ocId, b.id);
      return [b.id, periods] as const;
    }),
  );
  const periodsByBudgetId: Record<string, AvailablePeriod[]> = Object.fromEntries(periodEntries);

  return (
    <GenerateLeviesForm
      ocId={ocId}
      budgets={approvedBudgets}
      periodsByBudgetId={periodsByBudgetId}
    />
  );
}
