import { getOC } from "@/lib/actions/oc";
import { getOCBudgets } from "@/lib/actions/budget";
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

  // Only show approved budgets
  const approvedBudgets = budgets.filter((b) => b.status === "approved");

  return (
    <GenerateLeviesForm
      ocId={ocId}
      budgets={approvedBudgets}
    />
  );
}
