"use server";

import { getOC } from "@/lib/actions/oc";
import { requireOCAccess } from "@/lib/auth";
import { getActiveManagementAgreement } from "@/lib/actions/management-transfer";
import {
  getLevyAutosendSchedule,
  getBudgetPlannedPeriods,
  type PreviewPeriod,
} from "@/lib/actions/levy-autosend";
import { getOCBudgets } from "@/lib/actions/budget";
import { createServerClient } from "@/lib/supabase";

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

const FUND_LABEL_MAP: Record<string, string> = {
  operating: "Admin Fund",
};

export interface OCSettingsPageData {
  ocMgmtCompanyId: string;
  agreement: Awaited<ReturnType<typeof getActiveManagementAgreement>>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  oc: any;
  autosend: Awaited<ReturnType<typeof getLevyAutosendSchedule>>;
  mailboxOptions: Array<{ value: string; label: string }>;
  approvedBudgets: Array<{ id: string; label: string }>;
  preloadedPeriods: Record<string, PreviewPeriod[]>;
}

export async function getOCSettingsPageData(ocId: string): Promise<OCSettingsPageData> {
  const profile = await requireOCAccess(ocId);
  if (profile.role === "lot_owner") throw new Error("Access denied.");

  const supabase = createServerClient();

  const [oc, autosend, budgets, agreement, { data: primaryManagerRow }] =
    await Promise.all([
      getOC(ocId),
      getLevyAutosendSchedule(ocId),
      getOCBudgets(ocId),
      // The active agreement row is the source of truth for "who manages this
      // OC?" , owners_corporations.management_company_id is still maintained
      // as a legacy pointer but the agreement record carries the audit trail.
      getActiveManagementAgreement(ocId),
      // Mailbox options for the auto-send schedule. Same resolution as the
      // batch detail page so the manager sees real addresses, never provider
      // names.
      supabase
        .from("oc_members")
        .select("profile_id, profiles!inner(email, email_username)")
        .eq("oc_id", ocId)
        .eq("role", "strata_manager")
        .is("left_at", null)
        .order("joined_at", { ascending: true })
        .limit(1)
        .maybeSingle(),
    ]);

  if (!oc) throw new Error("Owners Corporation not found.");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const primaryProf = (primaryManagerRow as any)?.profiles as
    | { email: string | null; email_username: string | null }
    | null;
  const mailboxOptions: Array<{ value: string; label: string }> = [];
  if (primaryProf?.email) {
    mailboxOptions.push({ value: primaryProf.email, label: primaryProf.email });
  }
  if (primaryProf?.email_username) {
    const alias = `${primaryProf.email_username}@stratawise.com.au`;
    if (!mailboxOptions.some((o) => o.value.toLowerCase() === alias.toLowerCase())) {
      mailboxOptions.push({ value: alias, label: alias });
    }
  }
  if (mailboxOptions.length === 0) {
    mailboxOptions.push({
      value: "noreply@stratawise.com.au",
      label: "noreply@stratawise.com.au",
    });
  }

  const approvedBudgets = budgets
    .filter((b) => b.status === "approved")
    .map((b) => {
      const funds = b.fund_types?.length ? b.fund_types : b.fund_type ? [b.fund_type] : [];
      const fundLabel = funds.length
        ? funds.map((f) => FUND_LABEL_MAP[f] ?? f).join(" + ")
        : "Budget";
      return { id: b.id, label: `${fundLabel} , ${b.financial_year}` };
    });

  // Pre-load the FY-aligned periods + done flags for every approved budget so
  // the auto-send drawer's schedule step renders instantly when the manager
  // picks a budget. Uses the schedule's saved send_day_of_month; falls back to
  // 1 for un-configured automations. The drawer still refreshes on send_day
  // changes via its own effect.
  const preloadDay =
    autosend.send_day_of_month && autosend.send_day_of_month >= 1
      ? autosend.send_day_of_month
      : 1;
  const preloadedPairs = await Promise.all(
    approvedBudgets.map(async (b) => {
      const res = await getBudgetPlannedPeriods(ocId, b.id, preloadDay);
      return [b.id, res.periods] as const;
    }),
  );

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
    mailboxOptions,
    approvedBudgets,
    preloadedPeriods: Object.fromEntries(preloadedPairs),
  };
}
