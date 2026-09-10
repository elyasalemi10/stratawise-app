"use server";

import { getOC } from "@/lib/actions/oc";
import { requireOCAccess } from "@/lib/auth";
import { getActiveManagementAgreement } from "@/lib/actions/management-transfer";
import { getLevyAutosendSchedule } from "@/lib/actions/levy-autosend";

// One aggregate fetch for the OC settings page.
//
// This used to run four deep: a four-way Promise.all, then the management
// agreement, then the primary-manager lookup, then one getBudgetPlannedPeriods
// per approved budget. Only the last of those genuinely depends on what came
// before (it needs the budget list and the saved send day), so the first three
// waves collapse into one.
//
// The auth check lives here, not in page.tsx: page.tsx only runs on the
// initial shell request, so a check left up there would be skipped on every
// refresh the client drives afterwards.

export interface OCSettingsPageData {
  ocMgmtCompanyId: string;
  agreement: Awaited<ReturnType<typeof getActiveManagementAgreement>>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  oc: any;
  autosend: Awaited<ReturnType<typeof getLevyAutosendSchedule>>;
}

export async function getOCSettingsPageData(ocId: string): Promise<OCSettingsPageData> {
  const profile = await requireOCAccess(ocId);
  if (profile.role === "lot_owner") throw new Error("Access denied.");

  const [oc, autosend, agreement] =
    await Promise.all([
      getOC(ocId),
      // Read-only here: the page reports whether levies are scheduled and
      // links to where that is decided. The editor, its budget list and its
      // per-budget period walk (one round trip per approved budget, on every
      // settings load) all moved to the Levies page with it.
      getLevyAutosendSchedule(ocId),
      // The active agreement row is the source of truth for "who manages this
      // OC?" , owners_corporations.management_company_id is still maintained
      // as a legacy pointer but the agreement record carries the audit trail.
      getActiveManagementAgreement(ocId),
    ]);

  if (!oc) throw new Error("Owners Corporation not found.");

  return {
    ocMgmtCompanyId: (oc as unknown as { management_company_id: string })
      .management_company_id,
    agreement,
    oc: {
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
        include_arrears_on_notice: (oc as unknown as { include_arrears_on_notice?: boolean | null }).include_arrears_on_notice ?? false,
        multilot_note_enabled: (oc as unknown as { multilot_note_enabled?: boolean | null }).multilot_note_enabled ?? true,
        multilot_note_text: (oc as unknown as { multilot_note_text?: string | null }).multilot_note_text ?? null,
        bank_bsb: (oc as unknown as { bank_bsb?: string | null }).bank_bsb ?? null,
        bank_account_number: (oc as unknown as { bank_account_number?: string | null }).bank_account_number ?? null,
        bank_account_name: (oc as unknown as { bank_account_name?: string | null }).bank_account_name ?? null,
    },
    autosend,
  };
}
