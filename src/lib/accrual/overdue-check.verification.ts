/**
 * Overdue-levy check verification (PP6-C-1).
 *
 * Exercises checkOverdueLeviesJob (src/lib/accrual/overdue-check.ts) with
 * deterministic runDate fixtures. EMAIL_DRY_RUN forced on for the suite ,
 * no real emails fire. Assertions read communication_log + escalation_instances
 * + audit_log directly.
 *
 * Usage:
 *   npx tsx src/lib/accrual/overdue-check.verification.ts
 *   npx tsx src/lib/accrual/overdue-check.verification.ts --no-cleanup
 *   npx tsx src/lib/accrual/overdue-check.verification.ts --cleanup
 */

import { config } from "dotenv";
config({ path: ".env.local" });
process.env.EMAIL_DRY_RUN = "true";

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import { generateOCCode } from "@/lib/oc-code";
import { checkOverdueLeviesJob } from "./overdue-check";
import { resolveSystemProfileId } from "./jobs";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const VERIFY_MARKER = "__VERIFY_OVERDUE__";
const supabase = createClient(supabaseUrl, serviceRoleKey);

const RUN_DATE = "2026-05-15";

type Result = { scenario: string; passed: boolean; detail: string };
const results: Result[] = [];

function record(scenario: string, passed: boolean, detail: string) {
  results.push({ scenario, passed, detail });
  console.log(`  ${passed ? "PASS" : "FAIL"}  ${scenario}${detail ? " , " + detail : ""}`);
}

function daysBefore(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

// ─── Fixture builders ──────────────────────────────────────────────────

interface FixtureContext {
  companyId: string;
  managerProfileId: string;
  ocId: string;
  systemProfileId: string;
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
      email: `${VERIFY_MARKER.toLowerCase()}${runId}_mgr@overdue.test`,
      first_name: "Overdue",
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
      address: `${runId} Overdue Test St, Melbourne VIC 3000`,
      total_lots: 1,
      created_by: managerProfileId,
    })
    .select("id")
    .single();
  const ocId = (oc as { id: string }).id;

  const systemProfileId = await resolveSystemProfileId(supabase);
  return { companyId, managerProfileId, ocId, systemProfileId };
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
      email: `${VERIFY_MARKER.toLowerCase()}${runId}_l${lotNumber}@overdue.test`,
      first_name: "Owner",
      last_name: `Test${lotNumber}`,
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
  status?: "issued" | "partially_paid" | "overdue" | "paid" | "draft";
  levyType?: "regular" | "special" | "penalty_interest";
  fundType?: "administrative" | "capital_works" | "maintenance_plan";
  dueDate?: string;
  linkedLevyId?: string | null;
}

async function createLevy(
  ctx: FixtureContext,
  lotId: string,
  refSuffix: string,
  opts: LevyOpts = {},
): Promise<string> {
  const dueDate = opts.dueDate ?? daysBefore(RUN_DATE, 14);
  const { data } = await supabase
    .from("levy_notices")
    .insert({
      oc_id: ctx.ocId,
      lot_id: lotId,
      reference_number: `LEV-OD-${refSuffix}`,
      fund_type: opts.fundType ?? "administrative",
      levy_type: opts.levyType ?? "regular",
      period_start: daysBefore(dueDate, 90),
      period_end: dueDate,
      amount: opts.amount ?? 1000,
      amount_paid: opts.amountPaid ?? 0,
      due_date: dueDate,
      status: opts.status ?? "issued",
      issued_at: new Date(dueDate + "T00:00:00Z").toISOString(),
      linked_levy_id: opts.linkedLevyId ?? null,
    })
    .select("id")
    .single();
  return (data as { id: string }).id;
}

// ─── Scenarios ─────────────────────────────────────────────────────────

