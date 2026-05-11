// ============================================================================
// Overdue-levy check job — framework-agnostic
// ----------------------------------------------------------------------------
// Same rules as src/lib/accrual/jobs.ts:
//   - NO "use server" directive
//   - NO imports from next/cache, @clerk/*, @/lib/auth
//
// Eligibility (PP6-C-1 step 1): a levy_notice qualifies for the friendly
// reminder when, on the cron's runDate:
//   - due_date + 14 days === runDate (exact match — single-day window)
//   - status IN ('issued','partially_paid','overdue')
//   - levy_type <> 'penalty_interest'
//   - amount - amount_paid > 0
//   - no escalation_instances row exists for this levy yet
//
// Side effects per qualifying levy:
//   - communication_log row inserted (status='queued' → 'sent' on success)
//   - sendOverdueReminderEmail invoked (respects EMAIL_DRY_RUN)
//   - escalation_instances row inserted with current_step=1 +
//     next_action_at=due_date+28d (dormant if PP6-C-3 escalation engine
//     doesn't ship; provides the per-levy idempotency sentinel either way)
//   - audit_log row written
//
// Body bundles "Interest accrued" line when penalty_interest levy_notices
// linked to this parent exist with outstanding > 0.
// ============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  sendOverdueReminderEmail,
  type SendOverdueReminderEmailParams,
} from "@/lib/email";
import { isNotificationOptedOut, resolveCompanyLogo } from "@/lib/notifications";

const NOTIFICATION_TYPE = "overdue_reminder";
const DEFAULT_WORKFLOW_NAME = "Standard Overdue Levy";

export type OverdueCheckOutcome =
  | "sent"
  | "skipped_already_escalated"
  | "skipped_opted_out"
  | "skipped_no_owner"
  | "skipped_dry_run"
  | "failed";

export interface OverdueCheckResult {
  processed: number;
  sent: number;
  skipped: number;
  errors: number;
  perLevy: Array<{ levyId: string; outcome: OverdueCheckOutcome; detail?: string }>;
}

export interface OverdueCheckInput {
  runDate: string;            // 'YYYY-MM-DD' — usually AEST/AEDT-derived
  systemProfileId: string;
  supabase: SupabaseClient;
}

export async function checkOverdueLeviesJob(
  input: OverdueCheckInput,
): Promise<OverdueCheckResult> {
  const { runDate, systemProfileId, supabase } = input;
  const result: OverdueCheckResult = {
    processed: 0,
    sent: 0,
    skipped: 0,
    errors: 0,
    perLevy: [],
  };

  // ─── Resolve default escalation workflow id (per-cron-run lookup) ───
  const { data: workflowRow } = await supabase
    .from("escalation_workflows")
    .select("id")
    .eq("name", DEFAULT_WORKFLOW_NAME)
    .eq("is_default", true)
    .maybeSingle();
  const workflowId = (workflowRow as { id: string } | null)?.id;
  if (!workflowId) {
    throw new Error(
      `checkOverdueLeviesJob: default escalation workflow '${DEFAULT_WORKFLOW_NAME}' not found`,
    );
  }

  // ─── Compute target due_date = runDate - 14 days ──────────────────
  const targetDueDate = subtractDaysIso(runDate, 14);

  // ─── Query eligible levies ────────────────────────────────────────
  const { data: leviesData, error: leviesErr } = await supabase
    .from("levy_notices")
    .select(
      "id, lot_id, subdivision_id, fund_type, reference_number, amount, amount_paid, due_date",
    )
    .eq("due_date", targetDueDate)
    .in("status", ["issued", "partially_paid", "overdue"])
    .neq("levy_type", "penalty_interest");

  if (leviesErr) {
    throw new Error(
      `checkOverdueLeviesJob: levy_notices query failed: ${leviesErr.message}`,
    );
  }

  const allEligible = (leviesData ?? []) as Array<{
    id: string;
    lot_id: string;
    subdivision_id: string;
    fund_type: "administrative" | "capital_works";
    reference_number: string;
    amount: number | string;
    amount_paid: number | string;
    due_date: string;
  }>;

  if (allEligible.length === 0) return result;

  // ─── Filter out already-escalated levies (per-levy idempotency) ───
  const eligibleIds = allEligible.map((l) => l.id);
  const { data: existingRows } = await supabase
    .from("escalation_instances")
    .select("levy_notice_id")
    .in("levy_notice_id", eligibleIds);
  const alreadyEscalated = new Set(
    (existingRows ?? []).map(
      (r) => (r as { levy_notice_id: string }).levy_notice_id,
    ),
  );

  const toProcess = allEligible.filter((l) => !alreadyEscalated.has(l.id));
  result.processed = toProcess.length;

  // Already-escalated rows still count as a "skipped" telemetry event so
  // the cron's aggregate-audit row reflects them.
  for (const l of allEligible) {
    if (alreadyEscalated.has(l.id)) {
      result.skipped += 1;
      result.perLevy.push({
        levyId: l.id,
        outcome: "skipped_already_escalated",
      });
    }
  }

  // ─── Per-levy processing ───────────────────────────────────────────
  for (const levy of toProcess) {
    try {
      const outcome = await processOverdueLevy({
        levy,
        runDate,
        workflowId,
        systemProfileId,
        supabase,
      });
      result.perLevy.push({ levyId: levy.id, outcome });
      if (outcome === "sent") result.sent += 1;
      else if (outcome === "failed") result.errors += 1;
      else result.skipped += 1;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(
        `checkOverdueLeviesJob: unhandled error processing levy ${levy.id}:`,
        msg,
      );
      result.errors += 1;
      result.perLevy.push({
        levyId: levy.id,
        outcome: "failed",
        detail: msg,
      });
    }
  }

  return result;
}

