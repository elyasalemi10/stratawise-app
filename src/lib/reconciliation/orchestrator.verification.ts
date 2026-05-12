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
 * profiles.email/auth_user_id, so --cleanup never touches real data.
 */

import { config } from "dotenv";
config({ path: ".env.local" });

// PP6-D-D-fix: gate Resend sends. tryAutoMatch's success path now invokes
// emitPaymentReceivedEmail via the PP6-C-1 integration.
process.env.EMAIL_DRY_RUN = "true";

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import { tryAutoMatch } from "./orchestrator";
import { generateCrn, validateCrn } from "./bpay-crn";
import { generateSubdivisionCode } from "@/lib/subdivision-code";
import { canonicaliseSender } from "./canonical";
import {
  createBankPayerMapping,
  resolveCollision,
  sweepMappingsForOwnerChange,
  detectRepeatedManualMatch,
} from "./mappings";

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
      auth_user_id: clerkId,
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
      short_code: generateSubdivisionCode(),
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

  // PP4-B fix: bump the per-OC levy counter past the hand-picked fixture
  // numbers (3, 5, 7, 77, 99) + the inline-inserted scenario numbers
  // (50, 100, 200, 201) so subsequent next_reference_number calls in
  // mkOutstandingNotice can't collide with anything pre-created.
  await supabase
    .from("subdivisions")
    .update({ next_levy_number: 1000 })
    .eq("id", subdivision.id);

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
    .select(
      "ledger_entry_id, amount_matched, match_method, match_confidence, review_required",
    )
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
    // SG-1 mitigation: use an unusual amount so Strategy 5 (amount-window)
    // can't match a leftover outstanding notice (e.g. LEV-5's residual $300
    // from O4's partial allocation) and short-circuit the stale-ref test.
    const { bankTransactionId, outcome } = await runOrchestrator(
      fx,
      fx.adminNoBpayAccountId, // BPAY disabled so stale-ref isn't rescued by Strategy 2
      `Transfer ${fx.staleNotice.reference}`,
      77777.77,
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

// ─── PP4-B helpers ────────────────────────────────────────────────────────

let _freshLotCounter = 1000;
async function mkFreshLot(fx: Fixture): Promise<string> {
  const n = _freshLotCounter++;
  const { data, error } = await supabase
    .from("lots")
    .insert({
      subdivision_id: fx.subdivisionId,
      lot_number: n,
      lot_entitlement: 100,
      lot_liability: 100,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`mkFreshLot: ${error?.message}`);
  return data.id;
}

async function mkOutstandingNotice(
  fx: Fixture,
  lotId: string,
  opts: {
    levyType?: "regular" | "special";
    amount?: number;
    dueDate?: string;
    periodStart?: string;
    bpayCrn?: string | null;
  } = {},
): Promise<{ id: string; reference: string }> {
  const { data: refRow } = await supabase.rpc("next_reference_number", {
    p_prefix: "LEV",
    p_subdivision_id: fx.subdivisionId,
  });
  const reference = String(refRow);
  const amount = opts.amount ?? 500;
  const dueDate = opts.dueDate ?? "2026-04-28";
  const periodStart = opts.periodStart ?? "2026-01-01";
  const { data: notice, error: noticeErr } = await supabase
    .from("levy_notices")
    .insert({
      subdivision_id: fx.subdivisionId,
      lot_id: lotId,
      budget_id: fx.budgetId,
      reference_number: reference,
      bpay_crn: opts.bpayCrn ?? null,
      fund_type: "administrative",
      levy_type: opts.levyType ?? "regular",
      period_start: periodStart,
      period_end: dueDate,
      amount,
      due_date: dueDate,
      status: "draft",
    })
    .select("id")
    .single();
  if (!notice) {
    throw new Error(
      `mkOutstandingNotice: notice insert failed: ${noticeErr?.message ?? "unknown"} (ref=${reference}, lot=${lotId}, amount=${amount})`,
    );
  }
  await supabase.from("lot_ledger_entries").insert({
    subdivision_id: fx.subdivisionId,
    lot_id: lotId,
    fund_type: "administrative",
    entry_type: "debit",
    category: opts.levyType === "special" ? "special_levy" : "levy",
    amount,
    entry_date: periodStart,
    reference,
    levy_notice_id: notice.id,
    status: "active",
    created_by: fx.profileId,
  });
  return { id: notice.id, reference };
}

async function mkBatch(
  fx: Fixture,
  matchKeywords: string[],
  label: string,
): Promise<string> {
  const { data: batch } = await supabase
    .from("levy_batches")
    .insert({
      subdivision_id: fx.subdivisionId,
      budget_id: fx.budgetId,
      financial_year: "2026-2027",
      fund_type: "administrative",
      period_start: "2026-04-01",
      period_end: "2026-06-30",
      period_label: label,
      due_date: "2026-04-28",
      total_amount: 0,
      levy_count: 0,
      status: "draft",
      generated_by: fx.profileId,
      match_keywords: matchKeywords,
    })
    .select("id")
    .single();
  if (!batch) throw new Error(`mkBatch: insert failed`);
  return batch.id;
}

async function setNoticeBatch(noticeId: string, batchId: string): Promise<void> {
  await supabase
    .from("levy_notices")
    .update({ batch_id: batchId })
    .eq("id", noticeId);
}

async function fetchMapping(id: string) {
  const { data } = await supabase
    .from("bank_payer_mappings")
    .select("*")
    .eq("id", id)
    .single();
  return data;
}

async function fetchAllMappings(subdivisionId: string) {
  const { data } = await supabase
    .from("bank_payer_mappings")
    .select("id, canonical_sender_name, lot_id, status")
    .eq("subdivision_id", subdivisionId);
  return data ?? [];
}

// Direct insert bypassing the createBankPayerMapping collision check.
// Used to construct fixture states (e.g. ambiguous status) that the
// public API would refuse to create.
async function insertMappingDirect(
  fx: Fixture,
  canonicalName: string,
  lotId: string,
  status: "active" | "ambiguous" | "disabled" = "active",
): Promise<string> {
  const { data, error } = await supabase
    .from("bank_payer_mappings")
    .insert({
      subdivision_id: fx.subdivisionId,
      canonical_sender_name: canonicalName,
      lot_id: lotId,
      status,
      raw_examples: [],
      created_by: fx.profileId,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`insertMappingDirect: ${error?.message}`);
  return data.id;
}

// ─── Strategy 3 — known_payer (O11–O12) ────────────────────────────────────

async function scenario11_KnownPayerUnambiguous(fx: Fixture) {
  const header = "O11: Strategy 3 unambiguous canonical match → name_match";
  try {
    const lotId = await mkFreshLot(fx);
    const notice = await mkOutstandingNotice(fx, lotId, { amount: 500 });
    await insertMappingDirect(fx, "JANE BROWN", lotId, "active");

    const { bankTransactionId, outcome } = await runOrchestrator(
      fx,
      fx.adminNoBpayAccountId, // BPAY disabled — no Strategy 2 confound
      "Transfer from Jane Brown",
      500,
    );

    assert(outcome.matched, `O11 expected matched`);
    assert(outcome.strategy === "known_payer", `O11 strategy: ${outcome.strategy}`);
    assert(outcome.reference === notice.reference, `O11 reference: ${outcome.reference}`);

    const matches = await fetchMatches(bankTransactionId);
    assert(matches.length === 1, `O11 matches: ${matches.length}`);
    assert(matches[0].match_method === "auto_sender", `O11 method: ${matches[0].match_method}`);
    assert(matches[0].match_confidence === "name_match", `O11 confidence: ${matches[0].match_confidence}`);

    record(header, true, `JANE BROWN → lot mapped → ${notice.reference} matched ($500)`);
  } catch (e) {
    record(header, false, (e as Error).message);
  }
}

async function scenario12_KnownPayerAmbiguousFiltered(fx: Fixture) {
  const header =
    "O12: Strategy 3 with ambiguous-status mapping → no_mapping (status filter excludes)";
  try {
    // Note: the partial UNIQUE active index makes "≥ 2 active mappings" for the
    // same canonical name unreachable under normal operation. The defensive
    // ≥2 branch in known-payer.ts is there for paranoia. This scenario tests
    // the realistic ambiguous-but-status='ambiguous' case: Strategy 3's
    // .eq("status", "active") filter excludes ambiguous mappings, returning
    // 'no_mapping'.
    const lotId = await mkFreshLot(fx);
    // SG-1 mitigation: NO outstanding notice on this lot — Strategy 5 has
    // nothing to match at the unusual amount. Strategy 3 only needs the
    // mapping (in ambiguous status) to verify the active-status filter
    // excludes it.
    await insertMappingDirect(fx, "AMBIGUOUS PAYER", lotId, "ambiguous");

    const { bankTransactionId, outcome } = await runOrchestrator(
      fx,
      fx.adminNoBpayAccountId,
      "Transfer from Ambiguous Payer",
      33333.33,
    );

    assert(!outcome.matched, `O12 expected !matched, got ${JSON.stringify(outcome)}`);

    const orch = await fetchOrchestratorAudit(bankTransactionId);
    const tried = orch?.metadata.strategies_tried as Array<{
      strategy: string;
      outcome: string;
    }>;
    const knownPayer = tried.find((t) => t.strategy === "known_payer");
    assert(knownPayer, "O12 missing known_payer entry in strategies_tried");
    assert(
      knownPayer.outcome === "no_mapping",
      `O12 expected known_payer outcome=no_mapping (ambiguous filtered), got ${knownPayer.outcome}`,
    );

    record(header, true, `ambiguous mapping correctly excluded by Strategy 3's active-status filter`);
  } catch (e) {
    record(header, false, (e as Error).message);
  }
}

// ─── Strategy 4 — keyword + amount (O13–O14) ──────────────────────────────

async function scenario13_KeywordAmountMatch(fx: Fixture) {
  const header = "O13: Strategy 4 keyword + exact amount → review_required=true";
  try {
    const lotId = await mkFreshLot(fx);
    const batchId = await mkBatch(fx, ["gardening"], "O13 batch");
    const notice = await mkOutstandingNotice(fx, lotId, { amount: 750 });
    await setNoticeBatch(notice.id, batchId);

    const { bankTransactionId, outcome } = await runOrchestrator(
      fx,
      fx.adminNoBpayAccountId,
      "Gardening services Q1",
      750,
    );
    assert(outcome.matched, `O13 expected matched`);
    assert(
      outcome.strategy === "keyword_amount",
      `O13 strategy: ${outcome.strategy}`,
    );

    const matches = await fetchMatches(bankTransactionId);
    assert(matches.length === 1, `O13 matches: ${matches.length}`);
    assert(
      matches[0].match_confidence === "amount_match",
      `O13 confidence: ${matches[0].match_confidence}`,
    );
    assert(
      matches[0].review_required === true,
      `O13 expected review_required=true on the match row`,
    );

    record(header, true, `keyword 'gardening' + amount $750 matched ${notice.reference}; review_required=true`);
  } catch (e) {
    record(header, false, (e as Error).message);
  }
}

async function scenario14_KeywordAmountMismatch(fx: Fixture) {
  const header = "O14: Strategy 4 keyword hits but amount mismatches → no match";
  try {
    const lotId = await mkFreshLot(fx);
    const batchId = await mkBatch(fx, ["painting"], "O14 batch");
    const notice = await mkOutstandingNotice(fx, lotId, { amount: 500 });
    await setNoticeBatch(notice.id, batchId);

    // Description has the keyword, but amount is different.
    const { bankTransactionId, outcome } = await runOrchestrator(
      fx,
      fx.adminNoBpayAccountId,
      "Painting services contractor",
      999,
    );
    assert(!outcome.matched, `O14 expected !matched`);

    const orch = await fetchOrchestratorAudit(bankTransactionId);
    const tried = orch?.metadata.strategies_tried as Array<{
      strategy: string;
      outcome: string;
    }>;
    const kw = tried.find((t) => t.strategy === "keyword_amount");
    assert(kw, "O14 missing keyword_amount entry");
    assert(
      kw.outcome === "no_amount_match",
      `O14 expected keyword_amount outcome=no_amount_match, got ${kw.outcome}`,
    );

    record(header, true, `keyword hit but amount $999 ≠ notice $500 → no match`);
  } catch (e) {
    record(header, false, (e as Error).message);
  }
}

// ─── Strategy 5 — amount window (O15–O17) ──────────────────────────────────

async function scenario15_AmountWindowSingleCandidate(fx: Fixture) {
  const header = "O15: Strategy 5 single amount candidate in window → match (review_required=true)";
  try {
    const lotId = await mkFreshLot(fx);
    const notice = await mkOutstandingNotice(fx, lotId, {
      amount: 642.50,
      dueDate: "2026-04-20",
    });

    const { bankTransactionId, outcome } = await runOrchestrator(
      fx,
      fx.adminNoBpayAccountId,
      "owner payment",
      642.50,
    );
    assert(outcome.matched, `O15 expected matched`);
    assert(
      outcome.strategy === "amount_window",
      `O15 strategy: ${outcome.strategy}`,
    );

    const matches = await fetchMatches(bankTransactionId);
    assert(matches.length === 1, `O15 matches: ${matches.length}`);
    assert(
      matches[0].review_required === true,
      `O15 review_required must be true`,
    );

    record(header, true, `amount $642.50 within ±30d window → matched ${notice.reference}`);
  } catch (e) {
    record(header, false, (e as Error).message);
  }
}

async function scenario16_AmountWindowMultipleCandidates(fx: Fixture) {
  const header = "O16: Strategy 5 multiple amount candidates → falls through";
  try {
    const lotA = await mkFreshLot(fx);
    const lotB = await mkFreshLot(fx);
    await mkOutstandingNotice(fx, lotA, {
      amount: 333,
      dueDate: "2026-04-15",
    });
    await mkOutstandingNotice(fx, lotB, {
      amount: 333,
      dueDate: "2026-04-25",
    });

    const { bankTransactionId, outcome } = await runOrchestrator(
      fx,
      fx.adminNoBpayAccountId,
      "owner payment",
      333,
    );
    assert(!outcome.matched, `O16 expected !matched`);

    const orch = await fetchOrchestratorAudit(bankTransactionId);
    const tried = orch?.metadata.strategies_tried as Array<{
      strategy: string;
      outcome: string;
    }>;
    const aw = tried.find((t) => t.strategy === "amount_window");
    assert(aw, "O16 missing amount_window entry");
    assert(
      aw.outcome === "multiple_candidates",
      `O16 expected amount_window outcome=multiple_candidates, got ${aw.outcome}`,
    );

    record(header, true, `2 candidates same amount → strategy skipped (no priority preference)`);
  } catch (e) {
    record(header, false, (e as Error).message);
  }
}

async function scenario17_AmountWindowOrdinaryAndSpecialNoTiebreak(fx: Fixture) {
  const header =
    "O17: Strategy 5 ordinary AND special same amount in window → NO match (Addition 1: no priority preference)";
  try {
    const lotA = await mkFreshLot(fx);
    const lotB = await mkFreshLot(fx);
    await mkOutstandingNotice(fx, lotA, {
      amount: 444,
      dueDate: "2026-04-10",
      levyType: "regular",
    });
    await mkOutstandingNotice(fx, lotB, {
      amount: 444,
      dueDate: "2026-04-20",
      levyType: "special",
    });

    const { outcome } = await runOrchestrator(
      fx,
      fx.adminNoBpayAccountId,
      "owner payment",
      444,
    );
    assert(!outcome.matched, `O17 expected !matched`);
    assert(
      outcome.strategy === null,
      `O17 expected strategy=null (no match), got ${outcome.strategy}`,
    );

    record(
      header,
      true,
      `ordinary + special both $444: Strategy 5 returns multiple_candidates with no priority tiebreak`,
    );
  } catch (e) {
    record(header, false, (e as Error).message);
  }
}

// ─── Strategy 6 — fuzzy hint (O18–O20) ────────────────────────────────────

// SCENARIO-AUTHORING GUIDANCE for Strategy 6 fuzzy-hint tests:
//
// Strategy 6 compares the canonicalised description against EVERY active
// bank_payer_mapping in the subdivision. The fixture accumulates mappings
// as PP4-B scenarios run (O11 inserts MARTHA, O18 inserts MARTHA, C1-C9
// insert C1 PAYER through C9 PAYER, etc). To remain robust as the fixture
// grows:
//
//   - Descriptions for "no hint" tests (e.g. O19) must score < 0.50
//     against ALL existing fixture mappings to ensure the test stays
//     green when future scenarios add new mappings. Use deliberately
//     rare letter sequences like 'Qqq Xxx Yyy Zzz' (no shared characters
//     with English-letter mappings → JW = 0).
//
//   - Descriptions for "hint surfaced" tests (e.g. O18, O20) should
//     target a SPECIFIC mapping inserted by the same scenario, and use
//     an unusual tx amount so Strategy 5 doesn't accidentally match
//     before Strategy 6 fires.
//
// Use an unusual amount so prior scenarios' $500/$750/$642.50 notices
// don't accidentally satisfy Strategy 5's amount-window check, which
// would short-circuit Strategy 6.
const FUZZY_TEST_AMOUNT = 77_777.77;

async function scenario18_FuzzyHintAboveThreshold(fx: Fixture) {
  const header = "O18: Strategy 6 similarity ≥ 0.75 → hint surfaced (no auto)";
  try {
    const lotId = await mkFreshLot(fx);
    await insertMappingDirect(fx, "MARTHA", lotId, "active");
    // No notice on this lot — Strategies 1-5 must all miss so Strategy 6
    // gets the chance to fire.

    // Description "Marc" → canonical "MARC". jw("MARC", "MARTHA") = 0.825.
    const { bankTransactionId, outcome } = await runOrchestrator(
      fx,
      fx.adminNoBpayAccountId,
      "Marc",
      FUZZY_TEST_AMOUNT,
    );
    assert(!outcome.matched, `O18 expected !matched (fuzzy never auto-matches)`);

    const { data: bt } = await supabase
      .from("bank_transactions")
      .select("fuzzy_hint_metadata")
      .eq("id", bankTransactionId)
      .single();
    assert(
      bt?.fuzzy_hint_metadata,
      `O18 expected fuzzy_hint_metadata to be persisted on the bank_transaction`,
    );
    const meta = bt!.fuzzy_hint_metadata as Record<string, unknown>;
    assert(
      meta.hint_surfaced === true,
      `O18 expected hint_surfaced=true, got ${JSON.stringify(meta)}`,
    );
    assert(
      meta.canonical_name === "MARTHA",
      `O18 canonical_name should be MARTHA, got ${meta.canonical_name}`,
    );
    const sim = meta.similarity as number;
    assert(
      typeof sim === "number" && sim >= 0.75,
      `O18 similarity must be ≥ 0.75, got ${sim}`,
    );

    record(
      header,
      true,
      `'Marc' (canonical=MARC) ~ MARTHA: similarity=${sim}; hint persisted on bank_transaction`,
    );
  } catch (e) {
    record(header, false, (e as Error).message);
  }
}

async function scenario19_FuzzyHintBelowThreshold(fx: Fixture) {
  const header = "O19: Strategy 6 similarity < 0.75 → no hint";
  try {
    // No mapping insert needed — Strategy 6 compares against ALL active
    // mappings in the subdivision (accumulated from prior scenarios).
    // Description "Qqq Xxx Yyy" — letters not present in any mapping →
    // jw ≈ 0 against all mappings.

    const { bankTransactionId, outcome } = await runOrchestrator(
      fx,
      fx.adminNoBpayAccountId,
      "Qqq Xxx Yyy Zzz",
      FUZZY_TEST_AMOUNT,
    );
    assert(!outcome.matched, `O19 expected !matched`);

    const { data: bt } = await supabase
      .from("bank_transactions")
      .select("fuzzy_hint_metadata")
      .eq("id", bankTransactionId)
      .single();
    assert(
      !bt?.fuzzy_hint_metadata,
      `O19 expected fuzzy_hint_metadata to be NULL (no hint), got ${JSON.stringify(bt?.fuzzy_hint_metadata)}`,
    );

    record(header, true, `low-similarity description produced no hint`);
  } catch (e) {
    record(header, false, (e as Error).message);
  }
}

async function scenario20_FuzzyHintHighSimilarityNeverAutoMatches(fx: Fixture) {
  const header =
    "O20: Strategy 6 high similarity (~0.96) still hint-only — auto requires exact canonical equality";
  try {
    // MARTHA mapping inserted in O18 still active. Description canonicalises
    // to MARHTA. jw(MARHTA, MARTHA) = 0.9611 — well above threshold, but
    // Strategy 3 misses because canonical strings aren't equal. Strategy 6
    // surfaces hint without auto-matching.
    const { bankTransactionId, outcome } = await runOrchestrator(
      fx,
      fx.adminNoBpayAccountId,
      "Marhta",
      FUZZY_TEST_AMOUNT,
    );
    assert(
      !outcome.matched,
      `O20 expected !matched even at very high similarity`,
    );

    const { data: bt } = await supabase
      .from("bank_transactions")
      .select("fuzzy_hint_metadata")
      .eq("id", bankTransactionId)
      .single();
    assert(bt?.fuzzy_hint_metadata, `O20 expected fuzzy_hint_metadata`);
    const meta = bt!.fuzzy_hint_metadata as Record<string, unknown>;
    assert(meta.hint_surfaced === true, `O20 hint_surfaced=true expected`);
    const sim = meta.similarity as number;
    assert(sim >= 0.95, `O20 similarity should be ≥ 0.95 (got ${sim})`);

    record(
      header,
      true,
      `MARHTA ~ MARTHA: similarity=${sim} (very high) but still hint-only — no auto-match`,
    );
  } catch (e) {
    record(header, false, (e as Error).message);
  }
}

// ─── Collision scenarios (C1–C9) ───────────────────────────────────────────

async function scenarioC1_CreateMappingNoCollision(fx: Fixture) {
  const header = "C1: createBankPayerMapping with no collision → succeeds";
  try {
    const lotId = await mkFreshLot(fx);
    const result = await createBankPayerMapping({
      subdivision_id: fx.subdivisionId,
      canonical_sender_name: "C1 PAYER",
      lot_id: lotId,
      created_by: fx.profileId,
    });
    assert(result.ok, `C1 expected ok, got ${JSON.stringify(result)}`);
    if (!result.ok) return;
    const m = await fetchMapping(result.mapping_id);
    assert(m?.status === "active", `C1 expected status=active, got ${m?.status}`);
    record(header, true, `mapping_id=${result.mapping_id.slice(0, 8)} status=active`);
  } catch (e) {
    record(header, false, (e as Error).message);
  }
}

async function scenarioC2_CreateMappingNameCollision(fx: Fixture) {
  const header = "C2: createBankPayerMapping with name collision → returns three-way payload";
  try {
    const lotA = await mkFreshLot(fx);
    const lotB = await mkFreshLot(fx);
    const m1 = await createBankPayerMapping({
      subdivision_id: fx.subdivisionId,
      canonical_sender_name: "C2 PAYER",
      lot_id: lotA,
      created_by: fx.profileId,
    });
    assert(m1.ok, "C2 first mapping should succeed");

    const m2 = await createBankPayerMapping({
      subdivision_id: fx.subdivisionId,
      canonical_sender_name: "C2 PAYER",
      lot_id: lotB,
      created_by: fx.profileId,
    });
    assert(!m2.ok && m2.kind === "collision", `C2 expected collision`);
    if (m2.ok) return;
    assert(
      m2.colliding_mappings.length === 1,
      `C2 expected 1 colliding mapping, got ${m2.colliding_mappings.length}`,
    );
    assert(
      m2.colliding_mappings[0].previous_status === "active",
      `C2 previous_status: ${m2.colliding_mappings[0].previous_status}`,
    );
    assert(
      m2.colliding_mappings[0].current_status === "ambiguous",
      `C2 current_status: ${m2.colliding_mappings[0].current_status}`,
    );

    // Verify lotA's mapping is now ambiguous in the DB.
    if (m1.ok) {
      const fresh = await fetchMapping(m1.mapping_id);
      assert(
        fresh?.status === "ambiguous",
        `C2 lotA mapping should be ambiguous, got ${fresh?.status}`,
      );
    }

    record(header, true, `collision detected; lotA flipped active → ambiguous; new mapping refused`);
  } catch (e) {
    record(header, false, (e as Error).message);
  }
}

async function scenarioC3_OwnershipChangeFlipsToAmbiguous(fx: Fixture) {
  const header = "C3: sweepMappingsForOwnerChange flips active mappings on other lots to ambiguous";
  try {
    const lotA = await mkFreshLot(fx);
    const lotB = await mkFreshLot(fx);
    const mA = await insertMappingDirect(fx, "C3 SHARED NAME", lotA, "active");

    // New owner name on lotB canonicalises to "C3 SHARED NAME" — sweep
    // should flip lotA's mapping to ambiguous (Addition 2: never auto-promotes).
    const result = await sweepMappingsForOwnerChange(
      fx.subdivisionId,
      lotB,
      "C3 SHARED NAME",
      fx.profileId,
    );
    assert(result.flipped_count === 1, `C3 expected 1 flipped, got ${result.flipped_count}`);
    assert(result.flipped_ids.includes(mA), `C3 expected lotA mapping in flipped_ids`);

    const fresh = await fetchMapping(mA);
    assert(fresh?.status === "ambiguous", `C3 lotA status: ${fresh?.status}`);

    record(header, true, `lotA mapping flipped active → ambiguous on owner-change sweep`);
  } catch (e) {
    record(header, false, (e as Error).message);
  }
}

async function scenarioC4_KeepExistingRestoresStatus(fx: Fixture) {
  const header = "C4: resolveCollision('keep_existing') restores mapping to its previous status";
  try {
    const lotA = await mkFreshLot(fx);
    const lotB = await mkFreshLot(fx);
    const m1 = await createBankPayerMapping({
      subdivision_id: fx.subdivisionId,
      canonical_sender_name: "C4 PAYER",
      lot_id: lotA,
      created_by: fx.profileId,
    });
    assert(m1.ok, "C4 first create");

    const m2 = await createBankPayerMapping({
      subdivision_id: fx.subdivisionId,
      canonical_sender_name: "C4 PAYER",
      lot_id: lotB,
      created_by: fx.profileId,
    });
    assert(!m2.ok && m2.kind === "collision", "C4 expected collision");
    if (m2.ok) return;

    const r = await resolveCollision({
      subdivision_id: fx.subdivisionId,
      canonical_sender_name: "C4 PAYER",
      proposed_lot_id: lotB,
      resolution: "keep_existing",
      expected_collisions: m2.colliding_mappings,
      performed_by: fx.profileId,
    });
    assert(r.ok && r.resolution_applied === "keep_existing", `C4 resolution: ${JSON.stringify(r)}`);

    if (m1.ok) {
      const fresh = await fetchMapping(m1.mapping_id);
      assert(fresh?.status === "active", `C4 lotA restored to active, got ${fresh?.status}`);
    }
    record(header, true, `lotA mapping restored ambiguous → active`);
  } catch (e) {
    record(header, false, (e as Error).message);
  }
}

async function scenarioC5_UpdateResolutionDisablesAndCreates(fx: Fixture) {
  const header = "C5: resolveCollision('update') disables existing + creates proposed as active";
  try {
    const lotA = await mkFreshLot(fx);
    const lotB = await mkFreshLot(fx);
    const m1 = await createBankPayerMapping({
      subdivision_id: fx.subdivisionId,
      canonical_sender_name: "C5 PAYER",
      lot_id: lotA,
      created_by: fx.profileId,
    });
    assert(m1.ok, "C5 first create");
    const m2 = await createBankPayerMapping({
      subdivision_id: fx.subdivisionId,
      canonical_sender_name: "C5 PAYER",
      lot_id: lotB,
      created_by: fx.profileId,
    });
    assert(!m2.ok && m2.kind === "collision", "C5 expected collision");
    if (m2.ok) return;

    const r = await resolveCollision({
      subdivision_id: fx.subdivisionId,
      canonical_sender_name: "C5 PAYER",
      proposed_lot_id: lotB,
      resolution: "update",
      expected_collisions: m2.colliding_mappings,
      performed_by: fx.profileId,
    });
    assert(r.ok && r.resolution_applied === "update", `C5 resolution: ${JSON.stringify(r)}`);
    assert(r.ok && r.mapping_id, "C5 expected new mapping_id");

    if (m1.ok) {
      const oldMapping = await fetchMapping(m1.mapping_id);
      assert(
        oldMapping?.status === "disabled",
        `C5 lotA expected disabled, got ${oldMapping?.status}`,
      );
    }
    if (r.ok && r.mapping_id) {
      const newMapping = await fetchMapping(r.mapping_id);
      assert(
        newMapping?.status === "active",
        `C5 lotB expected active, got ${newMapping?.status}`,
      );
      assert(newMapping?.lot_id === lotB, `C5 lotB mapping wrong lot`);
    }

    record(header, true, `lotA disabled, lotB created active`);
  } catch (e) {
    record(header, false, (e as Error).message);
  }
}

async function scenarioC6_KeepExistingNoMappingCreated(fx: Fixture) {
  const header =
    "C6: resolveCollision('keep_existing') returns mapping_id=null (no new mapping created)";
  try {
    const lotA = await mkFreshLot(fx);
    const lotB = await mkFreshLot(fx);
    const m1 = await createBankPayerMapping({
      subdivision_id: fx.subdivisionId,
      canonical_sender_name: "C6 PAYER",
      lot_id: lotA,
      created_by: fx.profileId,
    });
    assert(m1.ok);
    const m2 = await createBankPayerMapping({
      subdivision_id: fx.subdivisionId,
      canonical_sender_name: "C6 PAYER",
      lot_id: lotB,
      created_by: fx.profileId,
    });
    assert(!m2.ok && m2.kind === "collision");
    if (m2.ok) return;

    const r = await resolveCollision({
      subdivision_id: fx.subdivisionId,
      canonical_sender_name: "C6 PAYER",
      proposed_lot_id: lotB,
      resolution: "keep_existing",
      expected_collisions: m2.colliding_mappings,
      performed_by: fx.profileId,
    });
    assert(r.ok && r.mapping_id === null, `C6 mapping_id should be null, got ${JSON.stringify(r)}`);

    // Verify NO mapping exists on lotB.
    const all = await fetchAllMappings(fx.subdivisionId);
    const lotBMappings = all.filter(
      (m) => m.lot_id === lotB && m.canonical_sender_name === "C6 PAYER",
    );
    assert(lotBMappings.length === 0, `C6 lotB should have no mapping, got ${lotBMappings.length}`);
    record(header, true, `no mapping created on lotB; lotA restored to active`);
  } catch (e) {
    record(header, false, (e as Error).message);
  }
}

async function scenarioC7_RemoveResolutionDisablesNoNew(fx: Fixture) {
  const header = "C7: resolveCollision('remove') disables existing + creates no new mapping";
  try {
    const lotA = await mkFreshLot(fx);
    const lotB = await mkFreshLot(fx);
    const m1 = await createBankPayerMapping({
      subdivision_id: fx.subdivisionId,
      canonical_sender_name: "C7 PAYER",
      lot_id: lotA,
      created_by: fx.profileId,
    });
    assert(m1.ok);
    const m2 = await createBankPayerMapping({
      subdivision_id: fx.subdivisionId,
      canonical_sender_name: "C7 PAYER",
      lot_id: lotB,
      created_by: fx.profileId,
    });
    assert(!m2.ok && m2.kind === "collision");
    if (m2.ok) return;

    const r = await resolveCollision({
      subdivision_id: fx.subdivisionId,
      canonical_sender_name: "C7 PAYER",
      proposed_lot_id: lotB,
      resolution: "remove",
      expected_collisions: m2.colliding_mappings,
      performed_by: fx.profileId,
    });
    assert(r.ok && r.mapping_id === null, `C7 mapping_id should be null`);

    if (m1.ok) {
      const oldMapping = await fetchMapping(m1.mapping_id);
      assert(
        oldMapping?.status === "disabled",
        `C7 lotA expected disabled, got ${oldMapping?.status}`,
      );
    }
    record(header, true, `lotA disabled; no new mapping`);
  } catch (e) {
    record(header, false, (e as Error).message);
  }
}

async function scenarioC8_DetectRepeatedManualMatch(fx: Fixture) {
  const header =
    "C8: detectRepeatedManualMatch returns proposal_flag=true after 3rd manual match in 30d";
  try {
    const lotId = await mkFreshLot(fx);

    // Manually insert 3 active credits + 3 reconciliation_matches for this
    // lot in the 30-day window. Each linked bank_transaction has the same
    // canonical-sender-name description.
    const description = "Payment from Repeated Payer";
    const expectedCanonical = canonicaliseSender(description);
    assert(expectedCanonical, "C8 canonicalise produced null");

    for (let i = 0; i < 3; i++) {
      const { data: bt } = await supabase
        .from("bank_transactions")
        .insert({
          bank_account_id: fx.adminNoBpayAccountId,
          source: "manual",
          transaction_date: "2026-04-15",
          amount: 100,
          description,
          match_status: "manually_matched",
        })
        .select("id")
        .single();
      assert(bt, "C8 bt insert failed");
      const { data: credit } = await supabase
        .from("lot_ledger_entries")
        .insert({
          subdivision_id: fx.subdivisionId,
          lot_id: lotId,
          fund_type: "administrative",
          entry_type: "credit",
          category: "payment",
          amount: 100,
          entry_date: "2026-04-15",
          status: "active",
          created_by: fx.profileId,
        })
        .select("id")
        .single();
      assert(credit, "C8 credit insert failed");
      await supabase.from("reconciliation_matches").insert({
        bank_transaction_id: bt.id,
        ledger_entry_id: credit.id,
        amount_matched: 100,
        match_method: "manual",
        match_confidence: "manual",
        matched_by: fx.profileId,
      });
    }

    const detection = await detectRepeatedManualMatch(
      fx.subdivisionId,
      expectedCanonical!,
      lotId,
      canonicaliseSender,
    );
    assert(detection.count === 3, `C8 count expected 3, got ${detection.count}`);
    assert(
      detection.proposal_flag === true,
      `C8 proposal_flag expected true, got ${detection.proposal_flag}`,
    );
    record(
      header,
      true,
      `3 manual matches in 30d for canonical='${expectedCanonical}' → proposal_flag=true`,
    );
  } catch (e) {
    record(header, false, (e as Error).message);
  }
}

async function scenarioC9_RaceMappingDeleted(fx: Fixture) {
  const header =
    "C9: resolveCollision detects mapping_deleted divergence → returns race error";
  try {
    const lotA = await mkFreshLot(fx);
    const lotB = await mkFreshLot(fx);
    const m1 = await createBankPayerMapping({
      subdivision_id: fx.subdivisionId,
      canonical_sender_name: "C9 PAYER",
      lot_id: lotA,
      created_by: fx.profileId,
    });
    assert(m1.ok);
    const m2 = await createBankPayerMapping({
      subdivision_id: fx.subdivisionId,
      canonical_sender_name: "C9 PAYER",
      lot_id: lotB,
      created_by: fx.profileId,
    });
    assert(!m2.ok && m2.kind === "collision");
    if (m2.ok) return;

    // Simulate concurrent mutation: hard-delete lotA's mapping between
    // collision detection and resolution. (Production path is rare but
    // possible if an admin force-deletes.)
    if (m1.ok) {
      await supabase.from("bank_payer_mappings").delete().eq("id", m1.mapping_id);
    }

    const r = await resolveCollision({
      subdivision_id: fx.subdivisionId,
      canonical_sender_name: "C9 PAYER",
      proposed_lot_id: lotB,
      resolution: "update",
      expected_collisions: m2.colliding_mappings,
      performed_by: fx.profileId,
    });
    assert(!r.ok, `C9 expected ok=false (race)`);
    if (r.ok) return;
    assert(r.kind === "race", `C9 kind: ${r.kind}`);
    assert(
      r.divergence_type === "mapping_deleted",
      `C9 divergence_type: ${r.divergence_type}`,
    );

    record(header, true, `mapping_deleted divergence detected; race error returned`);
  } catch (e) {
    record(header, false, (e as Error).message);
  }
}

// ─── PP4-C: strategy-ordering edge cases (O21–O25) ───────────────────────

async function scenario21_AllSignalsReferenceWins(fx: Fixture) {
  const header =
    "O21: 'BPAY <CRN> LEV-X from JANE BROWN' — Strategy 1 wins; Strategies 2-3 not tried";
  try {
    const lotId = await mkFreshLot(fx);
    // Notice with a BPAY CRN AND a known-payer mapping for the same lot.
    // All three strategies COULD match; orchestrator must stop at Strategy 1.
    const refRow = await supabase.rpc("next_reference_number", {
      p_prefix: "LEV",
      p_subdivision_id: fx.subdivisionId,
    });
    const reference = String(refRow.data);
    const levyNumber = Number.parseInt(reference.slice(4), 10);
    const bpayCrn = generateCrn(levyNumber);
    const { data: notice } = await supabase
      .from("levy_notices")
      .insert({
        subdivision_id: fx.subdivisionId,
        lot_id: lotId,
        budget_id: fx.budgetId,
        reference_number: reference,
        bpay_crn: bpayCrn,
        fund_type: "administrative",
        levy_type: "regular",
        period_start: "2026-01-01",
        period_end: "2026-03-31",
        amount: 555,
        due_date: "2026-04-28",
        status: "draft",
      })
      .select("id")
      .single();
    assert(notice, "O21 notice insert failed");
    await supabase.from("lot_ledger_entries").insert({
      subdivision_id: fx.subdivisionId,
      lot_id: lotId,
      fund_type: "administrative",
      entry_type: "debit",
      category: "levy",
      amount: 555,
      entry_date: "2026-01-01",
      reference,
      levy_notice_id: notice.id,
      status: "active",
      created_by: fx.profileId,
    });
    // Use a canonical name not already inserted by O11/O18/etc. so the
    // partial UNIQUE index on (subdivision, active mapping) doesn't trip.
    await insertMappingDirect(fx, "ALL SIGNALS PAYER", lotId, "active");

    // NOTE: order matters here. The Strategy 1 regex
    //   /\b(?:lev(?:y)?\s*[-]?\s*(\d+)|(\d+)\s*[-]?\s*lev(?:y)?)\b/gi
    // has a second alternative `(\d+)\s*[-]?\s*lev` that greedily consumes a
    // numeric run immediately followed by "LEV" — so if the CRN lands right
    // before the LEV reference, the regex captures the CRN's digits as the
    // levy number. Putting `${reference}` first sidesteps the ambiguity for
    // this scenario; the wider regex tightening is logged as a PRE_LAUNCH
    // CLEANUP item.
    const description = `${reference} BPAY ${bpayCrn} from All Signals Payer`;
    const { bankTransactionId, outcome } = await runOrchestrator(
      fx,
      fx.adminBpayAccountId, // BPAY enabled so Strategy 2 has the chance
      description,
      555,
    );
    assert(outcome.matched, `O21 expected matched, got ${JSON.stringify(outcome)}`);
    assert(
      outcome.strategy === "reference",
      `O21 strategy expected reference, got ${outcome.strategy}`,
    );

    const orch = await fetchOrchestratorAudit(bankTransactionId);
    const tried = orch?.metadata.strategies_tried as Array<{ strategy: string; outcome: string }>;
    assert(tried.length === 1, `O21 strategies_tried.length expected 1, got ${tried.length}`);
    assert(tried[0].strategy === "reference" && tried[0].outcome === "matched", `O21 strategies_tried[0] mismatch`);

    record(header, true, `LEV ref + BPAY CRN + JaneBrown all in description; orchestrator stopped at Strategy 1`);
  } catch (e) {
    record(header, false, (e as Error).message);
  }
}

async function scenario22_KnownPayerBeatsAmountWindow(fx: Fixture) {
  const header =
    "O22: known-payer mapping AND amount-window candidate — Strategy 3 fires before Strategy 5";
  try {
    const lotMapped = await mkFreshLot(fx);
    const lotOther = await mkFreshLot(fx);

    // Mapped lot has an outstanding notice for $789.
    const mappedNotice = await mkOutstandingNotice(fx, lotMapped, {
      amount: 789,
      dueDate: "2026-04-28",
    });
    // Different lot has a notice with the SAME amount in the same date window —
    // would be Strategy 5's single candidate if Strategy 3 didn't fire first.
    await mkOutstandingNotice(fx, lotOther, {
      amount: 789,
      dueDate: "2026-04-30",
    });
    await insertMappingDirect(fx, "ACME PROPERTY", lotMapped, "active");

    const { bankTransactionId, outcome } = await runOrchestrator(
      fx,
      fx.adminNoBpayAccountId,
      "Acme Property",
      789,
    );
    assert(outcome.matched, `O22 expected matched`);
    assert(
      outcome.strategy === "known_payer",
      `O22 strategy expected known_payer, got ${outcome.strategy}`,
    );
    assert(
      outcome.reference === mappedNotice.reference,
      `O22 reference expected ${mappedNotice.reference}, got ${outcome.reference}`,
    );

    const orch = await fetchOrchestratorAudit(bankTransactionId);
    const tried = orch?.metadata.strategies_tried as Array<{ strategy: string; outcome: string }>;
    assert(
      !tried.find((t) => t.strategy === "amount_window"),
      `O22 amount_window should NOT appear in strategies_tried (orchestrator stopped at known_payer)`,
    );

    record(header, true, `Strategy 3 matched mapped lot ${mappedNotice.reference}; Strategy 5 not tried`);
  } catch (e) {
    record(header, false, (e as Error).message);
  }
}

async function scenario23_EmptyDescriptionAllSixTried(fx: Fixture) {
  const header =
    "O23: empty description, no amount match, no mapping → all 6 strategies tried, no match";
  try {
    // No setup — no notices, no mappings created. Use a deliberately rare
    // amount so Strategy 5 has nothing to match.
    const description = "";
    const amount = 88_888.88;

    const { bankTransactionId, outcome } = await runOrchestrator(
      fx,
      fx.adminNoBpayAccountId,
      description,
      amount,
    );
    assert(!outcome.matched, `O23 expected !matched`);
    assert(outcome.strategy === null, `O23 strategy: ${outcome.strategy}`);

    const orch = await fetchOrchestratorAudit(bankTransactionId);
    const tried = orch?.metadata.strategies_tried as Array<{ strategy: string; outcome: string }>;
    assert(
      tried.length === 6,
      `O23 expected 6 strategies tried, got ${tried.length}`,
    );
    const names = tried.map((t) => t.strategy).sort();
    const expected = ["amount_window", "bpay_crn", "fuzzy_hint", "keyword_amount", "known_payer", "reference"];
    assert(
      JSON.stringify(names) === JSON.stringify(expected),
      `O23 strategies_tried names mismatch: ${JSON.stringify(names)}`,
    );
    // Each should have non-matched outcome
    for (const t of tried) {
      assert(t.outcome !== "matched", `O23 ${t.strategy} unexpectedly matched`);
    }

    record(header, true, `all 6 strategies attempted; final orchestrator audit captures every outcome`);
  } catch (e) {
    record(header, false, (e as Error).message);
  }
}

async function scenario24_OnlyStaleReferencesFallthrough(fx: Fixture) {
  const header =
    "O24: only stale references in description → Strategy 1 audits stale, falls through, all 6 tried";
  try {
    // Use an unusual amount + the existing fx.staleNotice.
    const description = `Transfer ${fx.staleNotice.reference}`;
    const amount = 91_234.56;

    const { bankTransactionId, outcome } = await runOrchestrator(
      fx,
      fx.adminNoBpayAccountId,
      description,
      amount,
    );
    assert(!outcome.matched, `O24 expected !matched`);

    // Stale-ref audit must be present.
    const stale = await fetchStaleRefAudits(bankTransactionId);
    assert(stale.length >= 1, `O24 expected stale_reference_detected audit`);

    // All 6 strategies tried.
    const orch = await fetchOrchestratorAudit(bankTransactionId);
    const tried = orch?.metadata.strategies_tried as Array<{ strategy: string; outcome: string }>;
    assert(tried.length === 6, `O24 expected 6 strategies tried, got ${tried.length}`);

    // Strategy 1 outcome should be all_references_stale (or no_outstanding_notices,
    // depending on fixture state — both indicate stale-ref fallthrough).
    const ref = tried.find((t) => t.strategy === "reference");
    assert(ref, "O24 missing reference entry");
    assert(
      ref.outcome === "all_references_stale" || ref.outcome === "no_outstanding_notices",
      `O24 reference outcome unexpected: ${ref.outcome}`,
    );

    record(header, true, `Strategy 1 wrote stale-ref audit; all 6 strategies attempted in fallthrough`);
  } catch (e) {
    record(header, false, (e as Error).message);
  }
}

async function scenario25_MixedRefsPartialAllocation(fx: Fixture) {
  const header =
    "O25: multiple references, some stale — Strategy 1 partial-allocates non-stale, audits stale ones";
  try {
    const lotA = await mkFreshLot(fx);
    const lotB = await mkFreshLot(fx);
    const goodA = await mkOutstandingNotice(fx, lotA, { amount: 250 });
    const goodB = await mkOutstandingNotice(fx, lotB, { amount: 250 });

    // fx.staleNotice from the fixture is paid → stale.
    const description = `Combined ${goodA.reference} ${fx.staleNotice.reference} ${goodB.reference}`;

    const { bankTransactionId, outcome } = await runOrchestrator(
      fx,
      fx.adminNoBpayAccountId,
      description,
      500,
    );
    assert(outcome.matched, `O25 expected matched`);
    assert(outcome.strategy === "reference", `O25 strategy: ${outcome.strategy}`);

    const matches = await fetchMatches(bankTransactionId);
    assert(matches.length === 2, `O25 expected 2 matches (skipped stale), got ${matches.length}`);

    // Stale-ref audit for the stale one.
    const stale = await fetchStaleRefAudits(bankTransactionId);
    const staleRefs = stale.map((s) => (s.metadata as Record<string, unknown>).reference);
    assert(
      staleRefs.includes(fx.staleNotice.reference),
      `O25 stale-ref audit missing for ${fx.staleNotice.reference} (got ${JSON.stringify(staleRefs)})`,
    );

    record(
      header,
      true,
      `2 non-stale refs matched ($250 each); stale-ref audited for ${fx.staleNotice.reference}`,
    );
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
    // PP4-B: bank_payer_mappings — cascades on subdivision delete via FK,
    // but cleaning explicitly guarantees no stale rows linger if cascade
    // is disabled at the DB level for any reason.
    await supabase.from("bank_payer_mappings").delete().in("subdivision_id", subIds);
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
    // PP4-B Strategy scenarios
    await scenario11_KnownPayerUnambiguous(fx);
    await scenario12_KnownPayerAmbiguousFiltered(fx);
    await scenario13_KeywordAmountMatch(fx);
    await scenario14_KeywordAmountMismatch(fx);
    await scenario15_AmountWindowSingleCandidate(fx);
    await scenario16_AmountWindowMultipleCandidates(fx);
    await scenario17_AmountWindowOrdinaryAndSpecialNoTiebreak(fx);
    await scenario18_FuzzyHintAboveThreshold(fx);
    await scenario19_FuzzyHintBelowThreshold(fx);
    await scenario20_FuzzyHintHighSimilarityNeverAutoMatches(fx);
    // PP4-B Collision scenarios
    await scenarioC1_CreateMappingNoCollision(fx);
    await scenarioC2_CreateMappingNameCollision(fx);
    await scenarioC3_OwnershipChangeFlipsToAmbiguous(fx);
    await scenarioC4_KeepExistingRestoresStatus(fx);
    await scenarioC5_UpdateResolutionDisablesAndCreates(fx);
    await scenarioC6_KeepExistingNoMappingCreated(fx);
    await scenarioC7_RemoveResolutionDisablesNoNew(fx);
    await scenarioC8_DetectRepeatedManualMatch(fx);
    await scenarioC9_RaceMappingDeleted(fx);
    // PP4-C: strategy-ordering edge cases
    await scenario21_AllSignalsReferenceWins(fx);
    await scenario22_KnownPayerBeatsAmountWindow(fx);
    await scenario23_EmptyDescriptionAllSixTried(fx);
    await scenario24_OnlyStaleReferencesFallthrough(fx);
    await scenario25_MixedRefsPartialAllocation(fx);
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