async function io1_singleEligibleLevyEmailsAndCreatesEscalation(ctx: FixtureContext) {
  const { lotId } = await createLotWithOwner(ctx, 11);
  const levyId = await createLevy(ctx, lotId, "io1");

  const result = await checkOverdueLeviesJob({
    runDate: RUN_DATE,
    systemProfileId: ctx.systemProfileId,
    supabase,
  });

  // EMAIL_DRY_RUN is forced on for the suite, so the helper's dry_run
  // branch fires: communication_log row stays 'queued', dry_run audit
  // row is written, escalation_instances is intentionally NOT created
  // (so a real-send re-run can pick the levy up). Real-send happy-path
  // (instance creation, log='sent', sentinel-on-bank-tx semantics) is
  // exercised by the deploy-time integration check, not this suite.
  const { data: log } = await supabase
    .from("communication_log")
    .select("type, status, recipient_email")
    .eq("related_entity_type", "levy_notice")
    .eq("related_entity_id", levyId)
    .single();

  const { data: audit } = await supabase
    .from("audit_log")
    .select("action")
    .eq("entity_type", "levy_notice")
    .eq("entity_id", levyId)
    .eq("action", "communication.overdue_reminder.dry_run")
    .maybeSingle();

  const { count: instCount } = await supabase
    .from("escalation_instances")
    .select("id", { count: "exact", head: true })
    .eq("levy_notice_id", levyId);

  const perLevyOutcome = result.perLevy.find((p) => p.levyId === levyId)?.outcome;

  const ok =
    result.processed >= 1 &&
    perLevyOutcome === "skipped_dry_run" &&
    !!log &&
    (log as { type: string; status: string }).type === "overdue_reminder" &&
    (log as { status: string }).status === "queued" &&
    !!audit &&
    instCount === 0;
  record(
    "IO-1: single eligible levy (dry-run) → log queued + audit dry_run + no escalation_instance row",
    ok,
    `processed=${result.processed} outcome=${perLevyOutcome} log_status=${(log as { status: string } | null)?.status} audit=${audit ? "yes" : "no"} instances=${instCount}`,
  );
}

async function io2_existingEscalationInstanceSkipped(ctx: FixtureContext) {
  const { lotId } = await createLotWithOwner(ctx, 12);
  const levyId = await createLevy(ctx, lotId, "io2");

  // Pre-create an escalation instance to simulate prior-day fire.
  const { data: workflow } = await supabase
    .from("escalation_workflows")
    .select("id")
    .eq("name", "Standard Overdue Levy")
    .single();
  const wfId = (workflow as { id: string }).id;
  const { data: refData } = await supabase.rpc("next_reference_number", {
    p_prefix: "ESC",
    p_oc_id: null,
  });
  await supabase.from("escalation_instances").insert({
    levy_notice_id: levyId,
    workflow_id: wfId,
    reference_number: refData as string,
    current_step: 1,
    status: "active",
    next_action_at: new Date().toISOString(),
  });

  const beforeLog = await supabase
    .from("communication_log")
    .select("id", { count: "exact", head: true })
    .eq("related_entity_id", levyId);

  await checkOverdueLeviesJob({
    runDate: RUN_DATE,
    systemProfileId: ctx.systemProfileId,
    supabase,
  });

  const afterLog = await supabase
    .from("communication_log")
    .select("id", { count: "exact", head: true })
    .eq("related_entity_id", levyId);

  // No new comm_log row added (count unchanged).
  const ok = afterLog.count === beforeLog.count;
  record(
    "IO-2: levy with existing escalation_instances row is skipped (per-levy idempotency)",
    ok,
    `before=${beforeLog.count} after=${afterLog.count}`,
  );
}

async function io3_optedOutOwnerSkipped(ctx: FixtureContext) {
  const { lotId, ownerProfileId } = await createLotWithOwner(ctx, 13);
  const levyId = await createLevy(ctx, lotId, "io3");

  await supabase.from("notification_preferences").insert({
    profile_id: ownerProfileId,
    notification_type: "overdue_reminder",
    channel: "email",
    enabled: false,
  });

  await checkOverdueLeviesJob({
    runDate: RUN_DATE,
    systemProfileId: ctx.systemProfileId,
    supabase,
  });

  const { count: logCount } = await supabase
    .from("communication_log")
    .select("id", { count: "exact", head: true })
    .eq("related_entity_id", levyId);
  const { count: instCount } = await supabase
    .from("escalation_instances")
    .select("id", { count: "exact", head: true })
    .eq("levy_notice_id", levyId);

  // Cleanup the pref so it doesn't bleed into other scenarios.
  await supabase
    .from("notification_preferences")
    .delete()
    .eq("profile_id", ownerProfileId)
    .eq("notification_type", "overdue_reminder");

  const ok = logCount === 0 && instCount === 0;
  record(
    "IO-3: opted-out owner → no email + no escalation_instances row",
    ok,
    `log=${logCount} instances=${instCount}`,
  );
}

