"use server";

import { requireCompanyRole, requireOCAccess } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";
import { revalidatePath } from "next/cache";
import { nextSendDateFromSchedule } from "@/lib/levy-autosend-helpers";

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
  /** Per-month overrides keyed by "YYYY-MM" -> "YYYY-MM-DD". The
   *  override date must fall in the same month bucket as the key. */
  date_overrides: Record<string, string>;
}

export async function getLevyAutosendSchedule(
  ocId: string,
): Promise<LevyAutosendSchedule> {
  await requireOCAccess(ocId);
  const supabase = createServerClient();
  const { data } = await supabase
    .from("levy_autosend_schedules")
    .select("id, enabled, budget_id, send_day_of_month, from_address, last_sent_on, next_send_date, last_error, date_overrides")
    .eq("oc_id", ocId)
    .maybeSingle();
  if (!data) {
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
      date_overrides: {},
    };
  }
  return {
    ...(data as Omit<LevyAutosendSchedule, "oc_id" | "date_overrides">),
    oc_id: ocId,
    date_overrides: ((data as { date_overrides?: Record<string, string> }).date_overrides ?? {}) as Record<string, string>,
  };
}

// buildPlannedSends lives in @/lib/levy-autosend-helpers (it's a pure
// helper used by both server actions and client UI; can't sit in a
// "use server" file because non-async exports there are rejected).

// Save per-month overrides to the schedule. Validates each entry is
// inside the same calendar month as its key. Used by the schedule
// popup after the manager edits planned dates.
export async function updateAutosendOverrides(
  ocId: string,
  overrides: Record<string, string>,
): Promise<{ error?: string }> {
  await requireCompanyRole();
  await requireOCAccess(ocId);

  for (const [key, val] of Object.entries(overrides)) {
    if (!/^\d{4}-\d{2}$/.test(key)) return { error: `Bad month key: ${key}` };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(val)) return { error: `Bad date for ${key}: ${val}` };
    if (!val.startsWith(key)) {
      return { error: `Override for ${key} must be a date in that same month (got ${val}).` };
    }
  }

  const supabase = createServerClient();
  const { error } = await supabase
    .from("levy_autosend_schedules")
    .update({ date_overrides: overrides, updated_at: new Date().toISOString() })
    .eq("oc_id", ocId);
  if (error) return { error: error.message };
  revalidatePath("/ocs/[ocCode]/settings", "page");
  return {};
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
      return { error: "Send day must be between 1 and 28, or 31 for last day of month." };
    }
    // 29 and 30 cause month-skip surprises (Feb has 28/29), so the UI
    // caps the input at 28 and uses 31 as the sentinel for "last day
    // of month" (which the cron clamps per-month).
    if (input.send_day_of_month > 28 && input.send_day_of_month !== 31) {
      return { error: "Pick a day between 1 and 28, or 'Last day of month'." };
    }
  }

  const supabase = createServerClient();
  const today = new Date().toISOString().slice(0, 10);

  // Pull billing_cycle + FY start month so the schedule honours the
  // OC's cadence AND aligns to its financial-year quarters (so an OC
  // on FY July quarterly fires on Jul/Oct/Jan/Apr, not calendar months).
  const { data: ocRow } = await supabase
    .from("owners_corporations")
    .select("billing_cycle, financial_year_start_month")
    .eq("id", ocId)
    .maybeSingle();
  const billingCycle = (ocRow as { billing_cycle: string } | null)?.billing_cycle ?? "monthly";
  const fyStartMonth = (ocRow as { financial_year_start_month: number } | null)?.financial_year_start_month ?? 7;

  const nextSend = input.enabled
    ? nextSendDateFromSchedule(input.send_day_of_month, billingCycle, today, fyStartMonth)
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
    .select("id, enabled, budget_id, send_day_of_month, from_address, last_sent_on, next_send_date, last_error, date_overrides")
    .single();

  if (error || !data) {
    return { error: error?.message ?? "Could not save auto-send schedule." };
  }

  revalidatePath("/ocs/[ocCode]/settings", "page");
  return {
    schedule: {
      ...(data as Omit<LevyAutosendSchedule, "oc_id" | "date_overrides">),
      oc_id: ocId,
      date_overrides: ((data as { date_overrides?: Record<string, string> }).date_overrides ?? {}) as Record<string, string>,
    },
  };
}
