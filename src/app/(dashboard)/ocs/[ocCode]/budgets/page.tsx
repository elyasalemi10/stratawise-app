import { getOC } from "@/lib/actions/oc";
import { getCurrentProfile } from "@/lib/auth";
import { redirect } from "next/navigation";
import { BudgetPageContent } from "./budget-page-content";

import { resolveOCFromCode } from "@/lib/oc-resolver";

export default async function BudgetsPage({
  params,
}: {
  params: Promise<{ ocCode: string }>;
}) {
  const { ocCode } = await params;
  const resolved = await resolveOCFromCode(ocCode);
  if (!resolved) redirect("/dashboard");
  const ocId = resolved.id;
  const [oc, profile] = await Promise.all([getOC(ocId), getCurrentProfile()]);
  if (!oc) redirect("/dashboard");
  if (profile?.role === "lot_owner") redirect(`/ocs/${ocCode}`);

  return (
    <BudgetPageContent
      ocId={ocId}
      financialYearStartMonth={oc.financial_year_start_month}
    />
  );
}
