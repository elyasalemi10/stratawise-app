/**
 * Interest accrual verification (PP6-B-B).
 *
 * Exercises rpc_accrue_interest_for_oc (PP6-A) end-to-end via the
 * accrueInterestForOCJob wrapper (PP6-B-A) against the live Supabase
 * dev DB. 15 scenarios IA-1..IA-15 covering eligibility, idempotency, field
 * shape, and the FK-violation defensive path.
 *
 * Trigger.dev is NOT exercised , tests call the framework-agnostic job
 * function directly with explicit runDate fixtures (TZ-deterministic;
 * bypasses Intl.DateTimeFormat in trigger/accrue-interest.ts).
 *
 * Usage:
 *   npx tsx src/lib/accrual/accrual.verification.ts
 *   npx tsx src/lib/accrual/accrual.verification.ts --no-cleanup
 *   npx tsx src/lib/accrual/accrual.verification.ts --cleanup
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import { generateOCCode } from "@/lib/oc-code";
import {
  accrueInterestForOCJob,
  resolveSystemProfileId,
} from "./jobs";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local",
  );
  process.exit(1);
}

const VERIFY_MARKER = "__VERIFY_ACCRUAL__";
const supabase = createClient(supabaseUrl, serviceRoleKey);

// Fixed run_date for TZ-deterministic eligibility math. All due_date /
// last_accrual_date arithmetic in scenarios is relative to this.
const RUN_DATE = "2026-05-15";

type Result = { scenario: string; passed: boolean; detail: string };
const results: Result[] = [];

function record(scenario: string, passed: boolean, detail: string) {
  results.push({ scenario, passed, detail });
  console.log(
    `  ${passed ? "PASS" : "FAIL"}  ${scenario}${detail ? " , " + detail : ""}`,
  );
}

// ─── Date helpers (UTC; runDate is treated as a calendar date) ───────────

function daysBefore(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

// ─── Fixture state ──────────────────────────────────────────────────────

interface ScenarioContext {
  companyId: string;
  systemProfileId: string;
  managerProfileId: string; // for created_by on parent ledger debits if needed
}

interface OCFixture {
  ocId: string;
}

interface LotFixture {
  lotId: string;
}

interface LevyFixture {
  levyId: string;
  amount: number;
  amountPaid: number;
  fundType: "administrative" | "capital_works" | "maintenance_plan";
}

async function createCompany(): Promise<string> {
  const runId = `${Date.now()}_${randomUUID().slice(0, 8)}`;
  const { data, error } = await supabase
    .from("management_companies")
    .insert({ name: `${VERIFY_MARKER}${runId}` })
    .select("id")
    .single();
  if (error || !data) throw new Error(`createCompany: ${error?.message}`);
  return (data as { id: string }).id;
}

async function createManagerProfile(companyId: string): Promise<string> {
  const runId = `${Date.now()}_${randomUUID().slice(0, 8)}`;
  const { data, error } = await supabase
    .from("profiles")
    .insert({
      auth_user_id: `${VERIFY_MARKER}_MGR_${runId}`,
      email: `${VERIFY_MARKER.toLowerCase()}${runId}_mgr@accrual.test`,
      first_name: "Accrual",
      last_name: "TestMgr",
      role: "strata_manager",
      company_role: "admin",
      management_company_id: companyId,
    })
    .select("id")
    .single();
  if (error || !data)
    throw new Error(`createManagerProfile: ${error?.message}`);
  return (data as { id: string }).id;
}

interface OCOpts {
  interestEnabled?: boolean;
  interestRateMonthly?: number; // percent (e.g. 2.0 = 2%)
  interestGracePeriodDays?: number;
}

async function createOCFixture(
  ctx: ScenarioContext,
  opts: OCOpts = {},
): Promise<OCFixture> {
  const runId = `${Date.now()}_${randomUUID().slice(0, 6)}`;
  const { data, error } = await supabase
    .from("owners_corporations")
    .insert({
      management_company_id: ctx.companyId,
      name: `${VERIFY_MARKER}${runId}`,
      plan_number: `PLAN-${runId}`,
      short_code: generateOCCode(),
      address: `${runId} Accrual Test St, Melbourne VIC 3000`,
      total_lots: 1,
      created_by: ctx.managerProfileId,
      interest_enabled: opts.interestEnabled ?? true,
      interest_rate_monthly: opts.interestRateMonthly ?? 2.0,
      interest_grace_period_days: opts.interestGracePeriodDays ?? 0,
    })
    .select("id")
    .single();
  if (error || !data)
    throw new Error(`createOCFixture: ${error?.message}`);
  return { ocId: (data as { id: string }).id };
}

async function createLotFixture(
  sub: OCFixture,
  lotNumber: number,
): Promise<LotFixture> {
  const { data, error } = await supabase
    .from("lots")
    .insert({
      oc_id: sub.ocId,
      lot_number: lotNumber,
      lot_entitlement: 100,
      lot_liability: 100,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`createLotFixture: ${error?.message}`);
  return { lotId: (data as { id: string }).id };
}

interface LevyOpts {
  amount: number;
  amountPaid?: number;
  dueDate: string;            // 'YYYY-MM-DD'
  status?: "issued" | "partially_paid" | "overdue" | "paid" | "draft";
  levyType?: "regular" | "special" | "penalty_interest";
  fundType?: "administrative" | "capital_works" | "maintenance_plan";
  lastAccrualDate?: string | null;
  linkedLevyId?: string | null;
  bpayCrn?: string | null;
}

async function createLevyNoticeFixture(
  sub: OCFixture,
  lot: LotFixture,
  opts: LevyOpts,
  refSuffix: string,
): Promise<LevyFixture> {
  const fundType = opts.fundType ?? "administrative";
  const { data, error } = await supabase
    .from("levy_notices")
    .insert({
      oc_id: sub.ocId,
      lot_id: lot.lotId,
      reference_number: `LEV-T-${refSuffix}`,
      bpay_crn: opts.bpayCrn ?? null,
      fund_type: fundType,
      levy_type: opts.levyType ?? "regular",
      period_start: daysBefore(opts.dueDate, 90),
      period_end: opts.dueDate,
      amount: opts.amount,
      amount_paid: opts.amountPaid ?? 0,
      due_date: opts.dueDate,
      status: opts.status ?? "issued",
      issued_at: new Date(opts.dueDate + "T00:00:00Z").toISOString(),
      last_accrual_date: opts.lastAccrualDate ?? null,
      linked_levy_id: opts.linkedLevyId ?? null,
    })
    .select("id")
    .single();
  if (error || !data)
    throw new Error(`createLevyNoticeFixture: ${error?.message}`);
  return {
    levyId: (data as { id: string }).id,
    amount: opts.amount,
    amountPaid: opts.amountPaid ?? 0,
    fundType,
  };
}

// ─── Scenarios ──────────────────────────────────────────────────────────

async function ia1_singleEligibleAccrued(ctx: ScenarioContext) {
  const sub = await createOCFixture(ctx);
  const lot = await createLotFixture(sub, 1);
  const levy = await createLevyNoticeFixture(
    sub,
    lot,
    { amount: 1000, dueDate: daysBefore(RUN_DATE, 60), status: "issued" },
    "ia1",
  );

  const result = await accrueInterestForOCJob({
    ocId: sub.ocId,
    runDate: RUN_DATE,
    systemProfileId: ctx.systemProfileId,
    supabase,
  });

  const expected = Math.round(levy.amount * 0.02 * 100) / 100; // 1000 * 0.02 = 20.00
  const completed = result.ok && result.outcome === "completed";
  const ok =
    completed &&
    result.accruedCount === 1 &&
    Math.abs(result.totalInterest - expected) < 0.005;
  record(
    "IA-1: single eligible levy accrued correctly",
    ok,
    completed
      ? `outcome=${result.outcome} count=${result.accruedCount} total=${result.totalInterest}`
      : !result.ok
        ? `failed: ${result.errorMessage}`
        : `outcome=${result.outcome}`,
  );
}

async function ia2_interestDisabledSkips(ctx: ScenarioContext) {
  const sub = await createOCFixture(ctx, { interestEnabled: false });
  const lot = await createLotFixture(sub, 1);
  await createLevyNoticeFixture(
    sub,
    lot,
    { amount: 1000, dueDate: daysBefore(RUN_DATE, 60), status: "issued" },
    "ia2",
  );

  const result = await accrueInterestForOCJob({
    ocId: sub.ocId,
    runDate: RUN_DATE,
    systemProfileId: ctx.systemProfileId,
    supabase,
  });

  const { count: penaltyCount } = await supabase
    .from("levy_notices")
    .select("id", { count: "exact", head: true })
    .eq("oc_id", sub.ocId)
    .eq("levy_type", "penalty_interest");

  const { data: runRow } = await supabase
    .from("interest_accrual_runs")
    .select("status, completed_at")
    .eq("oc_id", sub.ocId)
    .eq("run_date", RUN_DATE)
    .single();
  const r = runRow as { status: string; completed_at: string | null } | null;

  const ok =
    result.ok &&
    result.outcome === "skipped_no_eligible" &&
    penaltyCount === 0 &&
    r?.status === "skipped_no_eligible" &&
    r?.completed_at !== null;
  record(
    "IA-2: interest_enabled=false skips with completed_at stamped, no penalty notice",
    ok,
    `outcome=${result.outcome} penaltyCount=${penaltyCount} status=${r?.status} completed_at=${r?.completed_at ? "set" : "null"}`,
  );
}

async function ia3_paidInFullSkipped(ctx: ScenarioContext) {
  const sub = await createOCFixture(ctx);
  const lot = await createLotFixture(sub, 1);
  await createLevyNoticeFixture(
    sub,
    lot,
    {
      amount: 500,
      amountPaid: 500,
      dueDate: daysBefore(RUN_DATE, 60),
      status: "paid",
    },
    "ia3",
  );

  const result = await accrueInterestForOCJob({
    ocId: sub.ocId,
    runDate: RUN_DATE,
    systemProfileId: ctx.systemProfileId,
    supabase,
  });

  const { count: penaltyCount } = await supabase
    .from("levy_notices")
    .select("id", { count: "exact", head: true })
    .eq("oc_id", sub.ocId)
    .eq("levy_type", "penalty_interest");

  const ok =
    result.ok && result.outcome === "skipped_no_eligible" && penaltyCount === 0;
  record(
    "IA-3: levy paid in full skipped (no eligibility match)",
    ok,
    `outcome=${result.outcome} penaltyCount=${penaltyCount}`,
  );
}

async function ia4_withinGraceSkipped(ctx: ScenarioContext) {
  // Grace = 10 days; due 5 days ago (still within grace).
  const sub = await createOCFixture(ctx, {
    interestGracePeriodDays: 10,
  });
  const lot = await createLotFixture(sub, 1);
  await createLevyNoticeFixture(
    sub,
    lot,
    { amount: 500, dueDate: daysBefore(RUN_DATE, 5), status: "issued" },
    "ia4",
  );

  const result = await accrueInterestForOCJob({
    ocId: sub.ocId,
    runDate: RUN_DATE,
    systemProfileId: ctx.systemProfileId,
    supabase,
  });

  const { count: penaltyCount } = await supabase
    .from("levy_notices")
    .select("id", { count: "exact", head: true })
    .eq("oc_id", sub.ocId)
    .eq("levy_type", "penalty_interest");

  const ok =
    result.ok && result.outcome === "skipped_no_eligible" && penaltyCount === 0;
  record(
    "IA-4: levy past due_date but within grace_period_days skipped",
    ok,
    `outcome=${result.outcome} penaltyCount=${penaltyCount}`,
  );
}

async function ia5_recentlyAccruedSkipped(ctx: ScenarioContext) {
  // last_accrual_date 15 days ago , within the 1-month per-levy idempotency.
  const sub = await createOCFixture(ctx);
  const lot = await createLotFixture(sub, 1);
  await createLevyNoticeFixture(
    sub,
    lot,
    {
      amount: 500,
      dueDate: daysBefore(RUN_DATE, 90),
      status: "issued",
      lastAccrualDate: daysBefore(RUN_DATE, 15),
    },
    "ia5",
  );

  const result = await accrueInterestForOCJob({
    ocId: sub.ocId,
    runDate: RUN_DATE,
    systemProfileId: ctx.systemProfileId,
    supabase,
  });

  const { count: penaltyCount } = await supabase
    .from("levy_notices")
    .select("id", { count: "exact", head: true })
    .eq("oc_id", sub.ocId)
    .eq("levy_type", "penalty_interest");

  const ok =
    result.ok && result.outcome === "skipped_no_eligible" && penaltyCount === 0;
  record(
    "IA-5: last_accrual_date < 1 month ago skipped (per-levy idempotency)",
    ok,
    `outcome=${result.outcome} penaltyCount=${penaltyCount}`,
  );
}

async function ia6_sequentialRetryUniqueViolation(ctx: ScenarioContext) {
  const sub = await createOCFixture(ctx);
  const lot = await createLotFixture(sub, 1);
  await createLevyNoticeFixture(
    sub,
    lot,
    { amount: 1000, dueDate: daysBefore(RUN_DATE, 60), status: "issued" },
    "ia6",
  );

  const first = await accrueInterestForOCJob({
    ocId: sub.ocId,
    runDate: RUN_DATE,
    systemProfileId: ctx.systemProfileId,
    supabase,
  });
  const second = await accrueInterestForOCJob({
    ocId: sub.ocId,
    runDate: RUN_DATE,
    systemProfileId: ctx.systemProfileId,
    supabase,
  });

  const ok =
    first.ok &&
    first.outcome === "completed" &&
    second.ok &&
    second.outcome === "skipped_already_accrued";
  record(
    "IA-6: sequential retry on same (oc_id, run_date) → skipped_already_accrued",
    ok,
    `first=${first.outcome} second=${second.outcome}`,
  );
}

async function ia7_failedRowSatisfiesCheckConstraint(ctx: ScenarioContext) {
  // Direct chk_iar_failed_pair constraint exercise. The writeFailedRunRow
  // JS-side defensive fallback (errorMessage?.trim() || sentinel) is covered
  // indirectly by IA-15's end-to-end FK violation flow, which produces a
  // real non-empty error message. The branch where writeFailedRunRow
  // receives an empty/whitespace message and substitutes the sentinel is
  // 'should never happen' insurance , not directly tested. Acceptable
  // trade-off; the defensive fallback is the cheap belt-and-braces.
  //
  // Two direct INSERTs: (a) whitespace-only message must trip the CHECK;
  // (b) the actual sentinel string must satisfy it.
  const sub = await createOCFixture(ctx);

  // (a) Pure-whitespace message must trip chk_iar_failed_pair.
  const { error: emptyErr } = await supabase
    .from("interest_accrual_runs")
    .insert({
      oc_id: sub.ocId,
      run_date: RUN_DATE,
      status: "failed",
      error_message: "   ",
      completed_at: new Date().toISOString(),
    });

  // (b) writeFailedRunRow's actual fallback sentinel must satisfy the CHECK.
  const { error: sentinelErr } = await supabase
    .from("interest_accrual_runs")
    .insert({
      oc_id: sub.ocId,
      run_date: daysBefore(RUN_DATE, 1),
      status: "failed",
      error_message: "(unknown failure , empty error message)",
      completed_at: new Date().toISOString(),
    });

  const ok = !!emptyErr && !sentinelErr;
  record(
    "IA-7: caller failed-row write → empty msg rejected, sentinel accepted (chk_iar_failed_pair)",
    ok,
    `empty_rejected=${!!emptyErr} sentinel_accepted=${!sentinelErr}`,
  );
}

async function ia8_multipleEligibleAggregated(ctx: ScenarioContext) {
  const sub = await createOCFixture(ctx);
  const lot = await createLotFixture(sub, 1);
  await createLevyNoticeFixture(
    sub,
    lot,
    { amount: 1000, dueDate: daysBefore(RUN_DATE, 60), status: "issued" },
    "ia8a",
  );
  await createLevyNoticeFixture(
    sub,
    lot,
    { amount: 500, dueDate: daysBefore(RUN_DATE, 90), status: "partially_paid", amountPaid: 100 },
    "ia8b",
  );

  const result = await accrueInterestForOCJob({
    ocId: sub.ocId,
    runDate: RUN_DATE,
    systemProfileId: ctx.systemProfileId,
    supabase,
  });

  // Levy A: outstanding 1000 * 0.02 = 20.00; Levy B: outstanding 400 * 0.02 = 8.00; total = 28.00.
  const expected = 28.0;
  const completed = result.ok && result.outcome === "completed";
  const ok =
    completed &&
    result.accruedCount === 2 &&
    Math.abs(result.totalInterest - expected) < 0.005;
  record(
    "IA-8: multiple eligible levies aggregated (count=2, total=$28.00)",
    ok,
    completed
      ? `count=${result.accruedCount} total=${result.totalInterest}`
      : `outcome=${result.outcome}`,
  );
}

async function ia9_penaltyNoticeFields(ctx: ScenarioContext) {
  const sub = await createOCFixture(ctx);
  const lot = await createLotFixture(sub, 1);
  const parent = await createLevyNoticeFixture(
    sub,
    lot,
    {
      amount: 800,
      dueDate: daysBefore(RUN_DATE, 60),
      status: "issued",
      fundType: "capital_works",
      bpayCrn: "00012345",
    },
    "ia9",
  );

  await accrueInterestForOCJob({
    ocId: sub.ocId,
    runDate: RUN_DATE,
    systemProfileId: ctx.systemProfileId,
    supabase,
  });

  const { data: penalty } = await supabase
    .from("levy_notices")
    .select(
      "linked_levy_id, levy_type, bpay_crn, period_start, period_end, due_date, fund_type, last_accrual_date, batch_id, status",
    )
    .eq("oc_id", sub.ocId)
    .eq("levy_type", "penalty_interest")
    .single();
  const p = penalty as {
    linked_levy_id: string;
    levy_type: string;
    bpay_crn: string | null;
    period_start: string;
    period_end: string;
    due_date: string;
    fund_type: string;
    last_accrual_date: string | null;
    batch_id: string | null;
    status: string;
  } | null;

  const { data: parentLevy } = await supabase
    .from("levy_notices")
    .select("due_date")
    .eq("id", parent.levyId)
    .single();
  const parentDueDate = (parentLevy as { due_date: string }).due_date;

  const ok =
    !!p &&
    p.linked_levy_id === parent.levyId &&
    p.levy_type === "penalty_interest" &&
    p.bpay_crn === null &&
    p.period_start === parentDueDate &&
    p.period_end === RUN_DATE &&
    p.due_date === RUN_DATE &&
    p.fund_type === "capital_works" &&
    p.last_accrual_date === null &&
    p.batch_id === null &&
    p.status === "issued";
  record(
    "IA-9: penalty levy_notice fields verified (linked_levy_id, type, bpay_crn=NULL, period, due, fund, batch, last_accrual_date)",
    ok,
    p
      ? `linked=${p.linked_levy_id === parent.levyId} type=${p.levy_type} crn=${p.bpay_crn} fund=${p.fund_type} period_start=${p.period_start} period_end=${p.period_end} due=${p.due_date} batch=${p.batch_id} last_accrual=${p.last_accrual_date}`
      : "no penalty row found",
  );
}

async function ia10_ledgerDebitFields(ctx: ScenarioContext) {
  const sub = await createOCFixture(ctx);
  const lot = await createLotFixture(sub, 1);
  await createLevyNoticeFixture(
    sub,
    lot,
    { amount: 1000, dueDate: daysBefore(RUN_DATE, 60), status: "issued" },
    "ia10",
  );

  await accrueInterestForOCJob({
    ocId: sub.ocId,
    runDate: RUN_DATE,
    systemProfileId: ctx.systemProfileId,
    supabase,
  });

  const { data: debit } = await supabase
    .from("lot_ledger_entries")
    .select("category, allocation_priority, created_by, status, entry_type, amount, lot_id")
    .eq("lot_id", lot.lotId)
    .eq("category", "interest")
    .single();
  const d = debit as {
    category: string;
    allocation_priority: number;
    created_by: string;
    status: string;
    entry_type: string;
    amount: number | string;
    lot_id: string;
  } | null;

  const ok =
    !!d &&
    d.category === "interest" &&
    d.allocation_priority === 1 &&
    d.created_by === ctx.systemProfileId &&
    d.status === "active" &&
    d.entry_type === "debit" &&
    d.lot_id === lot.lotId &&
    Number(d.amount) === 20;
  record(
    "IA-10: ledger debit fields (category='interest', priority=1, created_by=systemProfile, status='active', amount)",
    ok,
    d
      ? `cat=${d.category} prio=${d.allocation_priority} by_match=${d.created_by === ctx.systemProfileId} status=${d.status} amt=${d.amount}`
      : "no debit row found",
  );
}

async function ia11_parentLastAccrualDateStamped(ctx: ScenarioContext) {
  const sub = await createOCFixture(ctx);
  const lot = await createLotFixture(sub, 1);
  const parent = await createLevyNoticeFixture(
    sub,
    lot,
    { amount: 1000, dueDate: daysBefore(RUN_DATE, 60), status: "issued" },
    "ia11",
  );

  await accrueInterestForOCJob({
    ocId: sub.ocId,
    runDate: RUN_DATE,
    systemProfileId: ctx.systemProfileId,
    supabase,
  });

  const { data: parentLevy } = await supabase
    .from("levy_notices")
    .select("last_accrual_date")
    .eq("id", parent.levyId)
    .single();
  const lad = (parentLevy as { last_accrual_date: string | null } | null)
    ?.last_accrual_date;

  record(
    "IA-11: parent levy's last_accrual_date stamped after accrual",
    lad === RUN_DATE,
    `last_accrual_date=${lad}`,
  );
}

async function ia12_penaltyTypeDoesNotCompound(ctx: ScenarioContext) {
  const sub = await createOCFixture(ctx);
  const lot = await createLotFixture(sub, 1);
  // Seed an EXISTING penalty_interest levy as if a prior accrual ran.
  // It must NOT be re-accrued on (eligibility predicate excludes
  // levy_type='penalty_interest').
  await createLevyNoticeFixture(
    sub,
    lot,
    {
      amount: 50,
      dueDate: daysBefore(RUN_DATE, 60),
      status: "issued",
      levyType: "penalty_interest",
    },
    "ia12",
  );

  const result = await accrueInterestForOCJob({
    ocId: sub.ocId,
    runDate: RUN_DATE,
    systemProfileId: ctx.systemProfileId,
    supabase,
  });

  const { count } = await supabase
    .from("levy_notices")
    .select("id", { count: "exact", head: true })
    .eq("oc_id", sub.ocId)
    .eq("levy_type", "penalty_interest");

  // Only the seeded penalty notice should exist (count=1). No new
  // penalty-on-penalty notice was created.
  const ok =
    result.ok && result.outcome === "skipped_no_eligible" && count === 1;
  record(
    "IA-12: penalty_interest levy doesn't compound (no penalty-on-penalty)",
    ok,
    `outcome=${result.outcome} penalty_count=${count}`,
  );
}

async function ia13_tinyOutstandingRoundsToZero(ctx: ScenarioContext) {
  const sub = await createOCFixture(ctx);
  const lot = await createLotFixture(sub, 1);
  // Outstanding = 0.01; 0.01 * 2% = 0.0002 → ROUND to 0.00 → CONTINUE.
  const parent = await createLevyNoticeFixture(
    sub,
    lot,
    {
      amount: 0.5,
      amountPaid: 0.49,
      dueDate: daysBefore(RUN_DATE, 60),
      status: "partially_paid",
    },
    "ia13",
  );

  const result = await accrueInterestForOCJob({
    ocId: sub.ocId,
    runDate: RUN_DATE,
    systemProfileId: ctx.systemProfileId,
    supabase,
  });

  const { count: penaltyCount } = await supabase
    .from("levy_notices")
    .select("id", { count: "exact", head: true })
    .eq("oc_id", sub.ocId)
    .eq("levy_type", "penalty_interest");

  const { data: parentLevy } = await supabase
    .from("levy_notices")
    .select("last_accrual_date")
    .eq("id", parent.levyId)
    .single();
  const lad = (parentLevy as { last_accrual_date: string | null } | null)
    ?.last_accrual_date;

  // CONTINUE skips before stamping last_accrual_date (architect documented
  // this as PRE_LAUNCH_CLEANUP item; expected behaviour for this release).
  const ok =
    result.ok &&
    result.outcome === "skipped_no_eligible" &&
    penaltyCount === 0 &&
    lad === null;
  record(
    "IA-13: tiny outstanding rounds to $0.00 → CONTINUE skip; no penalty; parent last_accrual_date NOT stamped",
    ok,
    `outcome=${result.outcome} penaltyCount=${penaltyCount} lad=${lad}`,
  );
}

async function ia14_multipleLotsRecomputed(ctx: ScenarioContext) {
  const sub = await createOCFixture(ctx);
  const lot1 = await createLotFixture(sub, 1);
  const lot2 = await createLotFixture(sub, 2);
  await createLevyNoticeFixture(
    sub,
    lot1,
    { amount: 1000, dueDate: daysBefore(RUN_DATE, 60), status: "issued" },
    "ia14a",
  );
  await createLevyNoticeFixture(
    sub,
    lot2,
    { amount: 2000, dueDate: daysBefore(RUN_DATE, 60), status: "issued" },
    "ia14b",
  );

  const result = await accrueInterestForOCJob({
    ocId: sub.ocId,
    runDate: RUN_DATE,
    systemProfileId: ctx.systemProfileId,
    supabase,
  });

  // recompute_lot_ledger_state should have updated lot_ledger_state per lot.
  // Verify the admin_balance reflects the new debits (negative = lot owes).
  const { data: state1 } = await supabase
    .from("lot_ledger_state")
    .select("admin_balance")
    .eq("lot_id", lot1.lotId)
    .single();
  const { data: state2 } = await supabase
    .from("lot_ledger_state")
    .select("admin_balance")
    .eq("lot_id", lot2.lotId)
    .single();
  const b1 = Number((state1 as { admin_balance: number | string } | null)?.admin_balance ?? 0);
  const b2 = Number((state2 as { admin_balance: number | string } | null)?.admin_balance ?? 0);

  // Lot1: -20.00 (1000 * 0.02). Lot2: -40.00 (2000 * 0.02).
  const completed = result.ok && result.outcome === "completed";
  const ok = completed && result.accruedCount === 2 && b1 === -20 && b2 === -40;
  record(
    "IA-14: multiple lots → recompute_lot_ledger_state called per lot (admin_balance reflects debits)",
    ok,
    `count=${completed ? result.accruedCount : "?"} lot1.admin=${b1} lot2.admin=${b2}`,
  );
}

async function ia15_systemProfileFkViolation(ctx: ScenarioContext) {
  const sub = await createOCFixture(ctx);
  const lot = await createLotFixture(sub, 1);
  const parent = await createLevyNoticeFixture(
    sub,
    lot,
    { amount: 1000, dueDate: daysBefore(RUN_DATE, 60), status: "issued" },
    "ia15",
  );

  // A UUID guaranteed not to exist in profiles. The RPC will INSERT into
  // lot_ledger_entries with this as created_by → FK 23503 violation. Whole
  // transaction rolls back; caller writes a failed run row.
  const fakeProfileId = randomUUID();

  const result = await accrueInterestForOCJob({
    ocId: sub.ocId,
    runDate: RUN_DATE,
    systemProfileId: fakeProfileId,
    supabase,
  });

  const { data: runRows } = await supabase
    .from("interest_accrual_runs")
    .select("status, error_message")
    .eq("oc_id", sub.ocId)
    .eq("run_date", RUN_DATE);
  const rows = (runRows ?? []) as { status: string; error_message: string | null }[];

  const { count: penaltyCount } = await supabase
    .from("levy_notices")
    .select("id", { count: "exact", head: true })
    .eq("oc_id", sub.ocId)
    .eq("levy_type", "penalty_interest");

  const { data: parentLevy } = await supabase
    .from("levy_notices")
    .select("last_accrual_date")
    .eq("id", parent.levyId)
    .single();
  const lad = (parentLevy as { last_accrual_date: string | null } | null)
    ?.last_accrual_date;

  // Exactly one run row, status='failed', error_message non-empty.
  // No penalty notice; parent last_accrual_date untouched (rollback).
  const ok =
    !result.ok &&
    result.outcome === "failed" &&
    rows.length === 1 &&
    rows[0].status === "failed" &&
    !!rows[0].error_message &&
    rows[0].error_message.trim().length > 0 &&
    penaltyCount === 0 &&
    lad === null;
  record(
    "IA-15: invalid systemProfileId → FK error; run-row rolled back; caller writes failed row; no orphan",
    ok,
    `result=${result.outcome} rows=${rows.length} status=${rows[0]?.status} msg_present=${!!rows[0]?.error_message} penalty=${penaltyCount} parent_lad=${lad}`,
  );
}

// ─── Cleanup ────────────────────────────────────────────────────────────

async function cleanupMarker() {
  const { data: companies } = await supabase
    .from("management_companies")
    .select("id")
    .like("name", `${VERIFY_MARKER}%`);
  const companyIds = (companies ?? []).map((c) => (c as { id: string }).id);
  if (companyIds.length === 0) return;
  for (const cid of companyIds) {
    await cleanupCompany(cid);
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
      // Break self-references on lot_ledger_entries before DELETE.
      await supabase
        .from("lot_ledger_entries")
        .update({ voided_by_entry_id: null, voids_entry_id: null })
        .in("lot_id", lotIds);
      await supabase.from("lot_ledger_entries").delete().in("lot_id", lotIds);
      await supabase.from("lot_ledger_state").delete().in("lot_id", lotIds);
    }

    // Break linked_levy_id self-references before deleting penalty rows.
    await supabase
      .from("levy_notices")
      .update({ linked_levy_id: null })
      .in("oc_id", subIds);
    await supabase.from("levy_notices").delete().in("oc_id", subIds);

    await supabase.from("interest_accrual_runs").delete().in("oc_id", subIds);

    await supabase.from("audit_log").delete().in("oc_id", subIds);
    await supabase.from("lots").delete().in("oc_id", subIds);
    await supabase.from("owners_corporations").delete().in("id", subIds);
  }

  // audit_log.profile_id has no ON DELETE clause (defaults to NO ACTION /
  // RESTRICT) , cross-oc audit rows authored by this fixture's
  // profiles would block the profiles DELETE. The oc-keyed delete
  // above already handles in-oc audit; this catches anything else
  // (e.g. future fixture writes that audit at the company level with
  // oc_id=NULL).
  const { data: profileRows } = await supabase
    .from("profiles")
    .select("id")
    .eq("management_company_id", companyId);
  const profileIds = (profileRows ?? []).map(
    (p) => (p as { id: string }).id,
  );
  if (profileIds.length > 0) {
    await supabase
      .from("audit_log")
      .delete()
      .in("profile_id", profileIds)
      .is("oc_id", null);
  }

  await supabase.from("profiles").delete().eq("management_company_id", companyId);
  await supabase.from("management_companies").delete().eq("id", companyId);
}

// ─── Main ───────────────────────────────────────────────────────────────

async function main() {
  const cleanupOnly = process.argv.includes("--cleanup");
  const noCleanup = process.argv.includes("--no-cleanup");

  if (cleanupOnly) {
    await cleanupMarker();
    process.exit(0);
  }

  console.log("Interest accrual verification , PP6-B-B scenarios IA-1..IA-15\n");
  console.log("[1/3] Cleaning up stale verification data");
  await cleanupMarker();

  console.log("[2/3] Setting up shared context (company + system profile)");
  const companyId = await createCompany();
  const managerProfileId = await createManagerProfile(companyId);
  const systemProfileId = await resolveSystemProfileId(supabase);
  const ctx: ScenarioContext = { companyId, systemProfileId, managerProfileId };

  console.log("[3/3] Running scenarios\n");
  await ia1_singleEligibleAccrued(ctx);
  await ia2_interestDisabledSkips(ctx);
  await ia3_paidInFullSkipped(ctx);
  await ia4_withinGraceSkipped(ctx);
  await ia5_recentlyAccruedSkipped(ctx);
  await ia6_sequentialRetryUniqueViolation(ctx);
  await ia7_failedRowSatisfiesCheckConstraint(ctx);
  await ia8_multipleEligibleAggregated(ctx);
  await ia9_penaltyNoticeFields(ctx);
  await ia10_ledgerDebitFields(ctx);
  await ia11_parentLastAccrualDateStamped(ctx);
  await ia12_penaltyTypeDoesNotCompound(ctx);
  await ia13_tinyOutstandingRoundsToZero(ctx);
  await ia14_multipleLotsRecomputed(ctx);
  await ia15_systemProfileFkViolation(ctx);

  if (!noCleanup) {
    console.log("\nCleaning up");
    await cleanupCompany(companyId);
  }

  const failed = results.filter((r) => !r.passed).length;
  console.log(`\n${results.length - failed}/${results.length} scenarios passed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
