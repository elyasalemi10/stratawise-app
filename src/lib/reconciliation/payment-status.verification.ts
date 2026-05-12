/**
 * Payment-status verification (Prompt 4 PP4-C).
 *
 * Exercises computeLevyPaymentStatus end-to-end through the TS → SQL
 * boundary, snapshot semantics (entries voided/created relative to
 * asOfDate), and a 100-notice performance benchmark.
 *
 * Per the PP4-C performance gate: the benchmark runs FIRST. If it exceeds
 * 500ms the script halts and surfaces — rewrite _walk_per_notice_status
 * (single-CTE query OR denormalised paid_amount on levy_notices) before
 * continuing. Don't paper over with a higher tolerance threshold.
 *
 * Usage:
 *   npx tsx src/lib/reconciliation/payment-status.verification.ts
 *   npx tsx src/lib/reconciliation/payment-status.verification.ts --no-cleanup
 *   npx tsx src/lib/reconciliation/payment-status.verification.ts --cleanup
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import { computeLevyPaymentStatus } from "./payment-status";
import { generateSubdivisionCode } from "@/lib/subdivision-code";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local",
  );
  process.exit(1);
}

const VERIFY_MARKER = "__VERIFY_PAYSTATUS__";
const supabase = createClient(supabaseUrl, serviceRoleKey);

// Performance gate thresholds.
const PERF_HALT_MS = 500;
const PERF_FLAG_MS = 100;

type Result = { scenario: string; passed: boolean; detail: string };
const results: Result[] = [];

function record(scenario: string, passed: boolean, detail: string) {
  results.push({ scenario, passed, detail });
  console.log(
    `  ${passed ? "PASS" : "FAIL"}  ${scenario}${detail ? " — " + detail : ""}`,
  );
}

function assert(cond: unknown, msg = "assertion failed"): asserts cond {
  if (!cond) throw new Error(msg);
}

// ─── Fixture ──────────────────────────────────────────────────────────────

interface Fixture {
  runId: string;
  companyId: string;
  subdivisionId: string;
  budgetId: string;
  capitalBudgetId: string;
  profileId: string;
}

async function createFixture(): Promise<Fixture> {
  const runId = `${Date.now()}_${randomUUID().slice(0, 8)}`;
  const name = `${VERIFY_MARKER}${runId}`;
  const email = `${VERIFY_MARKER.toLowerCase()}${runId}@paystatus.test`;
  const clerkId = `${VERIFY_MARKER}_CLERK_${runId}`;

  console.log(`\nCreating fixture (runId=${runId})`);

  const { data: company } = await supabase
    .from("management_companies")
    .insert({ name })
    .select("id")
    .single();
  assert(company, "fixture: company");

  const { data: profile } = await supabase
    .from("profiles")
    .insert({
      auth_user_id: clerkId,
      email,
      first_name: "PS",
      last_name: "Verify",
      role: "strata_manager",
      company_role: "admin",
      management_company_id: company.id,
    })
    .select("id")
    .single();
  assert(profile, "fixture: profile");

  const { data: subdivision } = await supabase
    .from("subdivisions")
    .insert({
      management_company_id: company.id,
      name,
      plan_number: `PLAN-${runId}`,
      short_code: generateSubdivisionCode(),
      address: "1 PS Verify St, Melbourne VIC 3000",
      total_lots: 1,
      created_by: profile.id,
    })
    .select("id")
    .single();
  assert(subdivision, "fixture: subdivision");

  const { data: budget } = await supabase
    .from("budgets")
    .insert({
      subdivision_id: subdivision.id,
      financial_year: "2026-2027",
      fund_type: "administrative",
      total_amount: 12000,
      status: "approved",
      approved_by: profile.id,
      approved_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  assert(budget, "fixture: admin budget");

  const { data: capitalBudget } = await supabase
    .from("budgets")
    .insert({
      subdivision_id: subdivision.id,
      financial_year: "2026-2027",
      fund_type: "capital_works",
      total_amount: 8000,
      status: "approved",
      approved_by: profile.id,
      approved_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  assert(capitalBudget, "fixture: capital budget");

  return {
    runId,
    companyId: company.id,
    subdivisionId: subdivision.id,
    budgetId: budget.id,
    capitalBudgetId: capitalBudget.id,
    profileId: profile.id,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────

let _lotCounter = 1000;
async function makeLot(fx: Fixture): Promise<string> {
  const n = _lotCounter++;
  const { data: lot } = await supabase
    .from("lots")
    .insert({
      subdivision_id: fx.subdivisionId,
      lot_number: n,
      lot_entitlement: 100,
      lot_liability: 100,
    })
    .select("id")
    .single();
  assert(lot, "makeLot");
  return lot.id;
}

interface NoticeOpts {
  amount?: number;
  fundType?: "administrative" | "capital_works";
  dueDate?: string;
  periodStart?: string;
}

async function makeNotice(
  fx: Fixture,
  lotId: string,
  opts: NoticeOpts = {},
): Promise<{ id: string; reference: string }> {
  const { data: ref } = await supabase.rpc("next_reference_number", {
    p_prefix: "LEV",
    p_subdivision_id: fx.subdivisionId,
  });
  const reference = String(ref);
  const fundType = opts.fundType ?? "administrative";
  const { data: notice, error } = await supabase
    .from("levy_notices")
    .insert({
      subdivision_id: fx.subdivisionId,
      lot_id: lotId,
      budget_id: fundType === "capital_works" ? fx.capitalBudgetId : fx.budgetId,
      reference_number: reference,
      fund_type: fundType,
      levy_type: "regular",
      period_start: opts.periodStart ?? "2026-01-01",
      period_end: "2026-03-31",
      amount: opts.amount ?? 500,
      due_date: opts.dueDate ?? "2026-04-28",
      status: "draft",
    })
    .select("id")
    .single();
  if (error || !notice) {
    throw new Error(`makeNotice: ${error?.message ?? "insert failed"} (ref=${reference}, lot=${lotId})`);
  }
  return { id: notice.id, reference };
}

interface DebitOpts {
  fundType?: "administrative" | "capital_works";
  entryDate?: string;
}
async function makeDebit(
  fx: Fixture,
  lotId: string,
  noticeId: string,
  reference: string,
  amount: number,
  opts: DebitOpts = {},
): Promise<string> {
  const { data, error } = await supabase
    .from("lot_ledger_entries")
    .insert({
      subdivision_id: fx.subdivisionId,
      lot_id: lotId,
      fund_type: opts.fundType ?? "administrative",
      entry_type: "debit",
      category: "levy",
      amount,
      entry_date: opts.entryDate ?? "2026-01-01",
      reference,
      levy_notice_id: noticeId,
      status: "active",
      created_by: fx.profileId,
    })
    .select("id")
    .single();
  if (error || !data) {
    throw new Error(`makeDebit: ${error?.message ?? "insert failed"}`);
  }
  return data.id;
}

interface CreditOpts {
  fundType?: "administrative" | "capital_works";
  entryDate?: string;
  reference?: string | null;
  noticeId?: string | null;
}
async function makeCredit(
  fx: Fixture,
  lotId: string,
  amount: number,
  opts: CreditOpts = {},
): Promise<string> {
  const { data, error } = await supabase
    .from("lot_ledger_entries")
    .insert({
      subdivision_id: fx.subdivisionId,
      lot_id: lotId,
      fund_type: opts.fundType ?? "administrative",
      entry_type: "credit",
      category: "payment",
      amount,
      entry_date: opts.entryDate ?? "2026-02-15",
      reference: opts.reference ?? null,
      levy_notice_id: opts.noticeId ?? null,
      status: "active",
      created_by: fx.profileId,
    })
    .select("id")
    .single();
  if (error || !data) {
    throw new Error(`makeCredit: ${error?.message ?? "insert failed"}`);
  }
  return data.id;
}

// ─── Performance benchmark (runs FIRST) ───────────────────────────────────

async function perfBenchmark100Notices(fx: Fixture) {
  const header = "PERF: 100-notice lot — computeLevyPaymentStatus latency";
  try {
    const lotId = await makeLot(fx);

    // 100 notices, mixed paid/partial/outstanding
    const notices: Array<{ id: string; reference: string }> = [];
    for (let i = 0; i < 100; i++) {
      const month = String((i % 12) + 1).padStart(2, "0");
      const n = await makeNotice(fx, lotId, {
        amount: 100,
        periodStart: `2026-${month}-01`,
        dueDate: `2026-${month}-28`,
      });
      notices.push(n);
      await makeDebit(fx, lotId, n.id, n.reference, 100, {
        entryDate: `2026-${month}-01`,
      });
    }
    // 60 fully paid — 3 credits each ($33.33 + $33.33 + $33.34, on three
    // different dates) so the per-notice settling walk traverses multiple
    // credits, mirroring real-world part-payment behaviour. Total: 180 credits.
    // Dates are <= today (2026-04-28) so the snapshot's date filter doesn't
    // exclude them.
    for (let i = 0; i < 60; i++) {
      await makeCredit(fx, lotId, 33.33, {
        entryDate: "2026-02-05",
        reference: notices[i].reference,
        noticeId: notices[i].id,
      });
      await makeCredit(fx, lotId, 33.33, {
        entryDate: "2026-02-15",
        reference: notices[i].reference,
        noticeId: notices[i].id,
      });
      await makeCredit(fx, lotId, 33.34, {
        entryDate: "2026-02-25",
        reference: notices[i].reference,
        noticeId: notices[i].id,
      });
    }
    // 20 partial — 2 credits each ($25 + $25 = $50). Total: 40 credits.
    for (let i = 60; i < 80; i++) {
      await makeCredit(fx, lotId, 25, {
        entryDate: "2026-02-05",
        reference: notices[i].reference,
        noticeId: notices[i].id,
      });
      await makeCredit(fx, lotId, 25, {
        entryDate: "2026-02-20",
        reference: notices[i].reference,
        noticeId: notices[i].id,
      });
    }
    // 80–99: no credits → outstanding
    // Total credits in fixture: 220 across 80 notices (avg 2.75/notice).

    // Cold + warm runs.
    const t0 = performance.now();
    const cold = await computeLevyPaymentStatus(lotId);
    const t1 = performance.now();
    const warm = await computeLevyPaymentStatus(lotId);
    const t2 = performance.now();
    const coldMs = Math.round(t1 - t0);
    const warmMs = Math.round(t2 - t1);

    assert(cold.length === 100, `PERF expected 100 rows, got ${cold.length}`);
    assert(warm.length === 100, `PERF warm expected 100 rows`);

    // Spot-check counts.
    const paid = cold.filter((r) => r.status === "paid").length;
    const partial = cold.filter((r) => r.status === "partially_paid").length;
    const outstanding = cold.filter((r) => r.status === "outstanding").length;
    assert(paid === 60, `PERF expected 60 paid, got ${paid}`);
    assert(partial === 20, `PERF expected 20 partial, got ${partial}`);
    assert(outstanding === 20, `PERF expected 20 outstanding, got ${outstanding}`);

    let bandLabel: string;
    if (coldMs < PERF_FLAG_MS) {
      bandLabel = `< ${PERF_FLAG_MS}ms — ship as-is`;
    } else if (coldMs < PERF_HALT_MS) {
      bandLabel = `${PERF_FLAG_MS}–${PERF_HALT_MS}ms — ship + PRE_LAUNCH_CLEANUP item`;
    } else {
      bandLabel = `≥ ${PERF_HALT_MS}ms — HALT, rewrite required`;
    }

    record(
      header,
      coldMs < PERF_HALT_MS,
      `cold=${coldMs}ms warm=${warmMs}ms (paid=${paid}, partial=${partial}, outstanding=${outstanding}) — ${bandLabel}`,
    );

    if (coldMs >= PERF_HALT_MS) {
      console.error(
        `\n*** PERFORMANCE GATE FAILED *** cold=${coldMs}ms exceeds ${PERF_HALT_MS}ms halt threshold.`,
      );
      console.error(
        "Rewrite _walk_per_notice_status as a single-CTE query, OR denormalise paid_amount onto levy_notices via trigger before continuing.",
      );
      process.exit(1);
    }

    return { coldMs, warmMs };
  } catch (e) {
    record(header, false, (e as Error).message);
    throw e;
  }
}

// ─── Scenario PS-1 ────────────────────────────────────────────────────────

async function scenarioPS1_FiveNoticeMixed(fx: Fixture) {
  const header =
    "PS-1: 5-notice lot — 3 paid + 1 partial + 1 outstanding → 5 rows with correct status each";
  try {
    const lotId = await makeLot(fx);
    const ns = await Promise.all([
      makeNotice(fx, lotId, { amount: 100, periodStart: "2026-01-01", dueDate: "2026-01-28" }),
      makeNotice(fx, lotId, { amount: 100, periodStart: "2026-02-01", dueDate: "2026-02-28" }),
      makeNotice(fx, lotId, { amount: 100, periodStart: "2026-03-01", dueDate: "2026-03-28" }),
      makeNotice(fx, lotId, { amount: 100, periodStart: "2026-04-01", dueDate: "2026-04-28" }),
      makeNotice(fx, lotId, { amount: 100, periodStart: "2026-05-01", dueDate: "2026-05-28" }),
    ]);
    for (let i = 0; i < ns.length; i++) {
      await makeDebit(fx, lotId, ns[i].id, ns[i].reference, 100, {
        entryDate: ["2026-01-01","2026-02-01","2026-03-01","2026-04-01","2026-05-01"][i],
      });
    }
    // Notices 0,1,2 → paid. Notice 3 → partial. Notice 4 → outstanding.
    for (let i = 0; i < 3; i++) {
      await makeCredit(fx, lotId, 100, {
        entryDate: "2026-06-15",
        reference: ns[i].reference,
        noticeId: ns[i].id,
      });
    }
    await makeCredit(fx, lotId, 50, {
      entryDate: "2026-06-15",
      reference: ns[3].reference,
      noticeId: ns[3].id,
    });

    const rows = await computeLevyPaymentStatus(lotId, "2026-12-31");
    assert(rows.length === 5, `PS-1 expected 5 rows, got ${rows.length}`);
    const byId = new Map(rows.map((r) => [r.notice_id, r]));

    for (let i = 0; i < 3; i++) {
      const r = byId.get(ns[i].id);
      assert(r, `PS-1 row missing for ${ns[i].reference}`);
      assert(r.status === "paid", `PS-1 ${ns[i].reference} status: ${r.status}`);
      assert(r.outstanding_amount === 0, `PS-1 ${ns[i].reference} outstanding: ${r.outstanding_amount}`);
      assert(r.paid_date !== null, `PS-1 ${ns[i].reference} paid_date should be set`);
    }
    const r3 = byId.get(ns[3].id);
    assert(r3 && r3.status === "partially_paid", `PS-1 n3 status: ${r3?.status}`);
    assert(r3.paid_amount === 50, `PS-1 n3 paid_amount: ${r3.paid_amount}`);
    assert(r3.outstanding_amount === 50, `PS-1 n3 outstanding: ${r3.outstanding_amount}`);
    assert(r3.paid_date === null, `PS-1 n3 paid_date should be null on partial`);

    const r4 = byId.get(ns[4].id);
    assert(r4 && r4.status === "outstanding", `PS-1 n4 status: ${r4?.status}`);
    assert(r4.paid_amount === 0, `PS-1 n4 paid_amount: ${r4.paid_amount}`);
    assert(r4.outstanding_amount === 100, `PS-1 n4 outstanding: ${r4.outstanding_amount}`);

    record(header, true, `5 notices: 3 paid, 1 partial ($50 of $100), 1 outstanding ($100)`);
  } catch (e) {
    record(header, false, (e as Error).message);
  }
}

// ─── Scenario PS-2 ────────────────────────────────────────────────────────

async function scenarioPS2_VoidAfterAsOfDate(fx: Fixture) {
  const header =
    "PS-2: snapshot — credit voided AFTER asOfDate appears active in snapshot";
  try {
    const lotId = await makeLot(fx);
    const n = await makeNotice(fx, lotId, {
      amount: 200,
      periodStart: "2025-01-01",
      dueDate: "2025-01-28",
    });
    await makeDebit(fx, lotId, n.id, n.reference, 200, { entryDate: "2025-01-01" });
    const creditId = await makeCredit(fx, lotId, 200, {
      entryDate: "2025-03-15",
      reference: n.reference,
      noticeId: n.id,
    });

    // Void the credit (voided_at = NOW, far future relative to asOfDate=2025-06-01).
    const { error } = await supabase.rpc("rpc_ledger_void", {
      p_entry_id: creditId,
      p_reason: "PS-2: void after asOfDate snapshot",
      p_voided_by: fx.profileId,
    });
    assert(!error, `PS-2 rpc_ledger_void error: ${error?.message}`);

    // At asOfDate = 2025-06-01 (after credit, before void): credit visible, notice paid.
    const past = await computeLevyPaymentStatus(lotId, "2025-06-01");
    assert(past.length === 1, `PS-2 past expected 1 row`);
    assert(
      past[0].status === "paid",
      `PS-2 past expected paid (credit visible in snapshot), got ${past[0].status}`,
    );
    assert(past[0].paid_amount === 200, `PS-2 past paid_amount: ${past[0].paid_amount}`);

    // At today: void is in past, credit excluded. Notice outstanding.
    const today = await computeLevyPaymentStatus(lotId);
    assert(today.length === 1);
    assert(
      today[0].status === "outstanding",
      `PS-2 today expected outstanding (credit excluded post-void), got ${today[0].status}`,
    );
    assert(today[0].paid_amount === 0, `PS-2 today paid_amount=0 expected`);

    record(header, true, `at asOfDate=2025-06-01: paid; at today: outstanding (credit voided)`);
  } catch (e) {
    record(header, false, (e as Error).message);
  }
}

// ─── Scenario PS-3 ────────────────────────────────────────────────────────

async function scenarioPS3_EntryAfterAsOfDateExcluded(fx: Fixture) {
  const header =
    "PS-3: snapshot — entry created AFTER asOfDate excluded from snapshot";
  try {
    const lotId = await makeLot(fx);
    const n = await makeNotice(fx, lotId, {
      amount: 300,
      periodStart: "2025-01-01",
      dueDate: "2025-01-28",
    });
    await makeDebit(fx, lotId, n.id, n.reference, 300, { entryDate: "2025-01-01" });
    // Credit dated 2025-06-01 — visible at asOfDate ≥ 2025-06-01, excluded earlier.
    await makeCredit(fx, lotId, 300, {
      entryDate: "2025-06-01",
      reference: n.reference,
      noticeId: n.id,
    });

    // asOfDate = 2025-03-01 (before credit's entry_date) → credit excluded → outstanding
    const before = await computeLevyPaymentStatus(lotId, "2025-03-01");
    assert(before.length === 1);
    assert(
      before[0].status === "outstanding",
      `PS-3 expected outstanding at 2025-03-01, got ${before[0].status}`,
    );
    assert(before[0].paid_amount === 0, `PS-3 paid_amount=0 expected at 2025-03-01`);

    // asOfDate = 2025-12-01 (after credit's entry_date) → credit visible → paid
    const after = await computeLevyPaymentStatus(lotId, "2025-12-01");
    assert(after[0].status === "paid", `PS-3 expected paid at 2025-12-01, got ${after[0].status}`);
    assert(after[0].paid_amount === 300, `PS-3 paid_amount=300 expected at 2025-12-01`);
    assert(after[0].paid_date === "2025-06-01", `PS-3 paid_date expected 2025-06-01`);

    record(header, true, `entry_date=2025-06-01: invisible at 2025-03-01; visible at 2025-12-01`);
  } catch (e) {
    record(header, false, (e as Error).message);
  }
}

// ─── Scenario PS-4 ────────────────────────────────────────────────────────

async function scenarioPS4_TargetedVsUntargetedCredits(fx: Fixture) {
  const header =
    "PS-4: untargeted (free-pool) credits do NOT count toward a specific notice's paid_amount";
  try {
    const lotId = await makeLot(fx);
    const n = await makeNotice(fx, lotId, {
      amount: 500,
      periodStart: "2026-01-01",
      dueDate: "2026-01-28",
    });
    await makeDebit(fx, lotId, n.id, n.reference, 500, { entryDate: "2026-01-01" });

    // Targeted credit: links via levy_notice_id AND reference.
    await makeCredit(fx, lotId, 200, {
      entryDate: "2026-02-15",
      reference: n.reference,
      noticeId: n.id,
    });
    // Untargeted credit: levy_notice_id IS NULL AND reference IS NULL.
    // Should NOT count against this notice in payment-status.
    await makeCredit(fx, lotId, 1000, {
      entryDate: "2026-02-15",
      reference: null,
      noticeId: null,
    });

    const rows = await computeLevyPaymentStatus(lotId, "2026-12-31");
    assert(rows.length === 1, `PS-4 expected 1 row, got ${rows.length}`);
    assert(
      rows[0].status === "partially_paid",
      `PS-4 status: ${rows[0].status} (expected partially_paid; untargeted $1000 must NOT count)`,
    );
    assert(rows[0].paid_amount === 200, `PS-4 paid_amount: ${rows[0].paid_amount} (expected 200, only the targeted credit)`);
    assert(rows[0].outstanding_amount === 300, `PS-4 outstanding: ${rows[0].outstanding_amount}`);

    record(header, true, `targeted $200 counts; untargeted $1000 does NOT (status=partially_paid, paid=200, outstanding=300)`);
  } catch (e) {
    record(header, false, (e as Error).message);
  }
}

// ─── Scenario PS-5 ────────────────────────────────────────────────────────

async function scenarioPS5_MultiFundLot(fx: Fixture) {
  const header =
    "PS-5: multi-fund lot — admin paid + capital outstanding → 2 rows with correct fund_type";
  try {
    const lotId = await makeLot(fx);
    const adminN = await makeNotice(fx, lotId, {
      amount: 400,
      fundType: "administrative",
      periodStart: "2026-01-01",
      dueDate: "2026-01-28",
    });
    const capitalN = await makeNotice(fx, lotId, {
      amount: 600,
      fundType: "capital_works",
      periodStart: "2026-02-01",
      dueDate: "2026-02-28",
    });
    await makeDebit(fx, lotId, adminN.id, adminN.reference, 400, {
      fundType: "administrative",
      entryDate: "2026-01-01",
    });
    await makeDebit(fx, lotId, capitalN.id, capitalN.reference, 600, {
      fundType: "capital_works",
      entryDate: "2026-02-01",
    });
    // Admin paid in full.
    await makeCredit(fx, lotId, 400, {
      fundType: "administrative",
      entryDate: "2026-03-01",
      reference: adminN.reference,
      noticeId: adminN.id,
    });

    const rows = await computeLevyPaymentStatus(lotId, "2026-12-31");
    assert(rows.length === 2, `PS-5 expected 2 rows, got ${rows.length}`);
    const adminRow = rows.find((r) => r.fund_type === "administrative");
    const capitalRow = rows.find((r) => r.fund_type === "capital_works");
    assert(adminRow, "PS-5 missing administrative row");
    assert(capitalRow, "PS-5 missing capital_works row");

    assert(adminRow.status === "paid", `PS-5 admin status: ${adminRow.status}`);
    assert(adminRow.paid_amount === 400, `PS-5 admin paid_amount: ${adminRow.paid_amount}`);
    assert(adminRow.outstanding_amount === 0, `PS-5 admin outstanding: ${adminRow.outstanding_amount}`);

    assert(capitalRow.status === "outstanding", `PS-5 capital status: ${capitalRow.status}`);
    assert(capitalRow.paid_amount === 0, `PS-5 capital paid_amount: ${capitalRow.paid_amount}`);
    assert(capitalRow.outstanding_amount === 600, `PS-5 capital outstanding: ${capitalRow.outstanding_amount}`);

    record(header, true, `admin (paid) + capital (outstanding) returned with correct fund_type per row`);
  } catch (e) {
    record(header, false, (e as Error).message);
  }
}

// ─── Cleanup ──────────────────────────────────────────────────────────────

async function cleanupMarker() {
  console.log(`\nCleaning up test data with marker "${VERIFY_MARKER}"`);
  const { data: companies } = await supabase
    .from("management_companies")
    .select("id")
    .like("name", `${VERIFY_MARKER}%`);
  if (!companies || companies.length === 0) {
    console.log("  (nothing to clean up)");
    return;
  }
  for (const c of companies) {
    await cleanupOneCompany(c.id);
  }
  console.log(`Cleaned up ${companies.length} test run(s).`);
}

async function cleanupOneCompany(companyId: string) {
  const { data: subs } = await supabase
    .from("subdivisions")
    .select("id")
    .eq("management_company_id", companyId);
  const subIds = (subs ?? []).map((s) => s.id);

  if (subIds.length > 0) {
    const { data: lots } = await supabase
      .from("lots")
      .select("id")
      .in("subdivision_id", subIds);
    const lotIds = (lots ?? []).map((l) => l.id);
    if (lotIds.length > 0) {
      await supabase
        .from("lot_ledger_entries")
        .update({ voided_by_entry_id: null, voids_entry_id: null })
        .in("lot_id", lotIds);
      await supabase.from("lot_ledger_entries").delete().in("lot_id", lotIds);
      await supabase.from("lot_ledger_state").delete().in("lot_id", lotIds);
    }

    const { data: notices } = await supabase
      .from("levy_notices")
      .select("id")
      .in("subdivision_id", subIds);
    const noticeIds = (notices ?? []).map((n) => n.id);
    if (noticeIds.length > 0) {
      await supabase.from("levy_notice_items").delete().in("levy_notice_id", noticeIds);
      await supabase.from("levy_notices").delete().in("subdivision_id", subIds);
    }
    await supabase.from("audit_log").delete().in("subdivision_id", subIds);
    await supabase.from("subdivisions").delete().in("id", subIds);
  }
  await supabase.from("profiles").delete().eq("management_company_id", companyId);
  await supabase.from("management_companies").delete().eq("id", companyId);
}

// ─── Main ─────────────────────────────────────────────────────────────────

async function main() {
  const cleanupOnly = process.argv.includes("--cleanup");
  const noCleanup = process.argv.includes("--no-cleanup");

  if (cleanupOnly) {
    await cleanupMarker();
    process.exit(0);
  }

  console.log("Payment-status verification — PP4-C scenarios");

  await cleanupMarker();
  const fx = await createFixture();

  try {
    // PERF benchmark FIRST per PP4-C gate. Halts the script if > 500ms.
    await perfBenchmark100Notices(fx);

    // Functional scenarios
    await scenarioPS1_FiveNoticeMixed(fx);
    await scenarioPS2_VoidAfterAsOfDate(fx);
    await scenarioPS3_EntryAfterAsOfDateExcluded(fx);
    await scenarioPS4_TargetedVsUntargetedCredits(fx);
    await scenarioPS5_MultiFundLot(fx);
  } catch (e) {
    console.error(`\nFatal in scenarios: ${(e as Error).message}`);
  }

  const passed = results.filter((r) => r.passed).length;
  const failed = results.length - passed;
  console.log(
    `\nResults: ${passed} passed, ${failed} failed, ${results.length} total`,
  );

  if (!noCleanup) {
    await cleanupOneCompany(fx.companyId);
  } else {
    console.log(`\n--no-cleanup: leaving test data under management_company ${fx.companyId}`);
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("Unhandled error:", e);
  process.exit(1);
});
