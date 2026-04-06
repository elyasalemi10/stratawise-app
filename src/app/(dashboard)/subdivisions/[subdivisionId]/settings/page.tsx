import { getSubdivision } from "@/lib/actions/subdivision";
import { getCurrentProfile } from "@/lib/auth";
import { redirect } from "next/navigation";
import { SettingsContent } from "./settings-content";

export default async function SubdivisionSettingsPage({
  params,
}: {
  params: Promise<{ subdivisionId: string }>;
}) {
  const { subdivisionId } = await params;
  const [subdivision, profile] = await Promise.all([
    getSubdivision(subdivisionId),
    getCurrentProfile(),
  ]);

  if (!subdivision) redirect("/dashboard");
  if (profile?.role === "lot_owner") redirect(`/subdivisions/${subdivisionId}/dashboard`);

  return (
    <SettingsContent
      subdivision={{
        id: subdivision.id,
        name: subdivision.name,
        address: subdivision.address,
        plan_number: subdivision.plan_number,
        status: subdivision.status,
        oc_tier: subdivision.oc_tier,
        total_lots: subdivision.total_lots,
        common_property_description: subdivision.common_property_description,
        rules_type: subdivision.rules_type,
        financial_year_start_month: subdivision.financial_year_start_month,
        billing_cycle: subdivision.billing_cycle,
        is_developer_period: subdivision.is_developer_period,
        subdivision_type: subdivision.subdivision_type,
        abn: subdivision.abn,
        tfn: subdivision.tfn,
      }}
    />
  );
}
