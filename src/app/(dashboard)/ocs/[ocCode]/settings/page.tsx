import { getOC } from "@/lib/actions/oc";
import { getCurrentProfile } from "@/lib/auth";
import { redirect } from "next/navigation";
import { SettingsContent } from "./settings-content";
import { ManagementCard } from "./management-card";
import { getActiveManagementAgreement } from "@/lib/actions/management-transfer";
import { getLevyAutosendSchedule, getBudgetPlannedPeriods, type PreviewPeriod } from "@/lib/actions/levy-autosend";
import { getOCBudgets } from "@/lib/actions/budget";
import { createServerClient } from "@/lib/supabase";

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
  const [oc, profile, autosend, budgets] = await Promise.all([
    getOC(ocId),
    getCurrentProfile(),
    getLevyAutosendSchedule(ocId),
    getOCBudgets(ocId),
  ]);

  if (!oc) redirect("/dashboard");
  if (profile?.role === "lot_owner") redirect(`/ocs/${ocCode}`);

  // The active agreement row is the source of truth for "who manages this
  // OC?" , owners_corporations.management_company_id is still maintained
  // as a legacy pointer but the agreement record carries the audit trail.
  const ocMgmtCompanyId = (oc as unknown as { management_company_id: string }).management_company_id;
  const agreement = await getActiveManagementAgreement(ocId);

  // Mailbox options for the auto-send schedule. Same resolution as the
  // batch detail page so the manager sees real addresses, never provider
  // names.
  const supabase = createServerClient();
  const { data: primaryManagerRow } = await supabase
    .from("oc_members")
    .select("profile_id, profiles!inner(email, email_username)")
    .eq("oc_id", ocId)
    .eq("role", "strata_manager")
    .is("left_at", null)
    .order("joined_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const primaryProf = (primaryManagerRow as any)?.profiles as { email: string | null; email_username: string | null } | null;
  const mailboxOptions: Array<{ value: string; label: string }> = [];
  if (primaryProf?.email) mailboxOptions.push({ value: primaryProf.email, label: primaryProf.email });
  if (primaryProf?.email_username) {
    const alias = `${primaryProf.email_username}@stratawise.com.au`;
    if (!mailboxOptions.some((o) => o.value.toLowerCase() === alias.toLowerCase())) {
      mailboxOptions.push({ value: alias, label: alias });
    }
  }
  if (mailboxOptions.length === 0) mailboxOptions.push({ value: "noreply@stratawise.com.au", label: "noreply@stratawise.com.au" });

  const FUND_LABEL_MAP: Record<string, string> = {
    administrative: "Administrative Fund",
    capital_works: "Capital Works Fund",
    maintenance_plan: "Maintenance Plan Fund",
  };
  const approvedBudgets = budgets
    .filter((b) => b.status === "approved")
    .map((b) => {
      const funds = b.fund_types?.length ? b.fund_types : (b.fund_type ? [b.fund_type] : []);
      const fundLabel = funds.length ? funds.map((f) => FUND_LABEL_MAP[f] ?? f).join(" + ") : "Budget";
      return { id: b.id, label: `${fundLabel} , ${b.financial_year}` };
    });

  // Pre-load the FY-aligned periods + done flags for every approved
  // budget so the auto-send drawer's schedule step renders instantly
  // when the manager picks a budget (no shimmer if the cache hit hits).
  // Uses the schedule's saved send_day_of_month as the day; falls back
  // to 1 for un-configured automations. The drawer still refreshes on
  // send_day changes via its own useEffect.
  const preloadDay = autosend.send_day_of_month && autosend.send_day_of_month >= 1
    ? autosend.send_day_of_month
    : 1;
  const preloadedPairs = await Promise.all(
    approvedBudgets.map(async (b) => {
      const res = await getBudgetPlannedPeriods(ocId, b.id, preloadDay);
      return [b.id, res.periods] as const;
    }),
  );
  const preloadedPeriods: Record<string, PreviewPeriod[]> = Object.fromEntries(preloadedPairs);

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
        include_arrears_on_notice: (oc as unknown as { include_arrears_on_notice?: boolean | null }).include_arrears_on_notice ?? false,
        multilot_note_enabled: (oc as unknown as { multilot_note_enabled?: boolean | null }).multilot_note_enabled ?? true,
        multilot_note_text: (oc as unknown as { multilot_note_text?: string | null }).multilot_note_text ?? null,
        bank_bsb: (oc as unknown as { bank_bsb?: string | null }).bank_bsb ?? null,
        bank_account_number: (oc as unknown as { bank_account_number?: string | null }).bank_account_number ?? null,
        bank_account_name: (oc as unknown as { bank_account_name?: string | null }).bank_account_name ?? null,
      }}
      autosend={autosend}
      autosendMailboxOptions={mailboxOptions}
      autosendBudgets={approvedBudgets}
      autosendPreloadedPeriods={preloadedPeriods}
    />
    </div>
  );
}
