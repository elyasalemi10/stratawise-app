import "server-only";

import { createServerClient } from "@/lib/supabase";
import {
  generateLevyPreview,
  createLevyBatch,
  markBatchSent,
  sendBatchEmailsCustom,
} from "@/lib/actions/levy";
import { nextSendDateFromSchedule } from "@/lib/levy-autosend-helpers";
import type { PlannedPeriod } from "@/lib/actions/levy-autosend";

// ─── Auto-send runner ──────────────────────────────────────────────
// Called from the Trigger.dev daily cron for every levy_autosend_schedule
// whose next_send_date is today or earlier. Does the full
// "generate → mark sent → send emails" cycle that a manager would do
// manually through the dashboard.
//
// Auth-bypass: the underlying server actions (createLevyBatch /
// markBatchSent / sendBatchEmailsCustom / generateLevyPreview) all
// accept an internal `_systemPerformerId` / `_systemBypass` option that
// skips the Clerk-based session check. The performer is resolved from
// the schedule's `created_by` (the manager who set the automation up),
// so the audit log still attributes the writes to a real person.

export interface AutosendRunResult {
  scheduleId: string;
  status: "fired" | "no_pending" | "not_yet" | "already_done" | "error";
  reason?: string;
  batchId?: string;
  periodIndex?: number;
}

