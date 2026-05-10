/**
 * Ledger-side duplicate-detection verification (PP5-B).
 *
 * Exercises the detector + marker + centralised integration helper, the
 * three integration sites (orchestrator, reconcileTransaction,
 * recordCashReceipt), and the manager review server actions
 * (voidAsLedgerDuplicate, keepAsOverpayment) end-to-end against the live
 * Supabase dev DB.
 *
 * Usage:
 *   npx tsx src/lib/reconciliation/ledger-duplicate-detection.verification.ts
 *   npx tsx src/lib/reconciliation/ledger-duplicate-detection.verification.ts --no-cleanup
 *   npx tsx src/lib/reconciliation/ledger-duplicate-detection.verification.ts --cleanup
 *
 * Test data is tagged with VERIFY_MARKER on management_companies.name and
 * profiles.email/clerk_id, so --cleanup never touches real data.
 */

import { config } from "dotenv";
config({ path: ".env.local" });

// PP6-D-D-fix: gate Resend sends. This suite calls reconcileTransaction
// which triggers emitPaymentReceivedEmail on each created credit.
process.env.EMAIL_DRY_RUN = "true";

// ─── next/cache stub ─────────────────────────────────────────────────────
import { createRequire } from "node:module";
const scriptRequire = createRequire(import.meta.url);
const nextCachePath = scriptRequire.resolve("next/cache");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(scriptRequire.cache as any)[nextCachePath] = {
  id: nextCachePath,
  filename: nextCachePath,
  loaded: true,
  exports: {
    revalidatePath: () => {},
    revalidateTag: () => {},
    updateTag: () => {},
    unstable_cache: <T extends (...args: unknown[]) => unknown>(fn: T) => fn,
  },
  paths: [],
  children: [],
};

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import {
  __setUserIdResolverForVerification,
  __getUserIdResolverForVerification,
} from "@/lib/auth-resolver";
import { generateSubdivisionCode } from "@/lib/subdivision-code";
import {
  detectLedgerDuplicate,
  markLedgerDuplicate,
} from "./ledger-duplicate-detection";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const VERIFY_MARKER = "__VERIFY_LEDGER_DUP__";
const VERIFY_CLERK_ID = `${VERIFY_MARKER}_CLERK_${Date.now()}_${randomUUID().slice(0, 8)}`;

