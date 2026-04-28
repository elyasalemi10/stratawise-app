/**
 * Orchestrator verification script (Prompt 4 PP4-A).
 *
 * Exercises the 10 scenarios required by PP4-A end-to-end against the live
 * Supabase dev database. Calls tryAutoMatch() directly (the orchestrator is
 * a pure helper, not a server action — no auth-resolver shim needed).
 *
 * Usage:
 *   npx tsx src/lib/reconciliation/orchestrator.verification.ts
 *   npx tsx src/lib/reconciliation/orchestrator.verification.ts --no-cleanup
 *   npx tsx src/lib/reconciliation/orchestrator.verification.ts --cleanup
 *
 * Test data is tagged with VERIFY_MARKER on management_companies.name and
 * profiles.email/clerk_id, so --cleanup never touches real data.
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import { tryAutoMatch } from "./orchestrator";
import { generateCrn, validateCrn } from "./bpay-crn";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local",
  );
  process.exit(1);
}

const VERIFY_MARKER = "__VERIFY_ORCHESTRATOR__";
const supabase = createClient(supabaseUrl, serviceRoleKey);

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

interface NoticeFixture {
  id: string;
  reference: string;
  bpayCrn: string;
  amount: number;
  fundType: "administrative";
  lotId: string;
}

interface Fixture {
  runId: string;
  companyId: string;
  subdivisionId: string;
  budgetId: string;
  profileId: string;
  /** Admin-fund bank account WITH bpay_biller_code set. */
  adminBpayAccountId: string;
  /** Admin-fund bank account WITHOUT bpay_biller_code (BPAY disabled). */
  adminNoBpayAccountId: string;
  lotIds: string[];
  /** All notices, indexed by levy number (1..N). */
  notices: Record<number, NoticeFixture>;
  /** A separate notice that's been fully paid (stale-reference scenario). */
  staleNotice: NoticeFixture;
}