interface ProcessLevyContext {
  levy: {
    id: string;
    lot_id: string;
    subdivision_id: string;
    fund_type: "administrative" | "capital_works";
    reference_number: string;
    amount: number | string;
    amount_paid: number | string;
    due_date: string;
  };
  runDate: string;
  workflowId: string;
  systemProfileId: string;
  supabase: SupabaseClient;
}

async function processOverdueLevy(
  ctx: ProcessLevyContext,
): Promise<OverdueCheckOutcome> {
  const { levy, workflowId, systemProfileId, supabase } = ctx;

  // ─── Owner resolution ────────────────────────────────────────────
  const { data: memberRow } = await supabase
    .from("subdivision_members")
    .select("profile_id")
    .eq("subdivision_id", levy.subdivision_id)
    .eq("lot_id", levy.lot_id)
    .eq("role", "lot_owner")
    .eq("is_primary_contact", true)
    .maybeSingle();
  const ownerProfileId = (memberRow as { profile_id: string } | null)
    ?.profile_id;
  if (!ownerProfileId) return "skipped_no_owner";

  // ─── Opt-out check ────────────────────────────────────────────────
  const optedOut = await isNotificationOptedOut(
    supabase,
    ownerProfileId,
    NOTIFICATION_TYPE,
    "email",
  );
  if (optedOut) return "skipped_opted_out";

  // ─── Owner email + subdivision context ───────────────────────────
  const [{ data: owner }, { data: sub }, { data: lot }] = await Promise.all([
    supabase
      .from("profiles")
      .select("email, first_name, last_name")
      .eq("id", ownerProfileId)
      .single(),
    supabase
      .from("subdivisions")
      .select("name, address, short_code")
      .eq("id", levy.subdivision_id)
      .single(),
    supabase
      .from("lots")
      .select("lot_number, unit_number")
      .eq("id", levy.lot_id)
      .single(),
  ]);
  const ownerEmail = (owner as { email: string } | null)?.email;
  if (!ownerEmail) return "skipped_no_owner";
  const ownerName = formatOwnerName(
    owner as { first_name: string | null; last_name: string | null } | null,
  );
  const subRow = sub as { name: string; address: string; short_code: string } | null;
  const subdivisionName = subRow?.name ?? "Your subdivision";
  const subdivisionAddress = subRow?.address ?? "";
  const subdivisionShortCode = subRow?.short_code ?? "";
  const lotLabel = formatLotLabel(
    lot as { lot_number: number; unit_number: string | null } | null,
  );

  // ─── Penalty interest accrued lookup ─────────────────────────────
  const penaltyInterestAccrued = await lookupPenaltyInterestAccrued(
    supabase,
    levy.id,
  );

  // ─── Company logo (null until manager UI lands in Prompt 6.5) ────
  const companyLogoUrl = await resolveCompanyLogo(supabase, {
    subdivisionId: levy.subdivision_id,
  });

  const amountOutstanding =
    Number(levy.amount) - Number(levy.amount_paid);

  const params: SendOverdueReminderEmailParams = {
    to: ownerEmail,
    ownerName,
    subdivisionName,
    subdivisionAddress,
    referenceNumber: levy.reference_number,
    amountOutstanding,
    daysOverdue: 14,
    dueDate: levy.due_date,
    penaltyInterestAccrued,
    subdivisionShortCode,
    companyLogoUrl,
  };

  // ─── communication_log queued ────────────────────────────────────
  const subjectPreview = `Overdue reminder ${levy.reference_number} (${lotLabel})`;
  const { data: logRow, error: logErr } = await supabase
    .from("communication_log")
    .insert({
      subdivision_id: levy.subdivision_id,
      recipient_id: ownerProfileId,
      recipient_email: ownerEmail,
      channel: "email",
      type: NOTIFICATION_TYPE,
      subject: `Your levy is overdue — ${subdivisionName}`,
      body_preview: subjectPreview.slice(0, 300),
      status: "queued",
      related_entity_type: "levy_notice",
      related_entity_id: levy.id,
    })
    .select("id")
    .single();
  if (logErr || !logRow) {
    console.error(
      `processOverdueLevy: communication_log insert failed for levy ${levy.id}:`,
      logErr,
    );
    return "failed";
  }
  const communicationLogId = (logRow as { id: string }).id;

  // ─── Send via Resend (respects EMAIL_DRY_RUN) ────────────────────
  const sendResult = await sendOverdueReminderEmail(params);

  if ("dryRun" in sendResult) {
    await supabase.from("audit_log").insert({
      profile_id: systemProfileId,
      subdivision_id: levy.subdivision_id,
      action: "communication.overdue_reminder.dry_run",
      entity_type: "levy_notice",
      entity_id: levy.id,
      metadata: { communication_log_id: communicationLogId },
    });
    // Dry-run: leave log row 'queued', don't create escalation_instances —
    // re-runs in real-send mode will see no instance and proceed.
    return "skipped_dry_run";
  }

  if ("error" in sendResult) {
    await supabase
      .from("communication_log")
      .update({
        status: "failed",
        error_message: sendResult.error.slice(0, 500),
      })
      .eq("id", communicationLogId);
    return "failed";
  }

  // ─── Success: log → sent, create escalation_instances, audit ────
  const sentAt = new Date().toISOString();
  const nextActionAt = computeNextActionAt(levy.due_date, 28);

  // Reference number is operational — uses next_reference_number('ESC').
  const { data: refData, error: refErr } = await supabase.rpc(
    "next_reference_number",
    { p_prefix: "ESC", p_subdivision_id: null },
  );
  if (refErr || !refData) {
    // Treat ref-allocation failure as send-failure (we already sent the
    // email; escalation tracking is the missing piece). Log loudly so the
    // operator can manually create the row if needed.
    console.error(
      `processOverdueLevy: next_reference_number(ESC) failed for levy ${levy.id}:`,
      refErr,
    );
    await supabase
      .from("communication_log")
      .update({
        status: "sent",
        sent_at: sentAt,
        external_id: sendResult.id,
      })
      .eq("id", communicationLogId);
    return "failed";
  }
  const escReference = refData as string;

  const { error: instErr } = await supabase
    .from("escalation_instances")
    .insert({
      levy_notice_id: levy.id,
      workflow_id: workflowId,
      reference_number: escReference,
      current_step: 1,
      status: "active",
      next_action_at: nextActionAt,
    });
  if (instErr) {
    console.error(
      `processOverdueLevy: escalation_instances insert failed for levy ${levy.id}:`,
      instErr,
    );
    // Same handling as ref failure — email is out, row missing.
    await supabase
      .from("communication_log")
      .update({
        status: "sent",
        sent_at: sentAt,
        external_id: sendResult.id,
      })
      .eq("id", communicationLogId);
    return "failed";
  }

  await Promise.all([
    supabase
      .from("communication_log")
      .update({
        status: "sent",
        sent_at: sentAt,
        external_id: sendResult.id,
      })
      .eq("id", communicationLogId),
    supabase.from("audit_log").insert({
      profile_id: systemProfileId,
      subdivision_id: levy.subdivision_id,
      action: "communication.overdue_reminder.sent",
      entity_type: "levy_notice",
      entity_id: levy.id,
      metadata: {
        communication_log_id: communicationLogId,
        escalation_reference: escReference,
        recipient_profile_id: ownerProfileId,
        penalty_interest_accrued: penaltyInterestAccrued,
      },
    }),
  ]);

  return "sent";
}

