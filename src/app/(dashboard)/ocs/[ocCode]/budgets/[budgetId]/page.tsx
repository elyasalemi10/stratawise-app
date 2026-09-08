import { notFound } from "next/navigation";
import { resolveOCFromCode } from "@/lib/oc-resolver";
import { BudgetDetailClient } from "./budget-detail-client";

export default async function BudgetDetailPage({
  params,
}: {
  params: Promise<{ ocCode: string; budgetId: string }>;
}) {
  const { ocCode, budgetId } = await params;
  const resolved = await resolveOCFromCode(ocCode);
  if (!resolved) notFound();


  return <BudgetDetailClient ocId={resolved.id} ocCode={ocCode} budgetId={budgetId} />;
}