async function createFixture(): Promise<Fixture> {
  const runId = `${Date.now()}_${randomUUID().slice(0, 8)}`;
  const companyName = `${VERIFY_MARKER}${runId}`;
  const email = `${VERIFY_MARKER.toLowerCase()}${runId}@orch.test`;
  const clerkId = `${VERIFY_MARKER}_CLERK_${runId}`;

  console.log(`\nCreating fixture (runId=${runId})`);

  const { data: company } = await supabase
    .from("management_companies")
    .insert({ name: companyName })
    .select("id")
    .single();
  assert(company, "fixture: company insert failed");

  const { data: profile } = await supabase
    .from("profiles")
    .insert({
      clerk_id: clerkId,
      email,
      first_name: "Orch",
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
      address: "1 Orch Verify St, Melbourne VIC 3000",
      total_lots: 5,
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

  // 5 lots — enough for FIFO + stale + scenario 9/10 isolation.
  const { data: lots } = await supabase
    .from("lots")
    .insert(
      [1, 2, 3, 4, 5].map((n) => ({
        subdivision_id: subdivision.id,
        lot_number: n,
        lot_entitlement: 100,
        lot_liability: 100,
      })),
    )
    .select("id, lot_number")
    .order("lot_number", { ascending: true });
  assert(lots && lots.length === 5, "fixture: lots insert failed");
  const lotIds = lots.map((l) => l.id);

  // Two admin-fund bank accounts: one with biller code, one without.
  const { data: bpayAcct } = await supabase
    .from("bank_accounts")
    .insert({
      subdivision_id: subdivision.id,
      account_name: "BPAY Admin",
      bsb: "012-345",
      account_number: "12345678",
      fund_type: "administrative",
      bpay_biller_code: "1234567",
    })
    .select("id")
    .single();
  assert(bpayAcct, "fixture: bpay-enabled account insert failed");

  const { data: noBpayAcct } = await supabase
    .from("bank_accounts")
    .insert({
      subdivision_id: subdivision.id,
      account_name: "No-BPAY Admin",
      bsb: "012-345",
      account_number: "87654321",
      fund_type: "administrative",
    })
    .select("id")
    .single();
  assert(noBpayAcct, "fixture: no-bpay account insert failed");

  // Fabricate notices with hand-picked levy numbers so the description
  // patterns (LEV-7 vs LEV-77, LEV-3 + LEV-5) are deterministic.
  const noticeNumbers = [3, 5, 7, 77];
  const notices: Record<number, NoticeFixture> = {};
  for (let i = 0; i < noticeNumbers.length; i++) {
    const n = noticeNumbers[i];
    const reference = `LEV-${n}`;
    const bpayCrn = generateCrn(n);
    const lotId = lotIds[i % lotIds.length];
    const { data: notice } = await supabase
      .from("levy_notices")
      .insert({
        subdivision_id: subdivision.id,
        lot_id: lotId,
        budget_id: budget.id,
        reference_number: reference,
        bpay_crn: bpayCrn,
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
    assert(notice, `fixture: notice insert failed for ${reference}`);

    // Outstanding-debit row so the orchestrator's "compute outstanding" step
    // sees a positive amount.
    await supabase.from("lot_ledger_entries").insert({
      subdivision_id: subdivision.id,
      lot_id: lotId,
      fund_type: "administrative",
      entry_type: "debit",
      category: "levy",
      amount: 500,
      entry_date: "2026-01-01",
      reference,
      levy_notice_id: notice.id,
      status: "active",
      created_by: profile.id,
    });

    notices[n] = {
      id: notice.id,
      reference,
      bpayCrn,
      amount: 500,
      fundType: "administrative",
      lotId,
    };
  }

  // Stale notice: $500 outstanding fully covered by an existing credit so
  // the orchestrator reports stale_reference and falls through.
  const staleReference = "LEV-99";
  const staleCrn = generateCrn(99);
  const staleLotId = lotIds[4];
  const { data: staleNotice } = await supabase
    .from("levy_notices")
    .insert({
      subdivision_id: subdivision.id,
      lot_id: staleLotId,
      budget_id: budget.id,
      reference_number: staleReference,
      bpay_crn: staleCrn,
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
  assert(staleNotice, "fixture: stale notice insert failed");

  await supabase.from("lot_ledger_entries").insert([
    {
      subdivision_id: subdivision.id,
      lot_id: staleLotId,
      fund_type: "administrative",
      entry_type: "debit",
      category: "levy",
      amount: 500,
      entry_date: "2026-01-01",
      reference: staleReference,
      levy_notice_id: staleNotice.id,
      status: "active",
      created_by: profile.id,
    },
    {
      subdivision_id: subdivision.id,
      lot_id: staleLotId,
      fund_type: "administrative",
      entry_type: "credit",
      category: "payment",
      amount: 500,
      entry_date: "2026-02-01",
      reference: staleReference,
      levy_notice_id: staleNotice.id,
      status: "active",
      created_by: profile.id,
    },
  ]);

  return {
    runId,
    companyId: company.id,
    subdivisionId: subdivision.id,
    budgetId: budget.id,
    profileId: profile.id,
    adminBpayAccountId: bpayAcct.id,
    adminNoBpayAccountId: noBpayAcct.id,
    lotIds,
    notices,
    staleNotice: {
      id: staleNotice.id,
      reference: staleReference,
      bpayCrn: staleCrn,
      amount: 500,
      fundType: "administrative",
      lotId: staleLotId,
    },
  };
}

// Helper: insert a credit-direction bank_transaction and return its id.
async function insertBankTxn(
  fx: Fixture,
  bankAccountId: string,
  description: string,
  amount: number,
  txDate = "2026-04-15",
): Promise<string> {
  const { data, error } = await supabase
    .from("bank_transactions")
    .insert({
      bank_account_id: bankAccountId,
      source: "manual",
      transaction_date: txDate,
      amount,
      description,
      match_status: "unmatched",
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`insertBankTxn: ${error?.message}`);
  return data.id;
}

async function fetchTxnState(id: string) {
  const { data } = await supabase
    .from("bank_transactions")
    .select("match_status, matched_total")
    .eq("id", id)
    .single();
  return data;
}

async function fetchMatches(bankTxnId: string) {
  const { data } = await supabase
    .from("reconciliation_matches")
    .select("ledger_entry_id, amount_matched, match_method, match_confidence")
    .eq("bank_transaction_id", bankTxnId);
  return data ?? [];
}

async function fetchOrchestratorAudit(bankTxnId: string) {
  const { data } = await supabase
    .from("audit_log")
    .select("action, metadata")
    .eq("entity_id", bankTxnId)
    .eq("action", "reconciliation.auto_match_attempted")
    .order("created_at", { ascending: false })
    .limit(1);
  return data?.[0] ?? null;
}

async function fetchStaleRefAudits(bankTxnId: string) {
  const { data } = await supabase
    .from("audit_log")
    .select("metadata")
    .eq("entity_id", bankTxnId)
    .eq("action", "reconciliation.stale_reference_detected");
  return data ?? [];
}

async function runOrchestrator(
  fx: Fixture,
  bankAccountId: string,
  description: string,
  amount: number,
) {
  const bankTransactionId = await insertBankTxn(
    fx,
    bankAccountId,
    description,
    amount,
  );
  const outcome = await tryAutoMatch({
    bankTransactionId,
    subdivisionId: fx.subdivisionId,
    bankAccountId,
    description,
    amount,
    transactionDate: "2026-04-15",
    performedBy: fx.profileId,
  });
  return { bankTransactionId, outcome };
}

// ─── BPAY preflight (round-trip + sample CRN) ─────────────────────────────

async function bpayPreflight(): Promise<void> {
  console.log("\nBPAY MOD10V01 preflight:");
  const samples = [1, 42, 100, 999, 9999999];
  for (const n of samples) {
    const crn = generateCrn(n);
    const ok = validateCrn(crn);
    console.log(`  generateCrn(${String(n).padStart(7)}) = ${crn}  validate=${ok}`);
    assert(ok, `BPAY round-trip failed for n=${n}`);
  }
  // Eyeball-confirm n=42 explicitly (the user asked to see this in output).
  const crn42 = generateCrn(42);
  console.log(`  → Eyeball confirm: generateCrn(42) = ${crn42}`);
}

// ─── Scenarios ────────────────────────────────────────────────────────────

async function scenario1_LevExactMatch(fx: Fixture) {
  const header = "O1: LEV-7 exact match → auto_reference / exact_reference";
  try {
    const { bankTransactionId, outcome } = await runOrchestrator(
      fx,
      fx.adminNoBpayAccountId, // BPAY disabled, so only Strategy 1 can win
      `Transfer LEV-7 from owner`,
      500,
    );
    assert(outcome.matched, `O1 expected matched, got ${JSON.stringify(outcome)}`);
    assert(outcome.strategy === "reference", `O1 strategy expected reference, got ${outcome.strategy}`);
    assert(outcome.reference === "LEV-7", `O1 reference expected LEV-7, got ${outcome.reference}`);

    const state = await fetchTxnState(bankTransactionId);
    assert(state?.match_status === "auto_matched", `O1 match_status: ${state?.match_status}`);
    assert(Number(state?.matched_total) === 500, `O1 matched_total: ${state?.matched_total}`);

    const matches = await fetchMatches(bankTransactionId);
    assert(matches.length === 1, `O1 expected 1 match, got ${matches.length}`);
    assert(matches[0].match_method === "auto_reference", `O1 match_method: ${matches[0].match_method}`);
    assert(matches[0].match_confidence === "exact_reference", `O1 confidence: ${matches[0].match_confidence}`);

    record(header, true, `matched LEV-7 via reference; matched_total=500/500`);
  } catch (e) {
    record(header, false, (e as Error).message);
  }
}

async function scenario2_LevyVariant(fx: Fixture) {
  const header = "O2: 'Levy NNN' variant → resolves to LEV-NNN";
  try {
    // Fresh notice — LEV-7 from the fixture was already absorbed by O1.
    // The test exercises the "Levy NNN" syntax variant of the regex.
    const reference = "LEV-50";
    const bpayCrn = generateCrn(50);
    const { data: notice } = await supabase
      .from("levy_notices")
      .insert({
        subdivision_id: fx.subdivisionId,
        lot_id: fx.lotIds[0],
        budget_id: fx.budgetId,
        reference_number: reference,
        bpay_crn: bpayCrn,
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
    assert(notice, "O2 inline notice insert failed");
    await supabase.from("lot_ledger_entries").insert({
      subdivision_id: fx.subdivisionId,
      lot_id: fx.lotIds[0],
      fund_type: "administrative",
      entry_type: "debit",
      category: "levy",
      amount: 500,
      entry_date: "2026-01-01",
      reference,
      levy_notice_id: notice.id,
      status: "active",
      created_by: fx.profileId,
    });

    const { outcome } = await runOrchestrator(
      fx,
      fx.adminNoBpayAccountId,
      `Payment Levy 50 from owner`,
      500,
    );
    assert(outcome.matched, `O2 expected matched, got ${JSON.stringify(outcome)}`);
    assert(outcome.reference === reference, `O2 reference: ${outcome.reference}`);
    record(header, true, `'Levy 50' resolved to ${reference}`);
  } catch (e) {
    record(header, false, (e as Error).message);
  }
}

async function scenario3_WordBoundary(fx: Fixture) {
  const header = "O3: 'LEV-77' is not confused with 'LEV-7' (greedy digit capture + word boundary)";
  try {
    const { outcome } = await runOrchestrator(
      fx,
      fx.adminNoBpayAccountId,
      `Transfer LEV-77`,
      500,
    );
    assert(outcome.matched, `O3 expected matched`);
    assert(outcome.reference === "LEV-77", `O3 expected LEV-77, got ${outcome.reference}`);
    record(header, true, `LEV-77 resolves to its own notice, not LEV-7`);
  } catch (e) {
    record(header, false, (e as Error).message);
  }
}

async function scenario4_MultiReferenceFifo(fx: Fixture) {
  const header = "O4: multi-reference 'LEV-3 LEV-5' → FIFO allocation across notices";
  try {
    // Tx $700 vs LEV-3 ($500 outstanding) + LEV-5 ($500 outstanding):
    //   FIFO walk: LEV-3 absorbs 500 → 200 remaining → LEV-5 absorbs 200.
    //   allocatedAmount = 700 = ctx.amount → full match (partial = false).
    // The test signal is FIFO ordering + 2 reconciliation_matches rows
    // with the right per-notice splits.
    const { bankTransactionId, outcome } = await runOrchestrator(
      fx,
      fx.adminNoBpayAccountId,
      `Combined payment LEV-3 LEV-5`,
      700,
    );
    assert(outcome.matched, `O4 expected matched (full), got ${JSON.stringify(outcome)}`);
    assert(!outcome.partial, `O4 expected partial=false (tx $700 ≤ outstanding $1000)`);
    assert(outcome.allocatedAmount === 700, `O4 allocatedAmount: ${outcome.allocatedAmount}`);
    assert(outcome.strategy === "reference", `O4 strategy: ${outcome.strategy}`);

    const matches = await fetchMatches(bankTransactionId);
    assert(matches.length === 2, `O4 expected 2 matches (FIFO), got ${matches.length}`);

    // Verify FIFO split: LEV-3 ledger credit should be $500, LEV-5 should be $200.
    const ledgerEntryIds = matches.map((m) => m.ledger_entry_id);
    const { data: credits } = await supabase
      .from("lot_ledger_entries")
      .select("amount, reference")
      .in("id", ledgerEntryIds);
    const lev3Credit = (credits ?? []).find((c) => c.reference === "LEV-3");
    const lev5Credit = (credits ?? []).find((c) => c.reference === "LEV-5");
    assert(lev3Credit && Number(lev3Credit.amount) === 500, `O4 LEV-3 credit: ${lev3Credit?.amount}`);
    assert(lev5Credit && Number(lev5Credit.amount) === 200, `O4 LEV-5 credit: ${lev5Credit?.amount}`);

    record(header, true, `FIFO ordering correct: LEV-3 absorbed $500, LEV-5 absorbed $200; full match at $700`);
  } catch (e) {
    record(header, false, (e as Error).message);
  }
}

async function scenario5_StaleReferenceFallthrough(fx: Fixture) {
  const header = "O5: stale reference (notice fully paid) → audit + fallthrough";
  try {
    const { bankTransactionId, outcome } = await runOrchestrator(
      fx,
      fx.adminNoBpayAccountId, // BPAY disabled so stale-ref isn't rescued by Strategy 2
      `Transfer ${fx.staleNotice.reference}`,
      500,
    );

    assert(!outcome.matched, `O5 expected !matched`);
    assert(outcome.strategy === null, `O5 strategy: ${outcome.strategy}`);

    const stale = await fetchStaleRefAudits(bankTransactionId);
    assert(stale.length >= 1, `O5 expected stale_reference_detected audit, got ${stale.length}`);

    const orch = await fetchOrchestratorAudit(bankTransactionId);
    assert(orch, `O5 expected orchestrator audit`);
    assert(
      orch.metadata.matched_via === null,
      `O5 expected matched_via=null, got ${orch.metadata.matched_via}`,
    );

    record(header, true, `stale-ref audit written; orchestrator fell through to no-match`);
  } catch (e) {
    record(header, false, (e as Error).message);
  }
}

async function scenario6_BpayCrnMatch(fx: Fixture) {
  const header = "O6: BPAY CRN on enabled account → auto_bpay_crn / basiq_auto";
  try {
    // Use a notice that wasn't already absorbed by O1/O2/O3 (LEV-7 was; LEV-3 was;
    // LEV-5 was partially in O4). LEV-77 is still partially outstanding ($500 - 0 covered).
    // Wait — O3 already matched LEV-77. Use a fresh notice. Add one inline.
    const reference = "LEV-100";
    const bpayCrn = generateCrn(100);
    const { data: notice } = await supabase
      .from("levy_notices")
      .insert({
        subdivision_id: fx.subdivisionId,
        lot_id: fx.lotIds[0],
        budget_id: fx.budgetId,
        reference_number: reference,
        bpay_crn: bpayCrn,
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
    assert(notice, "O6 inline notice insert failed");
    await supabase.from("lot_ledger_entries").insert({
      subdivision_id: fx.subdivisionId,
      lot_id: fx.lotIds[0],
      fund_type: "administrative",
      entry_type: "debit",
      category: "levy",
      amount: 500,
      entry_date: "2026-01-01",
      reference,
      levy_notice_id: notice.id,
      status: "active",
      created_by: fx.profileId,
    });

    // Description has BPAY CRN but no LEV reference. Orchestrator: Strategy 1
    // returns no_reference; Strategy 2 (BPAY enabled on adminBpayAccountId) hits.
    const { outcome } = await runOrchestrator(
      fx,
      fx.adminBpayAccountId,
      `BPAY ${bpayCrn} payment`,
      500,
    );
    assert(outcome.matched, `O6 expected matched, got ${JSON.stringify(outcome)}`);
    assert(outcome.strategy === "bpay_crn", `O6 strategy: ${outcome.strategy}`);
    assert(outcome.reference === reference, `O6 reference: ${outcome.reference}`);

    record(header, true, `matched ${reference} via BPAY CRN ${bpayCrn}`);
  } catch (e) {
    record(header, false, (e as Error).message);
  }
}

async function scenario7_BpayCrnDisabledAccount(fx: Fixture) {
  const header = "O7: BPAY CRN on disabled account → Strategy 2 returns no_biller_code";
  try {
    const crn = generateCrn(7);
    const { bankTransactionId, outcome } = await runOrchestrator(
      fx,
      fx.adminNoBpayAccountId, // no biller code → Strategy 2 skips
      `BPAY ${crn} payment`, // no LEV reference, no biller → no match
      500,
    );
    assert(!outcome.matched, `O7 expected !matched`);

    const orch = await fetchOrchestratorAudit(bankTransactionId);
    assert(orch, "O7 expected orchestrator audit");
    const tried = orch.metadata.strategies_tried as Array<{
      strategy: string;
      outcome: string;
    }>;
    const bpay = tried.find((t) => t.strategy === "bpay_crn");
    assert(bpay, "O7 missing bpay_crn entry in strategies_tried");
    assert(
      bpay.outcome === "no_biller_code",
      `O7 expected bpay_crn outcome=no_biller_code, got ${bpay.outcome}`,
    );

    record(header, true, `Strategy 2 skipped with reason=no_biller_code`);
  } catch (e) {
    record(header, false, (e as Error).message);
  }
}

async function scenario8_InvalidCheckDigit(fx: Fixture) {
  const header = "O8: BPAY CRN with invalid check digit → Strategy 2 returns invalid_check_digit";
  try {
    // Take a valid CRN and corrupt the last digit.
    const goodCrn = generateCrn(7);
    const lastDigit = Number.parseInt(goodCrn.slice(-1), 10);
    const corrupt =
      goodCrn.slice(0, -1) + String((lastDigit + 1) % 10);
    assert(!validateCrn(corrupt), "O8 corrupt CRN unexpectedly validates");

    const { bankTransactionId, outcome } = await runOrchestrator(
      fx,
      fx.adminBpayAccountId,
      `BPAY ${corrupt} payment`,
      500,
    );
    assert(!outcome.matched, `O8 expected !matched`);

    const orch = await fetchOrchestratorAudit(bankTransactionId);
    assert(orch, "O8 expected orchestrator audit");
    const tried = orch.metadata.strategies_tried as Array<{
      strategy: string;
      outcome: string;
    }>;
    const bpay = tried.find((t) => t.strategy === "bpay_crn");
    assert(bpay, "O8 missing bpay_crn entry in strategies_tried");
    assert(
      bpay.outcome === "invalid_check_digit",
      `O8 expected bpay_crn outcome=invalid_check_digit, got ${bpay.outcome}`,
    );

    record(header, true, `corrupted CRN ${corrupt} rejected with invalid_check_digit`);
  } catch (e) {
    record(header, false, (e as Error).message);
  }
}

async function scenario9_StopAtFirstMatchReference(fx: Fixture) {
  const header = "O9: orchestrator stops at Strategy 1 — BPAY not tried when reference matches";
  try {
    // Insert a fresh outstanding notice so prior scenarios haven't touched it.
    const reference = "LEV-200";
    const bpayCrn = generateCrn(200);
    const { data: notice } = await supabase
      .from("levy_notices")
      .insert({
        subdivision_id: fx.subdivisionId,
        lot_id: fx.lotIds[1],
        budget_id: fx.budgetId,
        reference_number: reference,
        bpay_crn: bpayCrn,
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
    assert(notice, "O9 notice insert failed");
    await supabase.from("lot_ledger_entries").insert({
      subdivision_id: fx.subdivisionId,
      lot_id: fx.lotIds[1],
      fund_type: "administrative",
      entry_type: "debit",
      category: "levy",
      amount: 500,
      entry_date: "2026-01-01",
      reference,
      levy_notice_id: notice.id,
      status: "active",
      created_by: fx.profileId,
    });

    // Description carries BOTH the LEV reference AND a (random valid) CRN. The
    // orchestrator must stop at Strategy 1 — Strategy 2 should NOT appear in
    // strategies_tried.
    const { bankTransactionId, outcome } = await runOrchestrator(
      fx,
      fx.adminBpayAccountId,
      `${reference} BPAY ${bpayCrn} payment`,
      500,
    );
    assert(outcome.matched, `O9 expected matched`);
    assert(outcome.strategy === "reference", `O9 strategy: ${outcome.strategy}`);

    const orch = await fetchOrchestratorAudit(bankTransactionId);
    const tried = orch?.metadata.strategies_tried as Array<{
      strategy: string;
      outcome: string;
    }>;
    assert(
      tried.find((t) => t.strategy === "reference")?.outcome === "matched",
      `O9 reference should be matched in strategies_tried`,
    );
    assert(
      !tried.find((t) => t.strategy === "bpay_crn"),
      `O9 expected bpay_crn NOT in strategies_tried (orchestrator stopped at reference)`,
    );

    record(header, true, `reference matched; orchestrator stopped before BPAY (strategies_tried.length=${tried.length})`);
  } catch (e) {
    record(header, false, (e as Error).message);
  }
}

async function scenario10_FallthroughToBpay(fx: Fixture) {
  const header = "O10: Strategy 1 misses, Strategy 2 hits → orchestrator returns at Strategy 2";
  try {
    const reference = "LEV-201";
    const bpayCrn = generateCrn(201);
    const { data: notice } = await supabase
      .from("levy_notices")
      .insert({
        subdivision_id: fx.subdivisionId,
        lot_id: fx.lotIds[2],
        budget_id: fx.budgetId,
        reference_number: reference,
        bpay_crn: bpayCrn,
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
    assert(notice, "O10 notice insert failed");
    await supabase.from("lot_ledger_entries").insert({
      subdivision_id: fx.subdivisionId,
      lot_id: fx.lotIds[2],
      fund_type: "administrative",
      entry_type: "debit",
      category: "levy",
      amount: 500,
      entry_date: "2026-01-01",
      reference,
      levy_notice_id: notice.id,
      status: "active",
      created_by: fx.profileId,
    });

    // Description has CRN but no LEV reference. Strategy 1: no_reference.
    // Strategy 2: matches.
    const { bankTransactionId, outcome } = await runOrchestrator(
      fx,
      fx.adminBpayAccountId,
      `BPAY ${bpayCrn} owner payment`,
      500,
    );
    assert(outcome.matched, `O10 expected matched`);
    assert(outcome.strategy === "bpay_crn", `O10 strategy: ${outcome.strategy}`);

    const orch = await fetchOrchestratorAudit(bankTransactionId);
    const tried = orch?.metadata.strategies_tried as Array<{
      strategy: string;
      outcome: string;
    }>;
    const ref = tried.find((t) => t.strategy === "reference");
    const bpay = tried.find((t) => t.strategy === "bpay_crn");
    assert(ref?.outcome === "no_reference", `O10 reference outcome: ${ref?.outcome}`);
    assert(bpay?.outcome === "matched", `O10 bpay outcome: ${bpay?.outcome}`);

    record(header, true, `Strategy 1 returned no_reference; Strategy 2 matched ${reference}`);
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
      await supabase
        .from("lot_ledger_entries")
        .update({ voided_by_entry_id: null, voids_entry_id: null })
        .in("lot_id", lotIds);
      await supabase.from("lot_ledger_entries").delete().in("lot_id", lotIds);
      await supabase.from("lot_ledger_state").delete().in("lot_id", lotIds);
    }

    if (accountIds.length > 0) {
      await supabase.from("bank_transactions").delete().in("bank_account_id", accountIds);
    }
    await supabase.from("payments").delete().in("subdivision_id", subIds);

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

  console.log("Orchestrator verification — PP4-A scenarios");

  await bpayPreflight();
  await cleanupMarker();
  const fx = await createFixture();

  try {
    await scenario1_LevExactMatch(fx);
    await scenario2_LevyVariant(fx);
    await scenario3_WordBoundary(fx);
    await scenario4_MultiReferenceFifo(fx);
    await scenario5_StaleReferenceFallthrough(fx);
    await scenario6_BpayCrnMatch(fx);
    await scenario7_BpayCrnDisabledAccount(fx);
    await scenario8_InvalidCheckDigit(fx);
    await scenario9_StopAtFirstMatchReference(fx);
    await scenario10_FallthroughToBpay(fx);
  } catch (e) {
    console.error(`\nFatal in scenarios: ${(e as Error).message}`);
  }

  const passed = results.filter((r) => r.passed).length;
  const failed = results.length - passed;
  console.log(`\nResults: ${passed} passed, ${failed} failed, ${results.length} total`);

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