// ─── Internal helpers ──────────────────────────────────────────────────

async function lookupPenaltyInterestAccrued(
  supabase: SupabaseClient,
  parentLevyId: string,
): Promise<number> {
  const { data } = await supabase
    .from("levy_notices")
    .select("amount, amount_paid")
    .eq("linked_levy_id", parentLevyId)
    .eq("levy_type", "penalty_interest")
    .neq("status", "written_off");
  const rows = (data ?? []) as Array<{
    amount: number | string;
    amount_paid: number | string;
  }>;
  let total = 0;
  for (const r of rows) {
    const out = Number(r.amount) - Number(r.amount_paid);
    if (out > 0) total += out;
  }
  return Math.round(total * 100) / 100;
}

function subtractDaysIso(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

function computeNextActionAt(dueDate: string, daysAfter: number): string {
  const d = new Date(dueDate + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + daysAfter);
  return d.toISOString();
}

function formatOwnerName(profile: {
  first_name: string | null;
  last_name: string | null;
} | null): string | null {
  if (!profile) return null;
  const f = profile.first_name?.trim() ?? "";
  const l = profile.last_name?.trim() ?? "";
  const full = `${f} ${l}`.trim();
  return full.length > 0 ? full : null;
}

function formatLotLabel(
  lot: { lot_number: number; unit_number: string | null } | null,
): string {
  if (!lot) return "";
  if (lot.unit_number) return `Lot ${lot.lot_number} (Unit ${lot.unit_number})`;
  return `Lot ${lot.lot_number}`;
}
