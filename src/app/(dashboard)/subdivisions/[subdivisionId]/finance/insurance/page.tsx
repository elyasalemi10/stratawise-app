import { getSubdivision } from "@/lib/actions/subdivision";
import { getInsurancePolicies } from "@/lib/actions/insurance";
import { redirect } from "next/navigation";
import { InsuranceTimeline } from "./insurance-timeline";

export default async function InsurancePage({
  params,
}: {
  params: Promise<{ subdivisionId: string }>;
}) {
  const { subdivisionId } = await params;
  const [subdivision, policies] = await Promise.all([
    getSubdivision(subdivisionId),
    getInsurancePolicies(subdivisionId),
  ]);

  if (!subdivision) redirect("/dashboard");

  return (
    <InsuranceTimeline
      subdivisionId={subdivisionId}
      policies={policies}
    />
  );
}
