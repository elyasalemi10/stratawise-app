import { getOC } from "@/lib/actions/oc";
import { getCurrentProfile } from "@/lib/auth";
import { redirect } from "next/navigation";
import { SettingsContent } from "./settings-content";
import { ManagementCard } from "./management-card";
import { getActiveManagementAgreement } from "@/lib/actions/management-transfer";

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

  // The active agreement row is the source of truth for "who manages this
  // OC?" , owners_corporations.management_company_id is still maintained
  // as a legacy pointer but the agreement record carries the audit trail.
  const ocMgmtCompanyId = (oc as unknown as { management_company_id: string }).management_company_id;
  const agreement = await getActiveManagementAgreement(ocId);

  return (
    <div className="space-y-6">
      <ManagementCard
        ocId={ocId}
        currentCompanyId={ocMgmtCompanyId}
        agreement={agreement}
      />
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
        // Wizard-redesign additions. Cast since getOC() doesn't yet expose
        // these on its typed return; the schema has them.
        annual_interest_rate_percent: (oc as unknown as { annual_interest_rate_percent?: number | null }).annual_interest_rate_percent ?? 0,
        interest_free_period_days: (oc as unknown as { interest_free_period_days?: number | null }).interest_free_period_days ?? 28,
        early_payment_incentive_percent: (oc as unknown as { early_payment_incentive_percent?: number | null }).early_payment_incentive_percent ?? 0,
        arrears_action_threshold_cents: (oc as unknown as { arrears_action_threshold_cents?: number | null }).arrears_action_threshold_cents ?? 5000,
        levy_calculation_basis: (oc as unknown as { levy_calculation_basis?: string | null }).levy_calculation_basis ?? "lot_liability",
        default_delivery_method: (oc as unknown as { default_delivery_method?: string | null }).default_delivery_method ?? "postal",
        meetings_postal_buffer_days: (oc as unknown as { meetings_postal_buffer_days?: number | null }).meetings_postal_buffer_days ?? 14,
        levies_postal_buffer_days: (oc as unknown as { levies_postal_buffer_days?: number | null }).levies_postal_buffer_days ?? 14,
        financial_postal_buffer_days: (oc as unknown as { financial_postal_buffer_days?: number | null }).financial_postal_buffer_days ?? 14,
      }}
    />
    </div>
  );
}
