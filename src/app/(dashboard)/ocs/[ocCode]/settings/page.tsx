import { getOC } from "@/lib/actions/oc";
import { getCurrentProfile } from "@/lib/auth";
import { redirect } from "next/navigation";
import { SettingsContent } from "./settings-content";

import { resolveOCFromCode } from "@/lib/oc-resolver";

export default async function OCSettingsPage({
  params,
}: {
  params: Promise<{ ocCode: string }>;
}) {
  const { ocCode } = await params;
  const resolved = await resolveOCFromCode(ocCode);
  if (!resolved) redirect("/dashboard");
  const ocId = resolved.id;
  const [oc, profile] = await Promise.all([
    getOC(ocId),
    getCurrentProfile(),
  ]);

  if (!oc) redirect("/dashboard");
  if (profile?.role === "lot_owner") redirect(`/ocs/${ocCode}`);

  return (
    <SettingsContent
      oc={{
        id: oc.id,
        name: oc.name,
        address: oc.address,
        plan_number: oc.plan_number,
        status: oc.status,
        oc_tier: oc.oc_tier,
        total_lots: oc.total_lots,
        common_property_description: oc.common_property_description,
        rules_type: oc.rules_type,
        financial_year_start_month: oc.financial_year_start_month,
        billing_cycle: oc.billing_cycle,
        is_developer_period: oc.is_developer_period,
        abn: oc.abn,
        tfn: oc.tfn,
        common_seal_text: oc.common_seal_text ?? null,
        inspection_address: oc.inspection_address ?? null,
      }}
    />
  );
}
