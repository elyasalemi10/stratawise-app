// ============================================================================
// Escalation step engine — framework-agnostic (PP6.5)
// ----------------------------------------------------------------------------
// Same boundary rules as src/lib/accrual/overdue-check.ts:
//   - NO "use server" directive
//   - NO imports from next/cache, @clerk/*, @/lib/auth
//
// Walks active escalation_instances and advances them through steps 2 and 3.
// Step 1 is created by checkOverdueLeviesJob (PP6-C-1) when a levy hits
// due_date + 14d. This engine fires the second reminder at next_action_at
// (due_date + 28d) and the final notice 14d later.
//
// Eligibility per run:
//   - status='active' (engine skips paused / resolved / completed / escalated_manual)
//   - next_action_at <= runDate
//   - current_step < 3   (final-step instances are terminal once status flips)
//
// Per qualifying instance:
//   1. Re-resolve linked levy_notice. Skip if paid (amount_paid >= amount) —
//      manager may have paid in interim; engine should not nag a paid debt.
//   2. Resolve owner via oc_members (primary contact). Skip
//      if no owner.
//   3. Compute next step (current_step + 1).
//   4. Opt-out check via isNotificationOptedOut. Step 2 (second_reminder)
//      respects opt-out. Step 3 (levy_final_notice) bypasses via the
//      MANDATORY_NOTIFICATION_TYPES guard built into isNotificationOptedOut.
//   5. Dispatch via the appropriate sender (sendSecondReminderEmail /
//      sendFinalNoticeEmail). Respects EMAIL_DRY_RUN.
//   6. On real-send success: increment current_step, advance next_action_at,
//      flip status to 'escalated_manual' when next_step=3 (terminal ladder
//      state — engine has done all it can; further escalation is manual /
//      off-platform).
//   7. communication_log row inserted (queued → sent / failed).
//   8. audit_log row written.
//
// On dry-run: NO state mutation. current_step + status + next_action_at
// remain at pre-run values. Re-runs in real-send mode will pick the row
// up again.
// ============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  sendSecondReminderEmail,
  sendFinalNoticeEmail,
  type SendSecondReminderEmailParams,
  type SendFinalNoticeEmailParams,
} from "@/lib/email";
import { isNotificationOptedOut, resolveCompanyLogo } from "@/lib/notifications";
import { getLevyNoticePdfBuffer } from "@/lib/pdf/render";
import { renderFinalNoticeCoverPdf, mergePdfs } from "@/lib/pdf/merge";

export type EscalationStepOutcome =
  | "advanced"
  | "skipped_already_paid"
  | "skipped_not_yet_due"
  | "skipped_already_escalated"
  | "skipped_no_owner"
  | "skipped_opted_out"
  | "skipped_dry_run"
  | "failed";

export interface EscalationStepResult {
  processed: number;
  advanced: number;
  skipped: number;
  errors: number;
  perLevy: Array<{
    escalationInstanceId: string;
    levyId: string;
    outcome: EscalationStepOutcome;
    detail?: string;
  }>;
}

export interface EscalationStepInput {
  runDate: string;            // 'YYYY-MM-DD' — usually AEST/AEDT-derived
  systemProfileId: string;
  supabase: SupabaseClient;
}

export async function runEscalationStepCheck(
  input: EscalationStepInput,
): Promise<EscalationStepResult> {
  const { runDate, systemProfileId, supabase } = input;
  const result: EscalationStepResult = {
    processed: 0,
    advanced: 0,
    skipped: 0,
    errors: 0,
    perLevy: [],
  };

  // Build the runDate timestamp boundary. next_action_at is TIMESTAMPTZ;
  // we treat the runDate as end-of-day AEST/AEDT for inclusion in the sweep.
  // Slight overshoot (compared to strict <= 'YYYY-MM-DD 23:59:59') is
  // acceptable — the next_action_at fields are set to a UTC instant when
  // each step lands, so a runDate of 2026-05-11 picks up everything due
  // through end of that calendar day in any reasonable tz.
  const runDateEnd = `${runDate}T23:59:59.999Z`;

  const { data: instancesRaw, error: queryErr } = await supabase
    .from("escalation_instances")
    .select(
      "id, levy_notice_id, current_step, status, next_action_at",
    )
    .eq("status", "active")
    .lte("next_action_at", runDateEnd)
    .lt("current_step", 3);

  if (queryErr) {
    throw new Error(
      `runEscalationStepCheck: escalation_instances query failed: ${queryErr.message}`,
    );
  }

  const instances = (instancesRaw ?? []) as Array<{
    id: string;
    levy_notice_id: string;
    current_step: number;
    status: string;
    next_action_at: string | null;
  }>;

  result.processed = instances.length;
  if (instances.length === 0) return result;

  for (const inst of instances) {
    try {
      const outcome = await processEscalationInstance({
        instance: inst,
        runDate,
        systemProfileId,
        supabase,
      });
      result.perLevy.push({
        escalationInstanceId: inst.id,
        levyId: inst.levy_notice_id,
        outcome,
      });
      if (outcome === "advanced") result.advanced += 1;
      else if (outcome === "failed") result.errors += 1;
      else result.skipped += 1;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(
        `runEscalationStepCheck: unhandled error on instance ${inst.id}:`,
        msg,
      );
      result.errors += 1;
      result.perLevy.push({
        escalationInstanceId: inst.id,
        levyId: inst.levy_notice_id,
        outcome: "failed",
        detail: msg,
      });
    }
  }

  return result;
}

