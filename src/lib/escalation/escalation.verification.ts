/**
 * Escalation step engine verification (PP6.5).
 *
 * Exercises runEscalationStepCheck (src/lib/escalation/jobs.ts) with
 * deterministic runDate fixtures. EMAIL_DRY_RUN forced on for the suite
 * per PP6-D-D-fix-email-leak protocol — no real emails fire. Assertions
 * read communication_log + audit_log + escalation_instances directly.
 *
 * Under DRY_RUN the engine returns 'skipped_dry_run' and does NOT mutate
 * escalation_instance state (current_step + status + next_action_at stay
 * pre-run). Real-send happy-path state mutation is verified by deploy-time
 * integration walks (PP6.5 smoke walk, deferred).
 *
 * Usage:
 *   EMAIL_DRY_RUN=true npx tsx src/lib/escalation/escalation.verification.ts
 *   npx tsx src/lib/escalation/escalation.verification.ts --no-cleanup
 *   npx tsx src/lib/escalation/escalation.verification.ts --cleanup
 */

import { config } from "dotenv";
config({ path: ".env.local" });
process.env.EMAIL_DRY_RUN = "true";

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import { generateOCCode } from "@/lib/oc-code";
import { runEscalationStepCheck } from "./jobs";
import { resolveSystemProfileId } from "@/lib/accrual/jobs";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const VERIFY_MARKER = "__VERIFY_ESC__";
const supabase = createClient(supabaseUrl, serviceRoleKey);

const RUN_DATE = "2026-05-15";

type Result = { scenario: string; passed: boolean; detail: string };
const results: Result[] = [];

function record(scenario: string, passed: boolean, detail: string) {
  results.push({ scenario, passed, detail });
  console.log(`  ${passed ? "PASS" : "FAIL"}  ${scenario}${detail ? " — " + detail : ""}`);
}

