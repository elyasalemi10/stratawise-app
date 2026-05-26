"use server";

import { requireCompanyRole, requireOCAccess } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";
import { revalidatePath } from "next/cache";

// Auto-send levies = scheduled, cron-driven dispatch of the next levy
// batch for an OC. Manager toggles it on from OC settings → picks the
// budget + day-of-month + mailbox. The cron (separate Trigger.dev job)
// generates the batch and sends it from the chosen mailbox. Arrears, if
// the OC has them enabled, are computed at send-time using the latest
// bank import , per the brief: "Send on schedule, show arrears as of
// last bank import".

export interface LevyAutosendSchedule {
  id: string | null;
  oc_id: string;
  enabled: boolean;
  budget_id: string | null;
  send_day_of_month: number;
  from_address: string | null;
  last_sent_on: string | null;
  next_send_date: string | null;
  last_error: string | null;
}

export async function getLevyAutosendSchedule(
  ocId: string,
): Promise<LevyAutosendSchedule> {
  await requireOCAccess(ocId);
  const supabase = createServerClient();
  const { data } = await supabase
    .from("levy_autosend_schedules")
    .select("id, enabled, budget_id, send_day_of_month, from_address, last_sent_on, next_send_date, last_error")
    .eq("oc_id", ocId)
    .maybeSingle();
  if (!data) {
    // Caller-friendly default so the UI can bind to a complete shape
    // even when the row doesn't exist yet.
    return {
      id: null,
      oc_id: ocId,
      enabled: false,
      budget_id: null,
      send_day_of_month: 1,
      from_address: null,
      last_sent_on: null,
      next_send_date: null,
      last_error: null,
    };
  }
  return { ...(data as Omit<LevyAutosendSchedule, "oc_id">), oc_id: ocId };
}

function monthsPerCycle(cycle: string): number {
  // Maps the OC billing cycle to month gaps. Monthly = 1, quarterly = 3,
  // half = 6, annually = 12. Anything unrecognised falls back to monthly
  // so the cron is conservative (sends more often, not less).
  switch (cycle) {
    case "monthly": return 1;
    case "quarterly": return 3;
    case "half_yearly": return 6;
    case "annually": return 12;
    default: return 1;
  }
}

function nextSendDateFromDay(day: number, todayIso: string, gapMonths = 1, anchor?: string | null): string {
  // Compute the next calendar date matching `day`. If today is on or
  // before `day` AND the manager hasn't set an anchor (last successful
  // send), fire this month. Otherwise step forward by `gapMonths` from
  // the anchor so quarterly/half/annual schedules don't fire monthly.
  const today = new Date(`${todayIso}T00:00:00Z`);
  let targetYear: number;
  let targetMonth: number;

  if (anchor) {
    // Step `gapMonths` from the last successful send so the cadence
    // matches the OC's billing cycle exactly.
    const a = new Date(`${anchor}T00:00:00Z`);
    targetYear = a.getUTCFullYear();
    targetMonth = a.getUTCMonth() + gapMonths;
    while (targetMonth > 11) { targetMonth -= 12; targetYear += 1; }
  } else {
    targetYear = today.getUTCFullYear();
    targetMonth = today.getUTCMonth();
    const d = today.getUTCDate();
    if (day < d) {
      // Already past the chosen day this month , step forward by the
      // cycle length so the cadence is honoured for the very first run.
      targetMonth += gapMonths;
      while (targetMonth > 11) { targetMonth -= 12; targetYear += 1; }
    }
  }

  // Clamp to the month's last day (so day=31 in Feb resolves to 28/29).
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const safeDay = Math.min(day, lastDay);
  const dt = new Date(Date.UTC(targetYear, targetMonth, safeDay));
  return dt.toISOString().slice(0, 10);
}

export async function upsertLevyAutosendSchedule(
  ocId: string,
  input: {
    enabled: boolean;
    budget_id: string | null;
    send_day_of_month: number;
    from_address: string | null;
  },
): Promise<{ error?: string; schedule?: LevyAutosendSchedule }> {
  await requireCompanyRole();
  await requireOCAccess(ocId);

  if (input.enabled) {
    if (!input.budget_id) return { error: "Pick a budget for the auto-send to draw from." };
    if (!input.from_address) return { error: "Pick which mailbox to send from." };
    if (input.send_day_of_month < 1 || input.send_day_of_month > 31) {
      return { error: "Send day must be between 1 and 31." };
    }
  }

  const supabase = createServerClient();
  const today = new Date().toISOString().slice(0, 10);

  // Pull billing_cycle so the schedule honours the OC's chosen cadence
  // (monthly / quarterly / half / annually). Also fetch last_sent_on so
  // we can advance from the last successful run, not from "today".
  const { data: ocRow } = await supabase
    .from("owners_corporations")
    .select("billing_cycle")
    .eq("id", ocId)
    .maybeSingle();
  const billingCycle = (ocRow as { billing_cycle: string } | null)?.billing_cycle ?? "monthly";
  const gap = monthsPerCycle(billingCycle);

  const { data: prior } = await supabase
    .from("levy_autosend_schedules")
    .select("last_sent_on")
    .eq("oc_id", ocId)
    .maybeSingle();
  const anchor = (prior as { last_sent_on: string | null } | null)?.last_sent_on ?? null;

  const nextSend = input.enabled
    ? nextSendDateFromDay(input.send_day_of_month, today, gap, anchor)
    : null;

  const { data, error } = await supabase
    .from("levy_autosend_schedules")
    .upsert(
      {
        oc_id: ocId,
        enabled: input.enabled,
        budget_id: input.budget_id,
        send_day_of_month: input.send_day_of_month,
        from_address: input.from_address,
        next_send_date: nextSend,
        // Clear the last_error whenever the manager touches the
        // schedule , a fresh edit is the manager retrying.
        last_error: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "oc_id" },
    )
    .select("id, enabled, budget_id, send_day_of_month, from_address, last_sent_on, next_send_date, last_error")
    .single();

  if (error || !data) {
    return { error: error?.message ?? "Could not save auto-send schedule." };
  }

  revalidatePath("/ocs/[ocCode]/settings", "page");
  return {
    schedule: { ...(data as Omit<LevyAutosendSchedule, "oc_id">), oc_id: ocId },
  };
}
