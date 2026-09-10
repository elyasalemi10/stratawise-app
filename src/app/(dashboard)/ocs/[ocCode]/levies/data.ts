"use server";

import { getLevyBatches } from "@/lib/actions/levy";
import { requireOCAccess } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";
import { getOC } from "@/lib/actions/oc";
import { getOCBudgets } from "@/lib/actions/budget";
import {
  getBudgetPlannedPeriods,
  getLevyAutosendSchedule,
} from "@/lib/actions/levy-autosend";
import type { LevyBatchRow } from "./levies-table";

/** Same one-entry map the settings page used. `operating` is the only fund
 *  a budget can be levied from today. */
const FUND_LABEL_MAP: Record<string, string> = {
  operating: "Admin Fund",
};
import type { LevyScheduleData } from "./levy-schedule";

export interface LeviesPageData {
  batches: LevyBatchRow[];
  /** The schedule that produces those batches. It used to be fetched by the
   *  settings page, which is where it used to be edited. */
  schedule: LevyScheduleData;
}

export async function getLeviesPageData(ocId: string): Promise<LeviesPageData> {
  await requireOCAccess(ocId);
  const supabase = createServerClient();

  const [batches, oc, autosend, budgets, { data: primaryManagerRow }] =
    await Promise.all([
      getLevyBatches(ocId),
      getOC(ocId),
      getLevyAutosendSchedule(ocId),
      getOCBudgets(ocId),
      // Real mailbox addresses, resolved the same way the batch detail page
      // does it, so nothing here ever names a provider.
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

  // The FY-aligned periods for every approved budget, so the editor's
  // schedule step paints without a round trip when the manager picks one.
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
    schedule: {
      schedule: autosend,
      billingCycle:
        (oc as unknown as { billing_cycle?: string } | null)?.billing_cycle ?? "quarterly",
      fyStartMonth:
        (oc as unknown as { financial_year_start_month?: number } | null)
          ?.financial_year_start_month ?? 7,
      mailboxOptions,
      budgets: approvedBudgets,
      preloadedPeriods: Object.fromEntries(preloadedPairs),
    },
    batches: batches.map((b) => ({
      id: b.id,
      short_code: (b as { short_code?: string | null }).short_code ?? null,
      financial_year: b.financial_year,
      fund_type: b.fund_type,
      period_label: b.period_label,
      due_date: b.due_date,
      total_amount: b.total_amount,
      status: b.status,
      is_special: b.is_special,
    })),
  };
}