export async function runAutosendForSchedule(
  scheduleId: string,
  todayIso: string,
): Promise<AutosendRunResult> {
  const supabase = createServerClient();

  // ── 1. Load schedule + OC + budget ──
  const { data: schedule, error: scheduleErr } = await supabase
    .from("levy_autosend_schedules")
    .select(
      "id, oc_id, budget_id, send_day_of_month, from_address, planned_periods, date_overrides, created_by",
    )
    .eq("id", scheduleId)
    .maybeSingle();
  if (scheduleErr || !schedule) {
    return { scheduleId, status: "error", reason: scheduleErr?.message ?? "schedule not found" };
  }

  const performerId = (schedule as { created_by: string | null }).created_by;
  if (!performerId) {
    return { scheduleId, status: "error", reason: "schedule has no created_by; cannot resolve performer" };
  }
  const budgetId = (schedule as { budget_id: string | null }).budget_id;
  if (!budgetId) return { scheduleId, status: "error", reason: "schedule has no budget_id" };

  const ocId = (schedule as { oc_id: string }).oc_id;
  const fromAddress = (schedule as { from_address: string | null }).from_address ?? undefined;
  const planned = ((schedule as { planned_periods: PlannedPeriod[] }).planned_periods ?? []) as PlannedPeriod[];
  const overrides = ((schedule as { date_overrides: Record<string, string> }).date_overrides ?? {}) as Record<string, string>;

  // ── 2. Sync planned_periods.status with existing batches ──
  // The manager might have manually generated some quarters between
  // cron runs; pick those up so we never double-issue.
  const { data: existingBatches } = await supabase
    .from("levy_batches")
    .select("id, period_start, status")
    .eq("budget_id", budgetId);
  const batchByStart = new Map<string, { id: string; status: string }>();
  for (const b of existingBatches ?? []) {
    const status = (b as { status: string }).status;
    if (status === "cancelled") continue;
    batchByStart.set((b as { period_start: string }).period_start, {
      id: (b as { id: string }).id,
      status,
    });
  }
  let plannedDirty = false;
  for (const p of planned) {
    if (p.status === "pending") {
      const existing = batchByStart.get(p.periodStart);
      if (existing) {
        p.status = "done";
        p.batchId = existing.id;
        plannedDirty = true;
      }
    }
  }

  // ── 3. Find next pending period eligible to fire today ──
  // Allow per-month overrides , the manager may have moved this
  // quarter's send date a few days earlier/later.
  const nextPending = planned.find((p) => {
    if (p.status !== "pending") return false;
    const effective = overrides[p.monthKey] ?? p.plannedDate;
    return effective <= todayIso;
  });

  if (!nextPending) {
    // Could be:
    //   - All periods done → schedule complete for this budget
    //   - No pending period <= today → cron ran ahead of schedule
    // Either way, push next_send_date forward to the next pending one's
    // planned date (or null if everything's done).
    const nextFuture = planned.find((p) => p.status === "pending");
    const nextDate = nextFuture
      ? (overrides[nextFuture.monthKey] ?? nextFuture.plannedDate)
      : null;
    await supabase
      .from("levy_autosend_schedules")
      .update({
        planned_periods: planned,
        next_send_date: nextDate,
        updated_at: new Date().toISOString(),
      })
      .eq("id", scheduleId);
    return {
      scheduleId,
      status: nextFuture ? "not_yet" : "already_done",
      reason: nextFuture ? `next run on ${nextDate}` : "all periods done for this budget",
    };
  }

  // ── 4. Compute the preview + create the batch ──
  const preview = await generateLevyPreview(
    ocId,
    budgetId,
    nextPending.periodIndex,
    { _systemBypass: true },
  );
  if (preview.error || !preview.data) {
    return { scheduleId, status: "error", reason: preview.error ?? "preview returned no data" };
  }

  const create = await createLevyBatch(ocId, {
    budget_id: budgetId,
    financial_year: preview.data.financial_year,
    fund_type: preview.data.fund_type,
    period_label: preview.data.period_label,
    period_start: preview.data.period_start,
    period_end: preview.data.period_end,
    due_date: preview.data.due_date,
    lots: preview.data.lots.map((l) => ({
      lot_id: l.lot_id,
      amount: l.base_amount,
      items: l.items.map((it) => ({
        description: it.description,
        amount: it.amount,
        budget_item_id: it.budget_item_id,
        is_adjustment: false,
        coa_account_id: it.coa_account_id ?? null,
      })),
    })),
    _systemPerformerId: performerId,
  });
  if (create.error || !create.batchId) {
    return { scheduleId, status: "error", reason: create.error ?? "createLevyBatch returned no id" };
  }

  // ── 5. Mark batch sent + dispatch emails ──
  await markBatchSent(ocId, create.batchId, { _systemPerformerId: performerId });

  const send = await sendBatchEmailsCustom(ocId, create.batchId, {
    fromAddress,
    _systemPerformerId: performerId,
  });
  if (send.error) {
    // Batch was created successfully; emails failed. Don't unwind , the
    // manager can resend from the batch detail page. Surface the error
    // back to the cron caller so it lands in last_error.
    return {
      scheduleId,
      status: "error",
      batchId: create.batchId,
      periodIndex: nextPending.periodIndex,
      reason: `batch created but email send failed: ${send.error}`,
    };
  }

  // ── 6. Persist: mark this period done, advance next_send_date ──
  nextPending.status = "done";
  nextPending.batchId = create.batchId;
  plannedDirty = true;
  void plannedDirty; // satisfy noUnusedLocals
  const nextFuture = planned.find((p) => p.status === "pending");
  const nextDate = nextFuture
    ? (overrides[nextFuture.monthKey] ?? nextFuture.plannedDate)
    : null;

  // Fallback FY-aligned compute when planned_periods is empty (legacy
  // schedules that pre-date the planned_periods column).
  let resolvedNextDate = nextDate;
  if (!resolvedNextDate && planned.length === 0) {
    const { data: oc } = await supabase
      .from("owners_corporations")
      .select("billing_cycle, financial_year_start_month")
      .eq("id", ocId)
      .maybeSingle();
    const billingCycle = (oc as { billing_cycle: string } | null)?.billing_cycle ?? "monthly";
    const fyStartMonth = (oc as { financial_year_start_month: number } | null)?.financial_year_start_month ?? 7;
    const sendDay = (schedule as { send_day_of_month: number }).send_day_of_month;
    const tomorrow = new Date(`${todayIso}T00:00:00Z`);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    resolvedNextDate = nextSendDateFromSchedule(sendDay, billingCycle, tomorrow.toISOString().slice(0, 10), fyStartMonth);
  }

  await supabase
    .from("levy_autosend_schedules")
    .update({
      planned_periods: planned,
      last_sent_on: todayIso,
      next_send_date: resolvedNextDate,
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", scheduleId);

  return {
    scheduleId,
    status: "fired",
    batchId: create.batchId,
    periodIndex: nextPending.periodIndex,
  };
}
