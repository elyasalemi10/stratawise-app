import { getSubdivision } from "@/lib/actions/subdivision";
import { getCurrentProfile } from "@/lib/auth";
import { getInsurancePolicies } from "@/lib/actions/insurance";
import { redirect } from "next/navigation";
import { InsuranceTimeline } from "./insurance-timeline";

export default async function InsurancePage({
  params,
}: {
  params: Promise<{ subdivisionId: string }>;
}) {
  const { subdivisionId } = await params;
  const [subdivision, policies, profile] = await Promise.all([
    getSubdivision(subdivisionId),
    getInsurancePolicies(subdivisionId),
    getCurrentProfile(),
  ]);

  if (!subdivision) redirect("/dashboard");

  return (
    <InsuranceTimeline
      subdivisionId={subdivisionId}
      policies={policies}
      readOnly={profile?.role === "lot_owner"}
    />
  );
}