function daysBefore(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

function daysAfterIso(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString();
}

// ─── Fixture builders ──────────────────────────────────────────────────

interface FixtureContext {
  companyId: string;
  managerProfileId: string;
  ocId: string;
  systemProfileId: string;
  workflowId: string;
}

async function createFixtureContext(): Promise<FixtureContext> {
  const runId = `${Date.now()}_${randomUUID().slice(0, 6)}`;

  const { data: company } = await supabase
    .from("management_companies")
    .insert({ name: `${VERIFY_MARKER}${runId}` })
    .select("id")
    .single();
  const companyId = (company as { id: string }).id;

  const { data: manager } = await supabase
    .from("profiles")
    .insert({
      auth_user_id: `${VERIFY_MARKER}_MGR_${runId}`,
      email: `${VERIFY_MARKER.toLowerCase()}${runId}_mgr@esc.test`,
      first_name: "Esc",
      last_name: "TestMgr",
      role: "strata_manager",
      company_role: "admin",
      management_company_id: companyId,
    })
    .select("id")
    .single();
  const managerProfileId = (manager as { id: string }).id;

  const { data: oc } = await supabase
    .from("owners_corporations")
    .insert({
      management_company_id: companyId,
      name: `${VERIFY_MARKER}${runId}`,
      plan_number: `PLAN-${runId}`,
      short_code: generateOCCode(),
      address: `${runId} Esc Test St, Melbourne VIC 3000`,
      total_lots: 1,
      created_by: managerProfileId,
    })
    .select("id")
    .single();
  const ocId = (oc as { id: string }).id;

  const systemProfileId = await resolveSystemProfileId(supabase);

  const { data: workflow } = await supabase
    .from("escalation_workflows")
    .select("id")
    .eq("name", "Standard Overdue Levy")
    .eq("is_default", true)
    .single();
  const workflowId = (workflow as { id: string }).id;

  return { companyId, managerProfileId, ocId, systemProfileId, workflowId };
}

async function createLotWithOwner(
  ctx: FixtureContext,
  lotNumber: number,
): Promise<{ lotId: string; ownerProfileId: string }> {
  const runId = `${Date.now()}_${randomUUID().slice(0, 6)}`;

  const { data: owner } = await supabase
    .from("profiles")
    .insert({
      auth_user_id: `${VERIFY_MARKER}_OWNER_${runId}_${lotNumber}`,
      email: `${VERIFY_MARKER.toLowerCase()}${runId}_l${lotNumber}@esc.test`,
      first_name: "Owner",
      last_name: `Esc${lotNumber}`,
      role: "lot_owner",
    })
    .select("id")
    .single();
  const ownerProfileId = (owner as { id: string }).id;

  const { data: lot } = await supabase
    .from("lots")
    .insert({
      oc_id: ctx.ocId,
      lot_number: lotNumber,
      lot_entitlement: 100,
      lot_liability: 100,
    })
    .select("id")
    .single();
  const lotId = (lot as { id: string }).id;

  await supabase.from("oc_members").insert({
    oc_id: ctx.ocId,
    profile_id: ownerProfileId,
    lot_id: lotId,
    role: "lot_owner",
    is_primary_contact: true,
    is_financial: true,
  });

  return { lotId, ownerProfileId };
}

interface LevyOpts {
  amount?: number;
  amountPaid?: number;
  status?: "issued" | "partially_paid" | "overdue" | "paid";
  dueDate?: string;
}

async function createLevy(
  ctx: FixtureContext,
  lotId: string,
  refSuffix: string,
  opts: LevyOpts = {},
): Promise<string> {
  const dueDate = opts.dueDate ?? daysBefore(RUN_DATE, 28);
  const { data } = await supabase
    .from("levy_notices")
    .insert({
      oc_id: ctx.ocId,
      lot_id: lotId,
      reference_number: `LEV-ESC-${refSuffix}`,
      fund_type: "administrative",
      levy_type: "regular",
      period_start: daysBefore(dueDate, 90),
      period_end: dueDate,
      amount: opts.amount ?? 1000,
      amount_paid: opts.amountPaid ?? 0,
      due_date: dueDate,
      status: opts.status ?? "partially_paid",
      issued_at: new Date(dueDate + "T00:00:00Z").toISOString(),
    })
    .select("id")
    .single();
  return (data as { id: string }).id;
}

interface InstanceOpts {
  currentStep: number;
  status?: "active" | "paused" | "completed" | "resolved" | "escalated_manual";
  nextActionAt: string; // ISO timestamp
}

async function createEscalationInstance(
  ctx: FixtureContext,
  levyId: string,
  opts: InstanceOpts,
): Promise<string> {
  const { data: refData } = await supabase.rpc("next_reference_number", {
    p_prefix: "ESC",
    p_oc_id: null,
  });
  const { data } = await supabase
    .from("escalation_instances")
    .insert({
      levy_notice_id: levyId,
      workflow_id: ctx.workflowId,
      reference_number: refData as string,
      current_step: opts.currentStep,
      status: opts.status ?? "active",
      next_action_at: opts.nextActionAt,
    })
    .select("id")
    .single();
  return (data as { id: string }).id;
}

async function getInstanceState(instanceId: string) {
  const { data } = await supabase
    .from("escalation_instances")
    .select("current_step, status, next_action_at")
    .eq("id", instanceId)
    .single();
  return data as {
    current_step: number;
    status: string;
    next_action_at: string | null;
  };
}

// ─── Scenarios ─────────────────────────────────────────────────────────

async function es1_step1ToStep2DryRunPath(ctx: FixtureContext) {
  const { lotId } = await createLotWithOwner(ctx, 21);
  const levyId = await createLevy(ctx, lotId, "es1");
  // next_action_at = RUN_DATE → due now. current_step=1.
  const instanceId = await createEscalationInstance(ctx, levyId, {
    currentStep: 1,
    nextActionAt: daysAfterIso(RUN_DATE, 0),
  });
  const before = await getInstanceState(instanceId);

  const result = await runEscalationStepCheck({
    runDate: RUN_DATE,
    systemProfileId: ctx.systemProfileId,
    supabase,
  });

  const after = await getInstanceState(instanceId);
  const perLevyOutcome = result.perLevy.find(
    (p) => p.escalationInstanceId === instanceId,
  )?.outcome;
  const { data: log } = await supabase
    .from("communication_log")
    .select("type, status")
    .eq("related_entity_type", "levy_notice")
    .eq("related_entity_id", levyId)
    .single();
  const { data: audit } = await supabase
    .from("audit_log")
    .select("action")
    .eq("entity_type", "levy_notice")
    .eq("entity_id", levyId)
    .eq("action", "communication.second_reminder.dry_run")
    .maybeSingle();

  // Under DRY_RUN: outcome=skipped_dry_run, comm_log queued with type=
  // second_reminder, audit dry_run row exists, state unchanged.
  const ok =
    perLevyOutcome === "skipped_dry_run" &&
    !!log &&
    (log as { type: string }).type === "second_reminder" &&
    (log as { status: string }).status === "queued" &&
    !!audit &&
    after.current_step === before.current_step &&
    after.status === before.status;
  record(
    "ES-1: active step-1 instance at next_action_at → engine identifies step 2 path (dry-run gate)",
    ok,
    `outcome=${perLevyOutcome} log_type=${(log as { type: string } | null)?.type} log_status=${(log as { status: string } | null)?.status} audit=${audit ? "yes" : "no"} step_before=${before.current_step} step_after=${after.current_step}`,
  );
}

async function es2_step2ToStep3DryRunPath(ctx: FixtureContext) {
  const { lotId } = await createLotWithOwner(ctx, 22);
  const levyId = await createLevy(ctx, lotId, "es2");
  const instanceId = await createEscalationInstance(ctx, levyId, {
    currentStep: 2,
    nextActionAt: daysAfterIso(RUN_DATE, 0),
  });
  const before = await getInstanceState(instanceId);

  const result = await runEscalationStepCheck({
    runDate: RUN_DATE,
    systemProfileId: ctx.systemProfileId,
    supabase,
  });

  const after = await getInstanceState(instanceId);
  const perLevyOutcome = result.perLevy.find(
    (p) => p.escalationInstanceId === instanceId,
  )?.outcome;
  const { data: log } = await supabase
    .from("communication_log")
    .select("type, status")
    .eq("related_entity_type", "levy_notice")
    .eq("related_entity_id", levyId)
    .single();
  const { data: audit } = await supabase
    .from("audit_log")
    .select("action")
    .eq("entity_type", "levy_notice")
    .eq("entity_id", levyId)
    .eq("action", "communication.levy_final_notice.dry_run")
    .maybeSingle();

  const ok =
    perLevyOutcome === "skipped_dry_run" &&
    !!log &&
    (log as { type: string }).type === "levy_final_notice" &&
    (log as { status: string }).status === "queued" &&
    !!audit &&
    after.current_step === before.current_step &&
    after.status === before.status;
  record(
    "ES-2: active step-2 instance at next_action_at → engine identifies step 3 (final notice) path",
    ok,
    `outcome=${perLevyOutcome} log_type=${(log as { type: string } | null)?.type} audit=${audit ? "yes" : "no"} step_before=${before.current_step} step_after=${after.current_step}`,
  );
}

async function es3_paidInInterimSkipped(ctx: FixtureContext) {
  const { lotId } = await createLotWithOwner(ctx, 23);
  // Levy is fully paid (amount_paid >= amount).
  const levyId = await createLevy(ctx, lotId, "es3", {
    amount: 500,
    amountPaid: 500,
    status: "paid",
  });
  const instanceId = await createEscalationInstance(ctx, levyId, {
    currentStep: 1,
    nextActionAt: daysAfterIso(RUN_DATE, 0),
  });

  const result = await runEscalationStepCheck({
    runDate: RUN_DATE,
    systemProfileId: ctx.systemProfileId,
    supabase,
  });

  const perLevyOutcome = result.perLevy.find(
    (p) => p.escalationInstanceId === instanceId,
  )?.outcome;
  const { count: logCount } = await supabase
    .from("communication_log")
    .select("id", { count: "exact", head: true })
    .eq("related_entity_id", levyId);

  const ok = perLevyOutcome === "skipped_already_paid" && logCount === 0;
  record(
    "ES-3: levy paid in interim (amount_paid >= amount) → skipped + no comm_log",
    ok,
    `outcome=${perLevyOutcome} log=${logCount}`,
  );
}

async function es4_nextActionInFutureSkipped(ctx: FixtureContext) {
  const { lotId } = await createLotWithOwner(ctx, 24);
  const levyId = await createLevy(ctx, lotId, "es4");
  // next_action_at is 7 days after RUN_DATE → not yet due.
  const futureNextAction = daysAfterIso(RUN_DATE, 7);
  const instanceId = await createEscalationInstance(ctx, levyId, {
    currentStep: 1,
    nextActionAt: futureNextAction,
  });

  const result = await runEscalationStepCheck({
    runDate: RUN_DATE,
    systemProfileId: ctx.systemProfileId,
    supabase,
  });

  const perLevyEntry = result.perLevy.find(
    (p) => p.escalationInstanceId === instanceId,
  );
  // Engine's eligibility query filters next_action_at <= runDate. Future
  // rows never enter perLevy at all.
  const { count: logCount } = await supabase
    .from("communication_log")
    .select("id", { count: "exact", head: true })
    .eq("related_entity_id", levyId);

  const ok = perLevyEntry === undefined && logCount === 0;
  record(
    "ES-4: next_action_at in future → instance not processed (eligibility filter)",
    ok,
    `present_in_perLevy=${perLevyEntry !== undefined} log=${logCount}`,
  );
}

async function es5_alreadyTerminalSkipped(ctx: FixtureContext) {
  const { lotId } = await createLotWithOwner(ctx, 25);
  const levyId = await createLevy(ctx, lotId, "es5");
  // Terminal: status='escalated_manual' (ladder previously completed).
  const instanceId = await createEscalationInstance(ctx, levyId, {
    currentStep: 3,
    status: "escalated_manual",
    nextActionAt: daysAfterIso(RUN_DATE, 0),
  });

  const result = await runEscalationStepCheck({
    runDate: RUN_DATE,
    systemProfileId: ctx.systemProfileId,
    supabase,
  });

  const perLevyEntry = result.perLevy.find(
    (p) => p.escalationInstanceId === instanceId,
  );
  const { count: logCount } = await supabase
    .from("communication_log")
    .select("id", { count: "exact", head: true })
    .eq("related_entity_id", levyId);

  // Terminal status + current_step=3 BOTH filter the row out.
  const ok = perLevyEntry === undefined && logCount === 0;
  record(
    "ES-5: terminal instance (status='escalated_manual' AND step=3) → not processed",
    ok,
    `present=${perLevyEntry !== undefined} log=${logCount}`,
  );
}

async function es6_dryRunPreservesState(ctx: FixtureContext) {
  const { lotId } = await createLotWithOwner(ctx, 26);
  const levyId = await createLevy(ctx, lotId, "es6");
  const instanceId = await createEscalationInstance(ctx, levyId, {
    currentStep: 1,
    nextActionAt: daysAfterIso(RUN_DATE, 0),
  });
  const before = await getInstanceState(instanceId);

  await runEscalationStepCheck({
    runDate: RUN_DATE,
    systemProfileId: ctx.systemProfileId,
    supabase,
  });

  const after = await getInstanceState(instanceId);
  const { data: log } = await supabase
    .from("communication_log")
    .select("status")
    .eq("related_entity_type", "levy_notice")
    .eq("related_entity_id", levyId)
    .single();

  // EMAIL_DRY_RUN=true (suite gate): comm_log stays 'queued' (NOT 'sent'),
  // current_step/status/next_action_at all unchanged.
  const ok =
    after.current_step === before.current_step &&
    after.status === before.status &&
    after.next_action_at === before.next_action_at &&
    !!log &&
    (log as { status: string }).status === "queued";
  record(
    "ES-6: EMAIL_DRY_RUN=true → comm_log stays 'queued', current_step/status/next_action_at all UNCHANGED",
    ok,
    `step=${before.current_step}→${after.current_step} status=${before.status}→${after.status} log_status=${(log as { status: string } | null)?.status}`,
  );
}

async function es7_secondReminderOptOutSkipped(ctx: FixtureContext) {
  const { lotId, ownerProfileId } = await createLotWithOwner(ctx, 27);
  const levyId = await createLevy(ctx, lotId, "es7");
  const instanceId = await createEscalationInstance(ctx, levyId, {
    currentStep: 1, // next step = 2 = second_reminder (opt-outable)
    nextActionAt: daysAfterIso(RUN_DATE, 0),
  });

  // Owner has explicitly disabled second_reminder email.
  await supabase.from("notification_preferences").insert({
    profile_id: ownerProfileId,
    notification_type: "second_reminder",
    channel: "email",
    enabled: false,
  });

  const result = await runEscalationStepCheck({
    runDate: RUN_DATE,
    systemProfileId: ctx.systemProfileId,
    supabase,
  });

  const perLevyOutcome = result.perLevy.find(
    (p) => p.escalationInstanceId === instanceId,
  )?.outcome;
  const { count: logCount } = await supabase
    .from("communication_log")
    .select("id", { count: "exact", head: true })
    .eq("related_entity_id", levyId);

  // Cleanup so pref doesn't bleed into ES-8.
  await supabase
    .from("notification_preferences")
    .delete()
    .eq("profile_id", ownerProfileId)
    .eq("notification_type", "second_reminder");

  const ok = perLevyOutcome === "skipped_opted_out" && logCount === 0;
  record(
    "ES-7: step 2 (second_reminder) respects opt-out → skipped + no comm_log",
    ok,
    `outcome=${perLevyOutcome} log=${logCount}`,
  );
}

async function es8_finalNoticeBypassesOptOut(ctx: FixtureContext) {
  const { lotId, ownerProfileId } = await createLotWithOwner(ctx, 28);
  const levyId = await createLevy(ctx, lotId, "es8");
  // current_step=2 → next step = 3 = levy_final_notice (MANDATORY).
  const instanceId = await createEscalationInstance(ctx, levyId, {
    currentStep: 2,
    nextActionAt: daysAfterIso(RUN_DATE, 0),
  });

  // Owner has opted out of levy_final_notice email. MANDATORY guard should
  // ignore this and dispatch anyway.
  await supabase.from("notification_preferences").insert({
    profile_id: ownerProfileId,
    notification_type: "levy_final_notice",
    channel: "email",
    enabled: false,
  });

  const result = await runEscalationStepCheck({
    runDate: RUN_DATE,
    systemProfileId: ctx.systemProfileId,
    supabase,
  });

  const perLevyOutcome = result.perLevy.find(
    (p) => p.escalationInstanceId === instanceId,
  )?.outcome;
  const { data: log } = await supabase
    .from("communication_log")
    .select("type, status")
    .eq("related_entity_type", "levy_notice")
    .eq("related_entity_id", levyId)
    .single();

  // Cleanup.
  await supabase
    .from("notification_preferences")
    .delete()
    .eq("profile_id", ownerProfileId)
    .eq("notification_type", "levy_final_notice");

  // Under DRY_RUN: outcome=skipped_dry_run (NOT skipped_opted_out), comm_log
  // row exists with type='levy_final_notice'. Mandatory bypass worked.
  const ok =
    perLevyOutcome === "skipped_dry_run" &&
    !!log &&
    (log as { type: string }).type === "levy_final_notice" &&
    (log as { status: string }).status === "queued";
  record(
    "ES-8: step 3 (levy_final_notice) MANDATORY bypasses opt-out → dispatched (dry-run gate)",
    ok,
    `outcome=${perLevyOutcome} log_type=${(log as { type: string } | null)?.type} log_status=${(log as { status: string } | null)?.status}`,
  );
}

// ─── Cleanup ───────────────────────────────────────────────────────────

async function cleanupMarker() {
  const { data: companies } = await supabase
    .from("management_companies")
    .select("id")
    .like("name", `${VERIFY_MARKER}%`);
  const companyIds = (companies ?? []).map((c) => (c as { id: string }).id);
  for (const cid of companyIds) await cleanupCompany(cid);

  const { data: orphanOwners } = await supabase
    .from("profiles")
    .select("id")
    .like("auth_user_id", `${VERIFY_MARKER}_OWNER_%`);
  const orphanOwnerIds = (orphanOwners ?? []).map((p) => (p as { id: string }).id);
  if (orphanOwnerIds.length > 0) {
    await supabase.from("notification_preferences").delete().in("profile_id", orphanOwnerIds);
    await supabase.from("profiles").delete().in("id", orphanOwnerIds);
  }
}

async function cleanupCompany(companyId: string) {
  const { data: subs } = await supabase
    .from("owners_corporations")
    .select("id")
    .eq("management_company_id", companyId);
  const subIds = (subs ?? []).map((s) => (s as { id: string }).id);

  if (subIds.length > 0) {
    const { data: lots } = await supabase
      .from("lots")
      .select("id")
      .in("oc_id", subIds);
    const lotIds = (lots ?? []).map((l) => (l as { id: string }).id);

    if (lotIds.length > 0) {
      await supabase.from("lot_ledger_state").delete().in("lot_id", lotIds);
      await supabase.from("lot_ledger_entries").delete().in("lot_id", lotIds);
    }

    const { data: levies } = await supabase
      .from("levy_notices")
      .select("id")
      .in("oc_id", subIds);
    const levyIds = (levies ?? []).map((l) => (l as { id: string }).id);
    if (levyIds.length > 0) {
      await supabase.from("escalation_instances").delete().in("levy_notice_id", levyIds);
    }
    await supabase
      .from("levy_notices")
      .update({ linked_levy_id: null })
      .in("oc_id", subIds);
    await supabase.from("levy_notices").delete().in("oc_id", subIds);

    await supabase.from("communication_log").delete().in("oc_id", subIds);
    await supabase.from("oc_members").delete().in("oc_id", subIds);
    await supabase.from("audit_log").delete().in("oc_id", subIds);
    await supabase.from("lots").delete().in("oc_id", subIds);
    await supabase.from("owners_corporations").delete().in("id", subIds);
  }

  const { data: profileRows } = await supabase
    .from("profiles")
    .select("id")
    .eq("management_company_id", companyId);
  const profileIds = (profileRows ?? []).map((p) => (p as { id: string }).id);
  if (profileIds.length > 0) {
    await supabase.from("notification_preferences").delete().in("profile_id", profileIds);
    await supabase
      .from("audit_log")
      .delete()
      .in("profile_id", profileIds)
      .is("oc_id", null);
    await supabase.from("profiles").delete().in("id", profileIds);
  }

  await supabase.from("management_companies").delete().eq("id", companyId);
}

// ─── Main ──────────────────────────────────────────────────────────────

async function main() {
  const cleanupOnly = process.argv.includes("--cleanup");
  const noCleanup = process.argv.includes("--no-cleanup");

  if (cleanupOnly) {
    await cleanupMarker();
    process.exit(0);
  }

  console.log("Escalation step engine verification — PP6.5 scenarios ES-1..ES-8\n");
  console.log("[1/3] Cleaning up stale verification data");
  await cleanupMarker();

  console.log("[2/3] Setting up shared context");
  const ctx = await createFixtureContext();

  console.log("[3/3] Running scenarios\n");
  await es1_step1ToStep2DryRunPath(ctx);
  await es2_step2ToStep3DryRunPath(ctx);
  await es3_paidInInterimSkipped(ctx);
  await es4_nextActionInFutureSkipped(ctx);
  await es5_alreadyTerminalSkipped(ctx);
  await es6_dryRunPreservesState(ctx);
  await es7_secondReminderOptOutSkipped(ctx);
  await es8_finalNoticeBypassesOptOut(ctx);

  if (!noCleanup) {
    console.log("\nCleaning up");
    await cleanupCompany(ctx.companyId);
    await cleanupMarker();
  }

  const failed = results.filter((r) => !r.passed).length;
  console.log(`\n${results.length - failed}/${results.length} scenarios passed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