__setUserIdResolverForVerification(async () => VERIFY_CLERK_ID);
if (__getUserIdResolverForVerification() === null) {
  console.error("Fatal: verification userId resolver is null after being set.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

type Result = { scenario: string; passed: boolean; detail: string };
const results: Result[] = [];

function record(scenario: string, passed: boolean, detail: string) {
  results.push({ scenario, passed, detail });
  console.log(`  ${passed ? "PASS" : "FAIL"}  ${scenario}${detail ? " — " + detail : ""}`);
}

function assert(cond: unknown, msg = "assertion failed"): asserts cond {
  if (!cond) throw new Error(msg);
}

// ─── Fixture ──────────────────────────────────────────────────────────────

interface Fixture {
  runId: string;
  companyId: string;
  subdivisionId: string;
  profileId: string;
  budgetId: string;
  bankAccountId: string;
  lotAId: string;
  lotBId: string;
  noticeAId: string; // outstanding $500 levy on lot A
  noticeBId: string; // outstanding $500 levy on lot B (cross-lot tests)
  noticeCId: string; // outstanding $250 levy on lot A (different notice tests)
}

async function createFixture(): Promise<Fixture> {
  const runId = `${Date.now()}_${randomUUID().slice(0, 8)}`;
  const companyName = `${VERIFY_MARKER}${runId}`;
  const email = `${VERIFY_MARKER.toLowerCase()}${runId}@ldup.test`;

  const { data: company } = await supabase
    .from("management_companies")
    .insert({ name: companyName })
    .select("id")
    .single();
  assert(company, "fixture: company insert failed");

  const { data: profile } = await supabase
    .from("profiles")
    .insert({
      clerk_id: VERIFY_CLERK_ID,
      email,
      first_name: "LDup",
      last_name: "Verify",
      role: "strata_manager",
      company_role: "admin",
      management_company_id: company.id,
    })
    .select("id")
    .single();
  assert(profile, "fixture: profile insert failed");

  const { data: subdivision } = await supabase
    .from("subdivisions")
    .insert({
      management_company_id: company.id,
      name: companyName,
      plan_number: `PLAN-${runId}`,
      short_code: generateSubdivisionCode(),
      address: "1 LDup Verify St, Melbourne VIC 3000",
      total_lots: 2,
      created_by: profile.id,
    })
    .select("id")
    .single();
  assert(subdivision, "fixture: subdivision insert failed");

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
  assert(budget, "fixture: budget insert failed");

  const { data: lots } = await supabase
    .from("lots")
    .insert([
      { subdivision_id: subdivision.id, lot_number: 1, lot_entitlement: 100, lot_liability: 100 },
      { subdivision_id: subdivision.id, lot_number: 2, lot_entitlement: 100, lot_liability: 100 },
    ])
    .select("id, lot_number")
    .order("lot_number", { ascending: true });
  assert(lots && lots.length === 2, "fixture: lots insert failed");

  const { data: bankAccount } = await supabase
    .from("bank_accounts")
    .insert({
      subdivision_id: subdivision.id,
      account_name: "Admin Account",
      bsb: "012-345",
      account_number: "33333333",
      fund_type: "administrative",
    })
    .select("id")
    .single();
  assert(bankAccount, "fixture: bank account insert failed");

  // Three notices: A ($500 lot 1), B ($500 lot 2), C ($250 lot 1).
  const { data: noticeA } = await supabase
    .from("levy_notices")
    .insert({
      subdivision_id: subdivision.id,
      lot_id: lots[0].id,
      budget_id: budget.id,
      reference_number: "LEV-1001",
      bpay_crn: "00000018",
      fund_type: "administrative",
      levy_type: "regular",
      period_start: "2026-01-01",
      period_end: "2026-03-31",
      amount: 500,
      due_date: "2026-04-28",
      status: "draft",
    })
    .select("id")
    .single();
  assert(noticeA, "fixture: noticeA insert failed");

  const { data: noticeB } = await supabase
    .from("levy_notices")
    .insert({
      subdivision_id: subdivision.id,
      lot_id: lots[1].id,
      budget_id: budget.id,
      reference_number: "LEV-1002",
      bpay_crn: "00000026",
      fund_type: "administrative",
      levy_type: "regular",
      period_start: "2026-01-01",
      period_end: "2026-03-31",
      amount: 500,
      due_date: "2026-04-28",
      status: "draft",
    })
    .select("id")
    .single();
  assert(noticeB, "fixture: noticeB insert failed");

  const { data: noticeC } = await supabase
    .from("levy_notices")
    .insert({
      subdivision_id: subdivision.id,
      lot_id: lots[0].id,
      budget_id: budget.id,
      reference_number: "LEV-1003",
      bpay_crn: "00000034",
      fund_type: "administrative",
      levy_type: "regular",
      period_start: "2026-04-01",
      period_end: "2026-06-30",
      amount: 250,
      due_date: "2026-07-28",
      status: "draft",
    })
    .select("id")
    .single();
  assert(noticeC, "fixture: noticeC insert failed");

  // Outstanding debits so RPCs have something to credit against.
  await supabase.from("lot_ledger_entries").insert([
    {
      subdivision_id: subdivision.id,
      lot_id: lots[0].id,
      fund_type: "administrative",
      entry_type: "debit",
      category: "levy",
      amount: 500,
      entry_date: "2026-01-01",
      reference: "LEV-1001",
      levy_notice_id: noticeA.id,
      status: "active",
      created_by: profile.id,
    },
    {
      subdivision_id: subdivision.id,
      lot_id: lots[1].id,
      fund_type: "administrative",
      entry_type: "debit",
      category: "levy",
      amount: 500,
      entry_date: "2026-01-01",
      reference: "LEV-1002",
      levy_notice_id: noticeB.id,
      status: "active",
      created_by: profile.id,
    },
    {
      subdivision_id: subdivision.id,
      lot_id: lots[0].id,
      fund_type: "administrative",
      entry_type: "debit",
      category: "levy",
      amount: 250,
      entry_date: "2026-04-01",
      reference: "LEV-1003",
      levy_notice_id: noticeC.id,
      status: "active",
      created_by: profile.id,
    },
  ]);

  return {
    runId,
    companyId: company.id,
    subdivisionId: subdivision.id,
    profileId: profile.id,
    budgetId: budget.id,
    bankAccountId: bankAccount.id,
    lotAId: lots[0].id,
    lotBId: lots[1].id,
    noticeAId: noticeA.id,
    noticeBId: noticeB.id,
    noticeCId: noticeC.id,
  };
}

// ─── Test helpers ─────────────────────────────────────────────────────────

interface CreditOpts {
  fx: Fixture;
  lotId: string;
  amount: number;
  entry_date: string;
  category?: "payment" | "writeoff" | "adjustment_credit";
  levy_notice_id?: string | null;
  status?: "active" | "voided";
}

async function insertCredit(opts: CreditOpts): Promise<string> {
  const { fx } = opts;
  const status = opts.status ?? "active";
  const payload: Record<string, unknown> = {
    subdivision_id: fx.subdivisionId,
    lot_id: opts.lotId,
    fund_type: "administrative",
    entry_type: "credit",
    category: opts.category ?? "payment",
    amount: opts.amount,
    entry_date: opts.entry_date,
    reference: null,
    levy_notice_id: opts.levy_notice_id === undefined ? fx.noticeAId : opts.levy_notice_id,
    status,
    created_by: fx.profileId,
  };
  // chk_ledger_voided_consistency requires voided_at non-null when
  // status='voided'. Set all void-related fields in the same INSERT.
  if (status === "voided") {
    payload.voided_at = new Date().toISOString();
    payload.voided_by = fx.profileId;
    payload.void_reason = "verification setup void";
  }
  const { data, error } = await supabase
    .from("lot_ledger_entries")
    .insert(payload)
    .select("id")
    .single();
  if (error || !data) throw new Error(`insertCredit: ${error?.message}`);
  return data.id;
}

async function fetchEntryState(id: string) {
  const { data } = await supabase
    .from("lot_ledger_entries")
    .select("duplicate_of, duplicate_status, duplicate_metadata, status, voided_at")
    .eq("id", id)
    .single();
  return data;
}

async function rowFromInput(id: string) {
  const { data } = await supabase
    .from("lot_ledger_entries")
    .select("id, lot_id, entry_type, category, amount, levy_notice_id, entry_date")
    .eq("id", id)
    .single();
  return data as {
    id: string;
    lot_id: string;
    entry_type: "debit" | "credit";
    category: "payment" | "levy" | "special_levy" | "interest" | "writeoff" | "adjustment_credit" | "adjustment_debit" | "refund" | "void_offset";
    amount: number | string;
    levy_notice_id: string | null;
    entry_date: string;
  };
}

// ─── Detector scenarios (LD-1..LD-10, LD-18) ──────────────────────────────

async function ld1_detectsWithinWindow(fx: Fixture) {
  const olderId = await insertCredit({ fx, lotId: fx.lotAId, amount: 200, entry_date: "2026-05-01" });
  const newerId = await insertCredit({ fx, lotId: fx.lotAId, amount: 200, entry_date: "2026-05-05" });
  const newer = await rowFromInput(newerId);
  const result = await detectLedgerDuplicate(
    {
      id: newer.id,
      lot_id: newer.lot_id,
      entry_type: newer.entry_type,
      category: newer.category,
      amount: Number(newer.amount),
      levy_notice_id: newer.levy_notice_id,
      entry_date: newer.entry_date,
    },
    supabase,
  );
  record(
    "LD-1: detect duplicate within +/-7 day window",
    result.flagged && result.duplicate_of === olderId,
    `flagged=${result.flagged}${result.flagged ? `, day_delta=${result.metadata.day_delta}` : ""}`,
  );
}

async function ld2_differentLevyNoticeId(fx: Fixture) {
  await insertCredit({ fx, lotId: fx.lotAId, amount: 250, entry_date: "2026-05-10", levy_notice_id: fx.noticeAId });
  const newerId = await insertCredit({ fx, lotId: fx.lotAId, amount: 250, entry_date: "2026-05-10", levy_notice_id: fx.noticeCId });
  const newer = await rowFromInput(newerId);
  const result = await detectLedgerDuplicate(
    {
      id: newer.id,
      lot_id: newer.lot_id,
      entry_type: newer.entry_type,
      category: newer.category,
      amount: Number(newer.amount),
      levy_notice_id: newer.levy_notice_id,
      entry_date: newer.entry_date,
    },
    supabase,
  );
  record(
    "LD-2: don't detect when levy_notice_id differs",
    result.flagged === false,
    `flagged=${result.flagged}`,
  );
}

async function ld3_amountMustEqual(fx: Fixture) {
  await insertCredit({ fx, lotId: fx.lotAId, amount: 100.0, entry_date: "2026-05-15" });
  const newerId = await insertCredit({ fx, lotId: fx.lotAId, amount: 100.01, entry_date: "2026-05-15" });
  const newer = await rowFromInput(newerId);
  const result = await detectLedgerDuplicate(
    {
      id: newer.id,
      lot_id: newer.lot_id,
      entry_type: newer.entry_type,
      category: newer.category,
      amount: Number(newer.amount),
      levy_notice_id: newer.levy_notice_id,
      entry_date: newer.entry_date,
    },
    supabase,
  );
  record(
    "LD-3: don't detect when amounts differ by $0.01",
    result.flagged === false,
    `flagged=${result.flagged}`,
  );
}

async function ld4_categoryNotPayment(fx: Fixture) {
  // Two adjustment_credits, same lot/notice/amount/date — predicate excludes
  // category != 'payment'.
  await insertCredit({ fx, lotId: fx.lotAId, amount: 60, entry_date: "2026-05-20", category: "adjustment_credit" });
  const newerId = await insertCredit({ fx, lotId: fx.lotAId, amount: 60, entry_date: "2026-05-20", category: "adjustment_credit" });
  const newer = await rowFromInput(newerId);
  const result = await detectLedgerDuplicate(
    {
      id: newer.id,
      lot_id: newer.lot_id,
      entry_type: newer.entry_type,
      category: newer.category,
      amount: Number(newer.amount),
      levy_notice_id: newer.levy_notice_id,
      entry_date: newer.entry_date,
    },
    supabase,
  );
  record(
    "LD-4: don't detect when category != 'payment' (adjustment_credit)",
    result.flagged === false,
    `flagged=${result.flagged}`,
  );
}

async function ld5_differentLots(fx: Fixture) {
  await insertCredit({ fx, lotId: fx.lotAId, amount: 175, entry_date: "2026-05-25", levy_notice_id: fx.noticeAId });
  const newerId = await insertCredit({ fx, lotId: fx.lotBId, amount: 175, entry_date: "2026-05-25", levy_notice_id: fx.noticeBId });
  const newer = await rowFromInput(newerId);
  const result = await detectLedgerDuplicate(
    {
      id: newer.id,
      lot_id: newer.lot_id,
      entry_type: newer.entry_type,
      category: newer.category,
      amount: Number(newer.amount),
      levy_notice_id: newer.levy_notice_id,
      entry_date: newer.entry_date,
    },
    supabase,
  );
  record(
    "LD-5: don't detect across different lots",
    result.flagged === false,
    `flagged=${result.flagged}`,
  );
}

async function ld6_voidedExcluded(fx: Fixture) {
  // insertCredit with status='voided' now sets all void-related fields
  // in the same INSERT (constraint chk_ledger_voided_consistency).
  await insertCredit({ fx, lotId: fx.lotAId, amount: 90, entry_date: "2026-06-01", status: "voided" });
  const newerId = await insertCredit({ fx, lotId: fx.lotAId, amount: 90, entry_date: "2026-06-01" });
  const newer = await rowFromInput(newerId);
  const result = await detectLedgerDuplicate(
    {
      id: newer.id,
      lot_id: newer.lot_id,
      entry_type: newer.entry_type,
      category: newer.category,
      amount: Number(newer.amount),
      levy_notice_id: newer.levy_notice_id,
      entry_date: newer.entry_date,
    },
    supabase,
  );
  record(
    "LD-6: voided rows excluded from candidate pool",
    result.flagged === false,
    `flagged=${result.flagged}`,
  );
}

async function ld7_chainPrevention(fx: Fixture) {
  const firstId = await insertCredit({ fx, lotId: fx.lotAId, amount: 444, entry_date: "2026-06-05" });
  const secondId = await insertCredit({ fx, lotId: fx.lotAId, amount: 444, entry_date: "2026-06-06" });
  const second = await rowFromInput(secondId);
  const det2 = await detectLedgerDuplicate(
    {
      id: second.id,
      lot_id: second.lot_id,
      entry_type: second.entry_type,
      category: second.category,
      amount: Number(second.amount),
      levy_notice_id: second.levy_notice_id,
      entry_date: second.entry_date,
    },
    supabase,
  );
  assert(det2.flagged && det2.duplicate_of === firstId, "LD-7 setup: detection failed on second");
  await markLedgerDuplicate({
    lot_ledger_entry_id: secondId,
    subdivision_id: fx.subdivisionId,
    duplicate_of: det2.duplicate_of,
    metadata: det2.metadata,
    performedBy: fx.profileId,
    supabase,
  });

  const thirdId = await insertCredit({ fx, lotId: fx.lotAId, amount: 444, entry_date: "2026-06-07" });
  const third = await rowFromInput(thirdId);
  const det3 = await detectLedgerDuplicate(
    {
      id: third.id,
      lot_id: third.lot_id,
      entry_type: third.entry_type,
      category: third.category,
      amount: Number(third.amount),
      levy_notice_id: third.levy_notice_id,
      entry_date: third.entry_date,
    },
    supabase,
  );
  record(
    "LD-7: chain prevention — third anchors on first, not on second",
    det3.flagged && det3.duplicate_of === firstId,
    `flagged=${det3.flagged}, anchor=${det3.flagged ? det3.duplicate_of : "n/a"}`,
  );
}

async function ld8_outsideWindow(fx: Fixture) {
  await insertCredit({ fx, lotId: fx.lotAId, amount: 333, entry_date: "2026-06-10" });
  const newerId = await insertCredit({ fx, lotId: fx.lotAId, amount: 333, entry_date: "2026-06-18" }); // +8 days
  const newer = await rowFromInput(newerId);
  const result = await detectLedgerDuplicate(
    {
      id: newer.id,
      lot_id: newer.lot_id,
      entry_type: newer.entry_type,
      category: newer.category,
      amount: Number(newer.amount),
      levy_notice_id: newer.levy_notice_id,
      entry_date: newer.entry_date,
    },
    supabase,
  );
  record(
    "LD-8: outside +/-7 day window does not flag",
    result.flagged === false,
    `flagged=${result.flagged}`,
  );
}

async function ld9_monthBoundary(fx: Fixture) {
  // Jan 28 + 7 days = Feb 4 (in window).
  await insertCredit({ fx, lotId: fx.lotAId, amount: 555, entry_date: "2027-01-28" });
  const newerId = await insertCredit({ fx, lotId: fx.lotAId, amount: 555, entry_date: "2027-02-04" });
  const newer = await rowFromInput(newerId);
  const result = await detectLedgerDuplicate(
    {
      id: newer.id,
      lot_id: newer.lot_id,
      entry_type: newer.entry_type,
      category: newer.category,
      amount: Number(newer.amount),
      levy_notice_id: newer.levy_notice_id,
      entry_date: newer.entry_date,
    },
    supabase,
  );
  record(
    "LD-9: in-window across month boundary (Jan 28 -> Feb 4) flags",
    result.flagged === true,
    `flagged=${result.flagged}, day_delta=${result.flagged ? result.metadata.day_delta : "n/a"}`,
  );
}

async function ld10_untargetedCredit(fx: Fixture) {
  await insertCredit({ fx, lotId: fx.lotAId, amount: 410, entry_date: "2026-06-15", levy_notice_id: null });
  const newerId = await insertCredit({ fx, lotId: fx.lotAId, amount: 410, entry_date: "2026-06-15", levy_notice_id: null });
  const newer = await rowFromInput(newerId);
  const result = await detectLedgerDuplicate(
    {
      id: newer.id,
      lot_id: newer.lot_id,
      entry_type: newer.entry_type,
      category: newer.category,
      amount: Number(newer.amount),
      levy_notice_id: newer.levy_notice_id,
      entry_date: newer.entry_date,
    },
    supabase,
  );
  record(
    "LD-10: untargeted credit (levy_notice_id IS NULL) does not flag",
    result.flagged === false,
    `flagged=${result.flagged}`,
  );
}

async function ld18_voidOffsetExcluded(fx: Fixture) {
  // Insert a payment then void it via rpc_ledger_void; the void_offset row
  // (entry_type=debit/credit depending on offset direction, category=void_offset)
  // must NOT trigger detection.
  const paymentId = await insertCredit({ fx, lotId: fx.lotAId, amount: 720, entry_date: "2026-06-20" });
  const { error: voidErr } = await supabase.rpc("rpc_ledger_void", {
    p_entry_id: paymentId,
    p_reason: "Verification void",
    p_voided_by: fx.profileId,
  });
  assert(!voidErr, `LD-18 setup: rpc_ledger_void failed: ${voidErr?.message}`);

  // Locate the void_offset row.
  const { data: offsets } = await supabase
    .from("lot_ledger_entries")
    .select("id, lot_id, entry_type, category, amount, levy_notice_id, entry_date")
    .eq("voids_entry_id", paymentId)
    .single();
  assert(offsets, "LD-18 setup: void_offset row not found");

  const offsetRow = offsets as {
    id: string;
    lot_id: string;
    entry_type: "credit" | "debit";
    category: "void_offset";
    amount: number | string;
    levy_notice_id: string | null;
    entry_date: string;
  };

  const result = await detectLedgerDuplicate(
    {
      id: offsetRow.id,
      lot_id: offsetRow.lot_id,
      entry_type: offsetRow.entry_type,
      category: offsetRow.category,
      amount: Number(offsetRow.amount),
      levy_notice_id: offsetRow.levy_notice_id,
      entry_date: offsetRow.entry_date,
    },
    supabase,
  );
  record(
    "LD-18: void_offset entries do NOT trigger detection (predicate excludes)",
    result.flagged === false,
    `flagged=${result.flagged}, offset_category=${offsetRow.category}`,
  );
}

// ─── Manager review action scenarios (LD-11..LD-14) ───────────────────────

async function ld11_voidAsLedgerDuplicate(
  fx: Fixture,
  recon: typeof import("@/lib/actions/reconciliation"),
) {
  // Setup: outstanding debit + two payments same notice/amount within window.
  const noticeId = fx.noticeAId; // outstanding $500
  // We'll test with smaller amounts to avoid touching the existing $500 debit too much.
  await insertCredit({ fx, lotId: fx.lotAId, amount: 80, entry_date: "2026-06-25", levy_notice_id: noticeId });
  const newerId = await insertCredit({ fx, lotId: fx.lotAId, amount: 80, entry_date: "2026-06-25", levy_notice_id: noticeId });
  const newer = await rowFromInput(newerId);
  const det = await detectLedgerDuplicate(
    {
      id: newer.id,
      lot_id: newer.lot_id,
      entry_type: newer.entry_type,
      category: newer.category,
      amount: Number(newer.amount),
      levy_notice_id: newer.levy_notice_id,
      entry_date: newer.entry_date,
    },
    supabase,
  );
  assert(det.flagged, "LD-11 setup: detection failed");
  await markLedgerDuplicate({
    lot_ledger_entry_id: newerId,
    subdivision_id: fx.subdivisionId,
    duplicate_of: det.duplicate_of,
    metadata: det.metadata,
    performedBy: fx.profileId,
    supabase,
  });

  const result = await recon.voidAsLedgerDuplicate({
    subdivision_id: fx.subdivisionId,
    lot_ledger_entry_id: newerId,
  });
  const state = await fetchEntryState(newerId);
  // void_offset row should exist pointing back at newerId.
  const { data: offset } = await supabase
    .from("lot_ledger_entries")
    .select("id, voids_entry_id, category")
    .eq("voids_entry_id", newerId)
    .maybeSingle();

  const ok =
    result.success?.voided === true &&
    state?.duplicate_status === "confirmed" &&
    state?.status === "voided" &&
    !!offset &&
    (offset as { category: string }).category === "void_offset";
  record(
    "LD-11: voidAsLedgerDuplicate creates void_offset, status='confirmed', entry voided",
    ok,
    `dup_status=${state?.duplicate_status}, status=${state?.status}, offset=${offset ? "yes" : "no"}`,
  );
}

async function ld12_voidAlreadyVoided(
  fx: Fixture,
  recon: typeof import("@/lib/actions/reconciliation"),
) {
  // Insert a credit, void it directly (not as duplicate), then mark it as
  // suspected duplicate. voidAsLedgerDuplicate should refuse with
  // ALREADY_VOIDED. Note the suspected-mark needs to be on a still-active
  // row in real life — but DB will let us hand-craft the state.
  const olderId = await insertCredit({ fx, lotId: fx.lotAId, amount: 70, entry_date: "2026-07-01" });
  const newerId = await insertCredit({ fx, lotId: fx.lotAId, amount: 70, entry_date: "2026-07-01" });
  const det = await detectLedgerDuplicate(
    {
      id: newerId,
      lot_id: fx.lotAId,
      entry_type: "credit",
      category: "payment",
      amount: 70,
      levy_notice_id: fx.noticeAId,
      entry_date: "2026-07-01",
    },
    supabase,
  );
  assert(det.flagged && det.duplicate_of === olderId, "LD-12 setup: detection failed");
  await markLedgerDuplicate({
    lot_ledger_entry_id: newerId,
    subdivision_id: fx.subdivisionId,
    duplicate_of: det.duplicate_of,
    metadata: det.metadata,
    performedBy: fx.profileId,
    supabase,
  });
  // Void the suspected row through a non-duplicate path.
  await supabase.rpc("rpc_ledger_void", {
    p_entry_id: newerId,
    p_reason: "Voided through unrelated path",
    p_voided_by: fx.profileId,
  });

  const result = await recon.voidAsLedgerDuplicate({
    subdivision_id: fx.subdivisionId,
    lot_ledger_entry_id: newerId,
  });
  record(
    "LD-12: voidAsLedgerDuplicate returns errorCode=ALREADY_VOIDED on already-voided entry",
    result.errorCode === "ALREADY_VOIDED",
    `errorCode=${result.errorCode}`,
  );
}

async function ld13_keepAsOverpayment(
  fx: Fixture,
  recon: typeof import("@/lib/actions/reconciliation"),
) {
  await insertCredit({ fx, lotId: fx.lotAId, amount: 50, entry_date: "2026-07-05" });
  const newerId = await insertCredit({ fx, lotId: fx.lotAId, amount: 50, entry_date: "2026-07-05" });
  const det = await detectLedgerDuplicate(
    {
      id: newerId,
      lot_id: fx.lotAId,
      entry_type: "credit",
      category: "payment",
      amount: 50,
      levy_notice_id: fx.noticeAId,
      entry_date: "2026-07-05",
    },
    supabase,
  );
  assert(det.flagged, "LD-13 setup: detection failed");
  await markLedgerDuplicate({
    lot_ledger_entry_id: newerId,
    subdivision_id: fx.subdivisionId,
    duplicate_of: det.duplicate_of,
    metadata: det.metadata,
    performedBy: fx.profileId,
    supabase,
  });

  const result = await recon.keepAsOverpayment({
    subdivision_id: fx.subdivisionId,
    lot_ledger_entry_id: newerId,
  });
  const state = await fetchEntryState(newerId);
  const ok =
    result.success?.kept === true &&
    state?.duplicate_status === "rejected" &&
    state?.status === "active";
  record(
    "LD-13: keepAsOverpayment sets status='rejected', entry stays active",
    ok,
    `dup_status=${state?.duplicate_status}, status=${state?.status}`,
  );
}

async function ld14_voidCascadesMatches(
  fx: Fixture,
  recon: typeof import("@/lib/actions/reconciliation"),
) {
  // PP5-B Path B: voidAsLedgerDuplicate routes through
  // rpc_unmatch_bank_transaction when the credit is linked to bank txs.
  // The cascade deletes reconciliation_matches AND updates the bank tx's
  // matched_total + match_status.
  const { data: bankTx } = await supabase
    .from("bank_transactions")
    .insert({
      bank_account_id: fx.bankAccountId,
      source: "manual",
      transaction_date: "2026-07-10",
      amount: 120,
      description: "TEST CASCADE",
      match_status: "manually_matched",
      matched_total: 120,
    })
    .select("id")
    .single();
  assert(bankTx, "LD-14 setup: bank_transaction insert failed");

  // Sibling credit (so duplicate_of points at someone else; self-ref blocked).
  const siblingId = await insertCredit({
    fx,
    lotId: fx.lotAId,
    amount: 120,
    entry_date: "2026-07-09",
    levy_notice_id: fx.noticeCId,
  });
  // The credit under test, linked to the bank tx via reconciliation_matches.
  const creditId = await insertCredit({
    fx,
    lotId: fx.lotAId,
    amount: 120,
    entry_date: "2026-07-10",
    levy_notice_id: fx.noticeCId,
  });
  await supabase.from("reconciliation_matches").insert({
    bank_transaction_id: bankTx.id,
    ledger_entry_id: creditId,
    amount_matched: 120,
    match_method: "manual",
    match_confidence: "manual",
    matched_by: fx.profileId,
  });
  await supabase
    .from("lot_ledger_entries")
    .update({
      duplicate_of: siblingId,
      duplicate_status: "suspected",
      duplicate_metadata: {
        matched_against: siblingId,
        lot_id: fx.lotAId,
        levy_notice_id: fx.noticeCId,
        amount: 120,
        day_delta: 1,
        older_category: "payment",
        newer_category: "payment",
      },
    })
    .eq("id", creditId);

  const result = await recon.voidAsLedgerDuplicate({
    subdivision_id: fx.subdivisionId,
    lot_ledger_entry_id: creditId,
  });

  const { data: matchesAfter } = await supabase
    .from("reconciliation_matches")
    .select("id")
    .eq("ledger_entry_id", creditId);
  const { data: bankAfter } = await supabase
    .from("bank_transactions")
    .select("matched_total, match_status")
    .eq("id", bankTx.id)
    .single();
  const ba = bankAfter as { matched_total: number | string; match_status: string };

  const ok =
    result.success?.voided === true &&
    (matchesAfter ?? []).length === 0 &&
    Number(ba.matched_total) === 0 &&
    ba.match_status === "unmatched" &&
    (result.success?.unmatched_bank_tx_ids ?? []).includes(bankTx.id);
  record(
    "LD-14: voidAsLedgerDuplicate cascades correctly via rpc_unmatch_bank_transaction (matches removed, matched_total/status updated)",
    ok,
    `voided=${result.success?.voided}, matches_remaining=${(matchesAfter ?? []).length}, matched_total=${ba.matched_total}, match_status=${ba.match_status}`,
  );
}

// ─── Integration scenarios (LD-15, LD-16, LD-17) ──────────────────────────

async function ld15_reconcileTransactionIntegration(
  fx: Fixture,
  recon: typeof import("@/lib/actions/reconciliation"),
) {
  // Pre-existing payment credit on noticeC ($250).
  const olderId = await insertCredit({
    fx,
    lotId: fx.lotAId,
    amount: 200,
    entry_date: "2026-08-01",
    levy_notice_id: fx.noticeCId,
  });
  // Bank tx for $200 then manual-match it → creates a new credit on noticeC.
  const { data: bankTx } = await supabase
    .from("bank_transactions")
    .insert({
      bank_account_id: fx.bankAccountId,
      source: "manual",
      transaction_date: "2026-08-02",
      amount: 200,
      description: "Manual match for LD-15",
      match_status: "unmatched",
    })
    .select("id")
    .single();
  assert(bankTx, "LD-15 setup: bank_transaction insert failed");

  const matchRes = await recon.reconcileTransaction({
    subdivision_id: fx.subdivisionId,
    bank_transaction_id: bankTx.id,
    allocations: [
      {
        lot_id: fx.lotAId,
        fund_type: "administrative",
        amount: 200,
        levy_notice_id: fx.noticeCId,
        reference: "LEV-1003",
      },
    ],
    match_method: "manual",
    match_confidence: "manual",
  });
  assert(matchRes.success, `LD-15 reconcile: ${matchRes.error}`);

  const creditIds = matchRes.success!.createdCreditIds;
  let foundFlag = false;
  for (const id of creditIds) {
    const state = await fetchEntryState(id);
    if (state?.duplicate_status === "suspected") {
      foundFlag = true;
      break;
    }
  }
  record(
    "LD-15: reconcileTransaction post-RPC hook flags duplicate credit",
    foundFlag,
    `flagged credit detected via reconcileTransaction integration; older=${olderId}`,
  );
}

async function ld16_recordCashReceiptBoundary(
  fx: Fixture,
  recon: typeof import("@/lib/actions/reconciliation"),
) {
  // PP5-B scope boundary: cash receipts create credits with
  // levy_notice_id=NULL (untargeted at receipt time; notice linkage
  // happens at rpc_deposit_undeposited_funds time). The eligibility
  // predicate excludes untargeted credits, so receipt credits never
  // get duplicate_status set. recordCashReceipt deliberately has NO
  // ledger-detector integration — this test verifies the boundary.
  //
  // Setup creates a notice-linked credit at the same lot/amount/date so
  // a hypothetical (untargeted) receipt would normally hash-match if the
  // detector ran. We confirm: it doesn't.
  await insertCredit({
    fx,
    lotId: fx.lotAId,
    amount: 30,
    entry_date: "2026-08-10",
    levy_notice_id: fx.noticeCId,
  });
  const receiptRes = await recon.recordCashReceipt({
    subdivision_id: fx.subdivisionId,
    lot_id: fx.lotAId,
    bank_account_id: fx.bankAccountId,
    fund_type: "administrative",
    amount: 30,
    received_date: "2026-08-12",
    payment_method: "cash",
    description: "Cash receipt for LD-16",
  });
  assert(receiptRes.success, `LD-16 recordCashReceipt: ${receiptRes.error}`);

  const state = await fetchEntryState(receiptRes.success!.ledgerEntryId);
  // Confirm: receipt credit has duplicate_status=NULL AND levy_notice_id is
  // NULL (RPC contract). Any non-null duplicate_status here would mean the
  // detector ran on an untargeted credit — predicate violation.
  const { data: row } = await supabase
    .from("lot_ledger_entries")
    .select("levy_notice_id, duplicate_status")
    .eq("id", receiptRes.success!.ledgerEntryId)
    .single();
  const r = row as { levy_notice_id: string | null; duplicate_status: string | null };
  const ok =
    state?.duplicate_status === null &&
    r?.levy_notice_id === null;
  record(
    "LD-16: recordCashReceipt scope boundary — receipt credit is untargeted; detector intentionally not invoked",
    ok,
    `dup_status=${state?.duplicate_status}, levy_notice_id=${r?.levy_notice_id}`,
  );
}

async function ld17_orchestratorIntegration(
  fx: Fixture,
  recon: typeof import("@/lib/actions/reconciliation"),
) {
  // LD-17 needs an orchestrator-matchable notice. The shared fixture
  // notices (A/B/C) get heavily credited by sibling tests, so by this
  // point their outstanding balances are negative — the orchestrator
  // would fall through with stale_reference_detected. Create a fresh
  // dedicated notice + debit inline so this scenario is independent.
  const { data: ld17Notice } = await supabase
    .from("levy_notices")
    .insert({
      subdivision_id: fx.subdivisionId,
      lot_id: fx.lotAId,
      budget_id: fx.budgetId,
      reference_number: "LEV-1017",
      bpay_crn: "00010173",
      fund_type: "administrative",
      levy_type: "regular",
      period_start: "2026-07-01",
      period_end: "2026-09-30",
      amount: 500,
      due_date: "2026-10-30",
      status: "draft",
    })
    .select("id")
    .single();
  assert(ld17Notice, "LD-17 setup: notice insert failed");
  await supabase.from("lot_ledger_entries").insert({
    subdivision_id: fx.subdivisionId,
    lot_id: fx.lotAId,
    fund_type: "administrative",
    entry_type: "debit",
    category: "levy",
    amount: 500,
    entry_date: "2026-07-01",
    reference: "LEV-1017",
    levy_notice_id: ld17Notice.id,
    status: "active",
    created_by: fx.profileId,
  });

  // Pre-existing payment credit for $250 on the fresh notice — anchor for
  // the duplicate detection. $500 outstanding minus this $250 leaves $250
  // for the orchestrator to allocate.
  const olderId = await insertCredit({
    fx,
    lotId: fx.lotAId,
    amount: 250,
    entry_date: "2026-08-20",
    levy_notice_id: ld17Notice.id,
  });

  // Bank tx for $250 with the LEV-1017 reference. Strategy 1 sees $250
  // outstanding and matches → creates a fresh credit → ledger detector
  // flags it as duplicate of the older $250 anchor.
  const { data: bankTx } = await supabase
    .from("bank_transactions")
    .insert({
      bank_account_id: fx.bankAccountId,
      source: "manual",
      transaction_date: "2026-08-22",
      amount: 250,
      description: "Auto-match candidate LEV-1017",
      match_status: "unmatched",
    })
    .select("id")
    .single();
  assert(bankTx, "LD-17 setup: bank_transaction insert failed");

  const { tryAutoMatch } = await import("./orchestrator");
  const matchRes = await tryAutoMatch({
    bankTransactionId: bankTx.id,
    subdivisionId: fx.subdivisionId,
    bankAccountId: fx.bankAccountId,
    description: "Auto-match candidate LEV-1017",
    amount: 250,
    transactionDate: "2026-08-22",
    performedBy: fx.profileId,
  });
  assert(matchRes.matched || matchRes.partial, `LD-17 orchestrator did not match: ${matchRes.warning}`);

  const { data: credits } = await supabase
    .from("lot_ledger_entries")
    .select("id, duplicate_status")
    .eq("lot_id", fx.lotAId)
    .eq("entry_type", "credit")
    .eq("category", "payment")
    .eq("amount", 250)
    .eq("levy_notice_id", ld17Notice.id)
    .neq("id", olderId);
  const flagged = (credits ?? []).some(
    (c) => (c as { duplicate_status: string | null }).duplicate_status === "suspected",
  );
  record(
    "LD-17: orchestrator (tryAutoMatch) post-RPC hook flags duplicate credit",
    flagged,
    `flagged among ${credits?.length ?? 0} new credit(s)`,
  );
  void recon; // recon import retained for parity with sibling integration tests
}

// ─── LD-19: end-to-end Path B for a linked credit ─────────────────────
// Bank tx auto-matched → credit suspected → void → all bank state
// updated correctly via rpc_unmatch_bank_transaction cascade.

async function ld19_voidLinkedCreditEndState(
  fx: Fixture,
  recon: typeof import("@/lib/actions/reconciliation"),
) {
  const { data: bankTx } = await supabase
    .from("bank_transactions")
    .insert({
      bank_account_id: fx.bankAccountId,
      source: "manual",
      transaction_date: "2026-09-01",
      amount: 250,
      description: "LD-19 setup: bank tx for ledger void cascade test",
      match_status: "unmatched",
    })
    .select("id")
    .single();
  assert(bankTx, "LD-19 setup: bank_transaction insert failed");

  const matchRes = await recon.reconcileTransaction({
    subdivision_id: fx.subdivisionId,
    bank_transaction_id: bankTx.id,
    allocations: [
      {
        lot_id: fx.lotAId,
        fund_type: "administrative",
        amount: 250,
        levy_notice_id: fx.noticeCId,
        reference: "LEV-1003",
      },
    ],
    match_method: "manual",
    match_confidence: "manual",
  });
  assert(matchRes.success, `LD-19 setup reconcile: ${matchRes.error}`);
  const creditId = matchRes.success!.createdCreditIds[0];
  assert(creditId, "LD-19 setup: no credit created");

  const { data: bankPre } = await supabase
    .from("bank_transactions")
    .select("match_status, matched_total")
    .eq("id", bankTx.id)
    .single();
  const pre = bankPre as { match_status: string; matched_total: number | string };
  assert(
    pre.match_status === "manually_matched" && Number(pre.matched_total) === 250,
    `LD-19 setup pre-state: match_status=${pre.match_status}, matched_total=${pre.matched_total}`,
  );

  // Hand-craft duplicate_status='suspected' on the credit (post-reconcile
  // detector didn't flag it because no older sibling existed at setup).
  const siblingId = await insertCredit({
    fx,
    lotId: fx.lotAId,
    amount: 250,
    entry_date: "2026-08-31",
    levy_notice_id: fx.noticeCId,
  });
  await supabase
    .from("lot_ledger_entries")
    .update({
      duplicate_of: siblingId,
      duplicate_status: "suspected",
      duplicate_metadata: {
        matched_against: siblingId,
        lot_id: fx.lotAId,
        levy_notice_id: fx.noticeCId,
        amount: 250,
        day_delta: 1,
        older_category: "payment",
        newer_category: "payment",
      },
    })
    .eq("id", creditId);

  const result = await recon.voidAsLedgerDuplicate({
    subdivision_id: fx.subdivisionId,
    lot_ledger_entry_id: creditId,
  });
  assert(result.success?.voided === true, `LD-19 void failed: ${result.error}`);

  const ledgerState = await fetchEntryState(creditId);
  const { data: offset } = await supabase
    .from("lot_ledger_entries")
    .select("status, category")
    .eq("voids_entry_id", creditId)
    .maybeSingle();
  const offsetRow = offset as { status: string; category: string } | null;
  const { data: matchesAfter } = await supabase
    .from("reconciliation_matches")
    .select("id")
    .eq("ledger_entry_id", creditId);
  const { data: bankPost } = await supabase
    .from("bank_transactions")
    .select("match_status, matched_total")
    .eq("id", bankTx.id)
    .single();
  const post = bankPost as { match_status: string; matched_total: number | string };

  const ok =
    ledgerState?.duplicate_status === "confirmed" &&
    ledgerState?.status === "voided" &&
    !!offsetRow &&
    offsetRow.status === "active" &&
    offsetRow.category === "void_offset" &&
    (matchesAfter ?? []).length === 0 &&
    Number(post.matched_total) === 0 &&
    post.match_status === "unmatched" &&
    (result.success?.unmatched_bank_tx_ids ?? []).includes(bankTx.id);
  record(
    "LD-19: voidAsLedgerDuplicate end-state for linked credit — full cascade",
    ok,
    `dup_status=${ledgerState?.duplicate_status}, ledger_status=${ledgerState?.status}, matches_after=${(matchesAfter ?? []).length}, bank_matched_total=${post.matched_total}, bank_match_status=${post.match_status}`,
  );
}

// ─── LD-20: voidAsLedgerDuplicate end-state for an UNLINKED credit ────
// Credit has no reconciliation_matches (e.g. cash-receipt path, or a
// freshly inserted credit not yet matched). Action takes the
// rpc_ledger_void direct path. unmatched_bank_tx_ids should be empty.

async function ld20_voidUnlinkedCredit(
  fx: Fixture,
  recon: typeof import("@/lib/actions/reconciliation"),
) {
  const siblingId = await insertCredit({
    fx,
    lotId: fx.lotAId,
    amount: 75,
    entry_date: "2026-09-09",
    levy_notice_id: fx.noticeCId,
  });
  const creditId = await insertCredit({
    fx,
    lotId: fx.lotAId,
    amount: 75,
    entry_date: "2026-09-10",
    levy_notice_id: fx.noticeCId,
  });
  // No reconciliation_matches insert — credit is unlinked.

  await supabase
    .from("lot_ledger_entries")
    .update({
      duplicate_of: siblingId,
      duplicate_status: "suspected",
      duplicate_metadata: {
        matched_against: siblingId,
        lot_id: fx.lotAId,
        levy_notice_id: fx.noticeCId,
        amount: 75,
        day_delta: 1,
        older_category: "payment",
        newer_category: "payment",
      },
    })
    .eq("id", creditId);

  const result = await recon.voidAsLedgerDuplicate({
    subdivision_id: fx.subdivisionId,
    lot_ledger_entry_id: creditId,
  });
  assert(result.success?.voided === true, `LD-20 void failed: ${result.error}`);

  const ledgerState = await fetchEntryState(creditId);
  const { data: offset } = await supabase
    .from("lot_ledger_entries")
    .select("status, category, id")
    .eq("voids_entry_id", creditId)
    .maybeSingle();
  const offsetRow = offset as { status: string; category: string; id: string } | null;

  const ok =
    ledgerState?.duplicate_status === "confirmed" &&
    ledgerState?.status === "voided" &&
    !!offsetRow &&
    offsetRow.category === "void_offset" &&
    (result.success?.unmatched_bank_tx_ids ?? []).length === 0 &&
    result.success?.void_offset_id === offsetRow.id;
  record(
    "LD-20: voidAsLedgerDuplicate end-state for UNLINKED credit — rpc_ledger_void direct path, no bank tx unmatch",
    ok,
    `dup_status=${ledgerState?.duplicate_status}, ledger_status=${ledgerState?.status}, unmatched_bank_tx_ids=${JSON.stringify(result.success?.unmatched_bank_tx_ids ?? [])}, void_offset_id_returned=${result.success?.void_offset_id}`,
  );
}

// ─── LD-21: voidAsLedgerDuplicate fails with MULTI_LINKED ──────────────
// Hand-crafts an "impossible" state — one credit linked to two distinct
// bank txs via separate reconciliation_matches rows. The UNIQUE
// constraint on (bank_transaction_id, ledger_entry_id) blocks same-pair
// duplicates but allows distinct-pair multi-linkage; no current MSM flow
// produces this state. The MULTI_LINKED guard locks in the "no manual
// cleanup outside RPC contracts" architectural decision.

async function ld21_voidMultiLinkedFails(
  fx: Fixture,
  recon: typeof import("@/lib/actions/reconciliation"),
) {
  const { data: bankTx1 } = await supabase
    .from("bank_transactions")
    .insert({
      bank_account_id: fx.bankAccountId,
      source: "manual",
      transaction_date: "2027-03-01",
      amount: 60,
      description: "LD-21 setup bank tx 1",
      match_status: "manually_matched",
      matched_total: 60,
    })
    .select("id")
    .single();
  const { data: bankTx2 } = await supabase
    .from("bank_transactions")
    .insert({
      bank_account_id: fx.bankAccountId,
      source: "manual",
      transaction_date: "2027-03-02",
      amount: 60,
      description: "LD-21 setup bank tx 2",
      match_status: "manually_matched",
      matched_total: 60,
    })
    .select("id")
    .single();
  assert(bankTx1 && bankTx2, "LD-21 setup: bank tx insert failed");

  const siblingId = await insertCredit({
    fx,
    lotId: fx.lotAId,
    amount: 60,
    entry_date: "2027-02-28",
    levy_notice_id: fx.noticeCId,
  });
  const creditId = await insertCredit({
    fx,
    lotId: fx.lotAId,
    amount: 60,
    entry_date: "2027-03-01",
    levy_notice_id: fx.noticeCId,
  });

  await supabase.from("reconciliation_matches").insert([
    {
      bank_transaction_id: bankTx1.id,
      ledger_entry_id: creditId,
      amount_matched: 60,
      match_method: "manual",
      match_confidence: "manual",
      matched_by: fx.profileId,
    },
    {
      bank_transaction_id: bankTx2.id,
      ledger_entry_id: creditId,
      amount_matched: 60,
      match_method: "manual",
      match_confidence: "manual",
      matched_by: fx.profileId,
    },
  ]);
  await supabase
    .from("lot_ledger_entries")
    .update({
      duplicate_of: siblingId,
      duplicate_status: "suspected",
      duplicate_metadata: {
        matched_against: siblingId,
        lot_id: fx.lotAId,
        levy_notice_id: fx.noticeCId,
        amount: 60,
        day_delta: 1,
        older_category: "payment",
        newer_category: "payment",
      },
    })
    .eq("id", creditId);

  const result = await recon.voidAsLedgerDuplicate({
    subdivision_id: fx.subdivisionId,
    lot_ledger_entry_id: creditId,
  });

  // Hard error path: no mutation should have happened.
  const state = await fetchEntryState(creditId);
  const { data: offsetRow } = await supabase
    .from("lot_ledger_entries")
    .select("id")
    .eq("voids_entry_id", creditId)
    .maybeSingle();
  const { data: matchesAfter } = await supabase
    .from("reconciliation_matches")
    .select("id")
    .eq("ledger_entry_id", creditId);

  const ok =
    result.errorCode === "MULTI_LINKED" &&
    state?.duplicate_status === "suspected" &&
    state?.status === "active" &&
    !offsetRow &&
    (matchesAfter ?? []).length === 2;
  record(
    "LD-21: voidAsLedgerDuplicate fails with MULTI_LINKED when credit is multi-linked (no mutation)",
    ok,
    `errorCode=${result.errorCode}, dup_status=${state?.duplicate_status}, ledger_status=${state?.status}, void_offset=${offsetRow ? "present" : "absent"}, matches_remaining=${(matchesAfter ?? []).length}`,
  );
}

// ─── Cleanup ──────────────────────────────────────────────────────────────

async function cleanupMarker(): Promise<void> {
  const { data: companies } = await supabase
    .from("management_companies")
    .select("id")
    .like("name", `${VERIFY_MARKER}%`);
  if (!companies || companies.length === 0) return;
  for (const c of companies) {
    await cleanupCompany(c.id);
  }
}

async function cleanupCompany(companyId: string): Promise<void> {
  const { data: subs } = await supabase
    .from("subdivisions")
    .select("id")
    .eq("management_company_id", companyId);
  const subIds = (subs ?? []).map((s) => s.id);
  if (subIds.length === 0) {
    await supabase.from("profiles").delete().eq("management_company_id", companyId);
    await supabase.from("management_companies").delete().eq("id", companyId);
    return;
  }

  const { data: accounts } = await supabase
    .from("bank_accounts")
    .select("id")
    .in("subdivision_id", subIds);
  const accountIds = (accounts ?? []).map((a) => a.id);
  if (accountIds.length > 0) {
    const { data: txns } = await supabase
      .from("bank_transactions")
      .select("id")
      .in("bank_account_id", accountIds);
    const txnIds = (txns ?? []).map((t) => t.id);
    if (txnIds.length > 0) {
      await supabase.from("reconciliation_matches").delete().in("bank_transaction_id", txnIds);
    }
  }

  const { data: lots } = await supabase
    .from("lots")
    .select("id")
    .in("subdivision_id", subIds);
  const lotIds = (lots ?? []).map((l) => l.id);
  if (lotIds.length > 0) {
    const { data: entries } = await supabase
      .from("lot_ledger_entries")
      .select("id")
      .in("lot_id", lotIds);
    const entryIds = (entries ?? []).map((e) => e.id);
    if (entryIds.length > 0) {
      await supabase.from("reconciliation_matches").delete().in("ledger_entry_id", entryIds);
    }
    // Clear self-references on lot_ledger_entries before deletion.
    await supabase
      .from("lot_ledger_entries")
      .update({
        voided_by_entry_id: null,
        voids_entry_id: null,
        duplicate_of: null,
        duplicate_status: null,
        duplicate_metadata: null,
      })
      .in("lot_id", lotIds);
    await supabase.from("lot_ledger_entries").delete().in("lot_id", lotIds);
    await supabase.from("lot_ledger_state").delete().in("lot_id", lotIds);
  }

  if (accountIds.length > 0) {
    await supabase.from("bank_transactions").delete().in("bank_account_id", accountIds);
  }
  await supabase.from("undeposited_funds").delete().in("subdivision_id", subIds).then(
    () => null,
    () => null,
  );
  const { data: notices } = await supabase
    .from("levy_notices")
    .select("id")
    .in("subdivision_id", subIds);
  const noticeIds = (notices ?? []).map((n) => n.id);
  if (noticeIds.length > 0) {
    await supabase.from("levy_notice_items").delete().in("levy_notice_id", noticeIds);
    await supabase.from("levy_notices").update({ linked_levy_id: null }).in("subdivision_id", subIds);
    await supabase.from("levy_notices").delete().in("subdivision_id", subIds);
  }
  await supabase.from("levy_batches").delete().in("subdivision_id", subIds);
  await supabase.from("budgets").delete().in("subdivision_id", subIds);
  await supabase.from("audit_log").delete().in("subdivision_id", subIds);
  await supabase.from("subdivisions").delete().in("id", subIds);
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

  console.log("Ledger-side duplicate-detection verification — PP5-B scenarios\n");
  console.log("[1/3] Cleaning up stale verification data");
  await cleanupMarker();

  console.log("[2/3] Creating fixture");
  const fx = await createFixture();

  console.log("[3/3] Running scenarios\n");

  // Detector scenarios (no auth-resolver shim required).
  await ld1_detectsWithinWindow(fx);
  await ld2_differentLevyNoticeId(fx);
  await ld3_amountMustEqual(fx);
  await ld4_categoryNotPayment(fx);
  await ld5_differentLots(fx);
  await ld6_voidedExcluded(fx);
  await ld7_chainPrevention(fx);
  await ld8_outsideWindow(fx);
  await ld9_monthBoundary(fx);
  await ld10_untargetedCredit(fx);
  await ld18_voidOffsetExcluded(fx);

  // Server-action and integration scenarios.
  const recon = await import("@/lib/actions/reconciliation");

  await ld11_voidAsLedgerDuplicate(fx, recon);
  await ld12_voidAlreadyVoided(fx, recon);
  await ld13_keepAsOverpayment(fx, recon);
  await ld14_voidCascadesMatches(fx, recon);
  await ld15_reconcileTransactionIntegration(fx, recon);
  await ld16_recordCashReceiptBoundary(fx, recon);
  await ld17_orchestratorIntegration(fx, recon);
  await ld19_voidLinkedCreditEndState(fx, recon);
  await ld20_voidUnlinkedCredit(fx, recon);
  await ld21_voidMultiLinkedFails(fx, recon);

  if (!noCleanup) {
    console.log("\nCleaning up");
    await cleanupCompany(fx.companyId);
  }

  const failed = results.filter((r) => !r.passed).length;
  console.log(`\n${results.length - failed}/${results.length} scenarios passed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
