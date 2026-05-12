import { getOC } from "@/lib/actions/oc";
import { getCurrentProfile } from "@/lib/auth";
import { getInsurancePolicies } from "@/lib/actions/insurance";
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
  const [oc, policies, profile] = await Promise.all([
    getOC(ocId),
    getInsurancePolicies(ocId),
    getCurrentProfile(),
  ]);

  if (!oc) redirect("/dashboard");

  return (
    <InsuranceTimeline
      ocId={ocId}
      policies={policies}
      readOnly={profile?.role === "lot_owner"}
    />
  );
}
