import { getOC } from "@/lib/actions/oc";
import { getCurrentProfile } from "@/lib/auth";
import { getInsurancePolicies } from "@/lib/actions/insurance";
import { getActiveManagementAgreement } from "@/lib/actions/management-transfer";
import { redirect } from "next/navigation";
import { InsuranceTimeline } from "./insurance-timeline";

import { resolveOCFromCode } from "@/lib/oc-resolver";

export default async function InsurancePage({
  params,
}: {
  params: Promise<{ ocCode: string }>;
}) {
  const { ocCode } = await params;
  const resolved = await resolveOCFromCode(ocCode);
  if (!resolved) redirect("/dashboard");
  const ocId = resolved.id;
  const [oc, policies, profile, agreement] = await Promise.all([
    getOC(ocId),
    getInsurancePolicies(ocId),
    getCurrentProfile(),
    getActiveManagementAgreement(ocId),
  ]);

  if (!oc) redirect("/dashboard");

  return (
    <InsuranceTimeline
      ocId={ocId}
      policies={policies}
      readOnly={profile?.role === "lot_owner"}
      managementStartDate={agreement?.start_date ?? null}
      fyStartMonth={oc.financial_year_start_month ?? 7}
    />
  );
}
