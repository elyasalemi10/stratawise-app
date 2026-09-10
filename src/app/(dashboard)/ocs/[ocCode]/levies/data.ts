"use server";

import { getLevyBatches } from "@/lib/actions/levy";
import { requireOCAccess } from "@/lib/auth";
import { getOC } from "@/lib/actions/oc";
import { listManagerInboxes } from "@/lib/actions/manager-username";
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

  const [batches, oc, autosend, budgets, inboxes] = await Promise.all([
    getLevyBatches(ocId),
    getOC(ocId),
    getLevyAutosendSchedule(ocId),
    getOCBudgets(ocId),
    // Mailboxes we can actually send AS: the firm's connected Gmail
    // subscriptions plus the manager's permanent StrataWise alias.
    //
    // This used to read profiles.email, which is whatever address the
    // manager signed up with. We do not own that domain and it is not a
    // connected mailbox, so offering it as a From meant either a message
    // that fails the recipient's SPF check or one that silently goes out as
    // something else. Same list the lot email composer uses, so there is one
    // answer to what this firm can send as.
    listManagerInboxes(),
  ]);

  const mailboxOptions = inboxes.map((i) => ({ value: i.email, label: i.email }));
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

  // What is still to run, decided against the batches that actually exist
  // rather than against planned_periods, which is a snapshot written when
  // the schedule was saved and only refreshed by the cron. Issue Q1 by hand
  // and the page kept offering to issue it again until the next nightly run.
  const selected = autosend.budget_id
    ? Object.fromEntries(preloadedPairs)[autosend.budget_id]
    : undefined;
  const upcoming = (selected ?? [])
    .filter((p) => !p.done)
    .map((p) => ({
      monthKey: p.monthKey,
      plannedDate: autosend.date_overrides?.[p.monthKey] ?? p.plannedDate,
    }));

  return {
    schedule: {
      schedule: autosend,
      upcoming,
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