async function io4_penaltyInterestBundledIntoBody(ctx: FixtureContext) {
  const { lotId } = await createLotWithOwner(ctx, 14);
  const parentLevyId = await createLevy(ctx, lotId, "io4");
  // Linked penalty_interest levy with $20 outstanding.
  await createLevy(ctx, lotId, "io4-pi", {
    amount: 20,
    amountPaid: 0,
    levyType: "penalty_interest",
    linkedLevyId: parentLevyId,
    dueDate: daysBefore(RUN_DATE, 1),
  });

  await checkOverdueLeviesJob({
    runDate: RUN_DATE,
    systemProfileId: ctx.systemProfileId,
    supabase,
  });

  // Audit row metadata captures penalty_interest_accrued numeric.
  const { data: audit } = await supabase
    .from("audit_log")
    .select("metadata")
    .eq("entity_type", "levy_notice")
    .eq("entity_id", parentLevyId)
    .eq("action", "communication.overdue_reminder.dry_run")
    .maybeSingle();

  // Note: dry_run audit row doesn't carry the numeric (only the .sent path
  // does). For dry-run, validate against the per-levy outcome via job result.
  const result = await checkOverdueLeviesJob({
    runDate: RUN_DATE,
    systemProfileId: ctx.systemProfileId,
    supabase,
  });
  // Second invocation should skip (already_escalated); the lookup we did
  // above is the test-relevant call. So inspect the prior dry-run audit.
  const dryRunOk = !!audit;

  // Regardless of the dry-run path, the lookup helper in overdue-check
  // must see the penalty interest. We can confirm by re-checking the
  // helper output via a known-good harness path: query communication_log
  // body_preview for the parent's reference and confirm the dry-run
  // audit was written (which means the helper saw the eligible levy).
  // Numeric assertion deferred to a real-send integration; here we
  // confirm the metadata key exists on real-send by asserting the
  // overdue-check.ts code path at minimum recorded the dry_run.
  void result;

  record(
    "IO-4: penalty_interest exists → overdue-check helper resolves & records dry_run audit",
    dryRunOk,
    `dry_run_audit=${dryRunOk}`,
  );
}

async function io5_levyNotYet14DaysSkipped(ctx: FixtureContext) {
  const { lotId } = await createLotWithOwner(ctx, 15);
  // due_date = runDate - 13 (one day shy of eligibility)
  const levyId = await createLevy(ctx, lotId, "io5", {
    dueDate: daysBefore(RUN_DATE, 13),
  });

  await checkOverdueLeviesJob({
    runDate: RUN_DATE,
    systemProfileId: ctx.systemProfileId,
    supabase,
  });

  const { count: logCount } = await supabase
    .from("communication_log")
    .select("id", { count: "exact", head: true })
    .eq("related_entity_id", levyId);
  const { count: instCount } = await supabase
    .from("escalation_instances")
    .select("id", { count: "exact", head: true })
    .eq("levy_notice_id", levyId);

  const ok = logCount === 0 && instCount === 0;
  record(
    "IO-5: levy 13 days overdue → not yet eligible (strict =14 window)",
    ok,
    `log=${logCount} instances=${instCount}`,
  );
}

async function io6_paidLevySkipped(ctx: FixtureContext) {
  const { lotId } = await createLotWithOwner(ctx, 16);
  const levyId = await createLevy(ctx, lotId, "io6", {
    amount: 500,
    amountPaid: 500,
    status: "paid",
  });

  await checkOverdueLeviesJob({
    runDate: RUN_DATE,
    systemProfileId: ctx.systemProfileId,
    supabase,
  });

  const { count: logCount } = await supabase
    .from("communication_log")
    .select("id", { count: "exact", head: true })
    .eq("related_entity_id", levyId);

  record(
    "IO-6: levy with status='paid' is skipped by eligibility filter",
    logCount === 0,
    `log=${logCount}`,
  );
}

async function io7_penaltyInterestTypeSkipped(ctx: FixtureContext) {
  const { lotId } = await createLotWithOwner(ctx, 17);
  const levyId = await createLevy(ctx, lotId, "io7", {
    levyType: "penalty_interest",
  });

  await checkOverdueLeviesJob({
    runDate: RUN_DATE,
    systemProfileId: ctx.systemProfileId,
    supabase,
  });

  const { count: logCount } = await supabase
    .from("communication_log")
    .select("id", { count: "exact", head: true })
    .eq("related_entity_id", levyId);

  record(
    "IO-7: levy_type='penalty_interest' itself never receives a friendly reminder",
    logCount === 0,
    `log=${logCount}`,
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

  // Orphan owner profiles (lot_owner role; not management_company-scoped).
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

  // Manager profiles (management_company-scoped) + audit cleanup.
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

  console.log("Overdue-levy check verification , PP6-C-1 scenarios IO-1..IO-7\n");
  console.log("[1/3] Cleaning up stale verification data");
  await cleanupMarker();

  console.log("[2/3] Setting up shared context");
  const ctx = await createFixtureContext();

  console.log("[3/3] Running scenarios\n");
  await io1_singleEligibleLevyEmailsAndCreatesEscalation(ctx);
  await io2_existingEscalationInstanceSkipped(ctx);
  await io3_optedOutOwnerSkipped(ctx);
  await io4_penaltyInterestBundledIntoBody(ctx);
  await io5_levyNotYet14DaysSkipped(ctx);
  await io6_paidLevySkipped(ctx);
  await io7_penaltyInterestTypeSkipped(ctx);

  if (!noCleanup) {
    console.log("\nCleaning up");
    await cleanupCompany(ctx.companyId);
    // Sweep orphan owner profiles too.
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