interface ProcessEscalationContext {
  instance: {
    id: string;
    levy_notice_id: string;
    current_step: number;
    status: string;
    next_action_at: string | null;
  };
  runDate: string;
  systemProfileId: string;
  supabase: SupabaseClient;
}

async function processEscalationInstance(
  ctx: ProcessEscalationContext,
): Promise<EscalationStepOutcome> {
  const { instance, runDate, systemProfileId, supabase } = ctx;

  // ─── Re-fetch the linked levy_notice (paid-in-interim check) ──────
  const { data: levyRow } = await supabase
    .from("levy_notices")
    .select(
      "id, lot_id, oc_id, fund_type, reference_number, amount, amount_paid, due_date, status",
    )
    .eq("id", instance.levy_notice_id)
    .single();
  if (!levyRow) {
    return "failed";
  }
  const levy = levyRow as {
    id: string;
    lot_id: string;
    oc_id: string;
    fund_type: string;
    reference_number: string;
    amount: number | string;
    amount_paid: number | string;
    due_date: string;
    status: string;
  };

  // Paid-in-interim: amount_paid covers amount. Engine does not advance.
  // Note: we do NOT auto-resolve the escalation_instance here — a manager
  // workflow may want to keep the instance row for audit / re-open logic.
  // Just skip the send; instance stays 'active' but the eligibility query
  // will return it again until status changes. Cheap re-eval is fine.
  if (Number(levy.amount_paid) >= Number(levy.amount)) {
    return "skipped_already_paid";
  }

  // ─── Compute next step + step-specific notification config ───────
  const nextStep = instance.current_step + 1; // 2 or 3
  const notificationType =
    nextStep === 2 ? "second_reminder" : "levy_final_notice";

  // ─── Resolve owner via oc_members (primary contact) ─────
  const { data: memberRow } = await supabase
    .from("oc_members")
    .select("profile_id")
    .eq("oc_id", levy.oc_id)
    .eq("lot_id", levy.lot_id)
    .eq("role", "lot_owner")
    .eq("is_primary_contact", true)
    .maybeSingle();
  const ownerProfileId = (memberRow as { profile_id: string } | null)
    ?.profile_id;
  if (!ownerProfileId) return "skipped_no_owner";

  // ─── Opt-out check ────────────────────────────────────────────────
  // isNotificationOptedOut short-circuits to false (= not opted out) for
  // types in MANDATORY_NOTIFICATION_TYPES (which contains
  // 'levy_final_notice'). Step 2 ('second_reminder') is opt-out-able.
  const optedOut = await isNotificationOptedOut(
    supabase,
    ownerProfileId,
    notificationType,
    "email",
  );
  if (optedOut) return "skipped_opted_out";

  // ─── Owner email + oc + lot context ──────────────────────
  const [{ data: owner }, { data: sub }, { data: lot }] = await Promise.all([
    supabase
      .from("profiles")
      .select("email, first_name, last_name")
      .eq("id", ownerProfileId)
      .single(),
    supabase
      .from("owners_corporations")
      .select("name, address, short_code")
      .eq("id", levy.oc_id)
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
  const ocName = subRow?.name ?? "Your oc";
  const ocAddress = subRow?.address ?? "";
  const ocShortCode = subRow?.short_code ?? "";
  const lotLabel = formatLotLabel(
    lot as { lot_number: number; unit_number: string | null } | null,
  );

  // ─── Penalty interest accrued (linked penalty_interest notices) ──
  const penaltyInterestAccrued = await lookupPenaltyInterestAccrued(
    supabase,
    levy.id,
  );

  // ─── Company logo ────────────────────────────────────────────────
  const companyLogoUrl = await resolveCompanyLogo(supabase, {
    ocId: levy.oc_id,
  });

  const amountOutstanding =
    Number(levy.amount) - Number(levy.amount_paid);
  const daysOverdue = daysBetween(levy.due_date, runDate);

  // ─── PDF attachment resolution (PP7-A) ───────────────────────────
  // Step 2 (second reminder): attach the levy notice PDF as-is.
  // Step 3 (final notice): render cover page + merge with levy PDF.
  // Both paths gracefully fall back to body-only if PDF resolution fails.
  const levyPdf = await getLevyNoticePdfBuffer(levy.id, supabase);
  let attachmentBuffer: Buffer | null = null;
  let attachmentFilename: string | undefined;
  if (levyPdf) {
    if (nextStep === 2) {
      attachmentBuffer = levyPdf;
      attachmentFilename = `${levy.reference_number}.pdf`;
    } else {
      // Step 3 final notice: render the cover page + merge.
      try {
        const { data: mcRow } = await supabase
          .from("management_companies")
          .select("name, registered_name, signature_url, logo_url")
          .eq(
            "id",
            (
              await supabase
                .from("owners_corporations")
                .select("management_company_id")
                .eq("id", levy.oc_id)
                .single()
            ).data?.management_company_id ?? "",
          )
          .single();
        const mc = (mcRow as {
          name: string;
          registered_name: string | null;
          signature_url: string | null;
          logo_url: string | null;
        } | null) ?? {
          name: "",
          registered_name: null,
          signature_url: null,
          logo_url: companyLogoUrl,
        };
        const cover = await renderFinalNoticeCoverPdf({
          managementCompany: {
            name: mc.name,
            logo_url: mc.logo_url ?? companyLogoUrl,
            registered_name: mc.registered_name,
          },
          managerName: null,
          signatureUrl: mc.signature_url,
          recipientName: ownerName ?? "Lot Owner",
          ocAddress,
          lotLabel,
          referenceNumber: levy.reference_number,
          dueDate: formatDateLong(levy.due_date),
          amountOutstanding,
          penaltyInterestAccrued,
          daysOverdue,
          issuedDate: formatDateLong(runDate),
        });
        attachmentBuffer = await mergePdfs(cover, levyPdf);
        attachmentFilename = `final-notice-${levy.reference_number}.pdf`;
      } catch (mergeErr) {
        console.warn(
          `processEscalationInstance: final-notice merge failed for instance ${instance.id}; falling back to body-only`,
          mergeErr instanceof Error ? mergeErr.message : mergeErr,
        );
        attachmentBuffer = null;
      }
    }
  }

  // ─── communication_log queued ────────────────────────────────────
  const subjectPreview =
    nextStep === 2
      ? `Second reminder ${levy.reference_number} (${lotLabel})`
      : `FINAL NOTICE ${levy.reference_number} (${lotLabel})`;
  const subject =
    nextStep === 2
      ? `Second reminder — levy overdue ${daysOverdue}+ days — ${ocName}`
      : `FINAL NOTICE — outstanding levy — ${ocName}`;
  const { data: logRow, error: logErr } = await supabase
    .from("communication_log")
    .insert({
      oc_id: levy.oc_id,
      recipient_id: ownerProfileId,
      recipient_email: ownerEmail,
      channel: "email",
      type: notificationType,
      subject,
      body_preview: subjectPreview.slice(0, 300),
      status: "queued",
      related_entity_type: "levy_notice",
      related_entity_id: levy.id,
    })
    .select("id")
    .single();
  if (logErr || !logRow) {
    console.error(
      `processEscalationInstance: communication_log insert failed for instance ${instance.id}:`,
      logErr,
    );
    return "failed";
  }
  const communicationLogId = (logRow as { id: string }).id;

  // ─── Dispatch via the step-specific sender ───────────────────────
  const senderResult = await dispatchStep({
    nextStep,
    params: {
      to: ownerEmail,
      ownerName,
      ocName,
      ocAddress,
      referenceNumber: levy.reference_number,
      amountOutstanding,
      daysOverdue,
      dueDate: levy.due_date,
      penaltyInterestAccrued,
      ocShortCode,
      companyLogoUrl,
      pdfBuffer: attachmentBuffer,
      pdfFilename: attachmentFilename,
    },
  });

  if ("dryRun" in senderResult) {
    // No state mutation on dry-run. comm_log stays 'queued'; the next
    // real-send invocation will re-resolve and proceed (subject to the
    // eligibility query).
    await supabase.from("audit_log").insert({
      profile_id: systemProfileId,
      oc_id: levy.oc_id,
      action:
        nextStep === 2
          ? "communication.second_reminder.dry_run"
          : "communication.levy_final_notice.dry_run",
      entity_type: "levy_notice",
      entity_id: levy.id,
      metadata: {
        communication_log_id: communicationLogId,
        escalation_instance_id: instance.id,
      },
    });
    return "skipped_dry_run";
  }

  if ("error" in senderResult) {
    await supabase
      .from("communication_log")
      .update({
        status: "failed",
        error_message: senderResult.error.slice(0, 500),
      })
      .eq("id", communicationLogId);
    return "failed";
  }

  // ─── Success: advance the escalation_instance + log audit ───────
  const sentAt = new Date().toISOString();
  const newStatus = nextStep === 3 ? "escalated_manual" : instance.status;
  const newNextActionAt = computeNextActionAt(levy.due_date, runDate);

  const { error: updErr } = await supabase
    .from("escalation_instances")
    .update({
      current_step: nextStep,
      status: newStatus,
      next_action_at: newNextActionAt,
    })
    .eq("id", instance.id);
  if (updErr) {
    console.error(
      `processEscalationInstance: escalation_instances update failed for instance ${instance.id}:`,
      updErr,
    );
    // Email already sent; surface the partial state for forensics.
    await supabase
      .from("communication_log")
      .update({
        status: "sent",
        sent_at: sentAt,
        external_id: senderResult.id,
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
        external_id: senderResult.id,
      })
      .eq("id", communicationLogId),
    supabase.from("audit_log").insert({
      profile_id: systemProfileId,
      oc_id: levy.oc_id,
      action:
        nextStep === 2
          ? "communication.second_reminder.sent"
          : "communication.levy_final_notice.sent",
      entity_type: "levy_notice",
      entity_id: levy.id,
      metadata: {
        communication_log_id: communicationLogId,
        escalation_instance_id: instance.id,
        recipient_profile_id: ownerProfileId,
        new_step: nextStep,
        new_status: newStatus,
        penalty_interest_accrued: penaltyInterestAccrued,
      },
    }),
  ]);

  return "advanced";
}

// ─── Sender dispatch (step-specific) ──────────────────────────────────

interface DispatchStepArgs {
  nextStep: number;
  params: SendSecondReminderEmailParams; // SendFinalNoticeEmailParams shares the same shape
}

async function dispatchStep(args: DispatchStepArgs) {
  if (args.nextStep === 2) {
    return sendSecondReminderEmail(args.params);
  }
  // Step 3 — final notice. Same param shape as second reminder.
  const finalParams: SendFinalNoticeEmailParams = args.params;
  return sendFinalNoticeEmail(finalParams);
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

function daysBetween(fromIsoDate: string, toIsoDate: string): number {
  const a = new Date(fromIsoDate + "T00:00:00Z").getTime();
  const b = new Date(toIsoDate + "T00:00:00Z").getTime();
  return Math.floor((b - a) / (1000 * 60 * 60 * 24));
}

// next_action_at = max(today, due_date) + 14d. For step 3 (terminal), the
// value is mostly informational (status='escalated_manual' takes the row
// out of the active query), but keep it consistent with the architect's
// spec so the schedule view shows when the ladder completed.
function computeNextActionAt(
  dueDate: string,
  runDate: string,
): string {
  const due = new Date(dueDate + "T00:00:00Z");
  const run = new Date(runDate + "T00:00:00Z");
  const base = due.getTime() > run.getTime() ? due : run;
  base.setUTCDate(base.getUTCDate() + 14);
  return base.toISOString();
}

function formatDateLong(iso: string): string {
  const d = new Date(iso + (iso.length === 10 ? "T00:00:00Z" : ""));
  return d.toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
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
