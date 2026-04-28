/**
 * Reconciliation verification script (Prompt 2).
 *
 * Exercises the 12 scenarios required by Prompt 2 §9 end-to-end against the
 * live Supabase dev database. Unlike the Prompt 1 script (which called RPCs
 * directly), this script calls SERVER ACTIONS so Zod coercion, field
 * mapping, and auth-guard bugs are caught in the same motion as RPC bugs.
 *
 * Usage:
 *   npx tsx src/lib/actions/reconciliation.verification.ts             # run scenarios + cleanup
 *   npx tsx src/lib/actions/reconciliation.verification.ts --no-cleanup # leave test data
 *   npx tsx src/lib/actions/reconciliation.verification.ts --cleanup   # clean stale runs and exit
 *
 * Test data is tagged with VERIFY_MARKER in management_companies.name /
 * profiles.email / profiles.clerk_id so --cleanup never touches real data.
 */

import { config } from "dotenv";
config({ path: ".env.local" });

// ─── next/cache stub (Variant A) ───────────────────────────────
// Pre-populate Node's CommonJS require cache with a no-op stub for `next/cache`
// BEFORE any server-action module is imported. Server actions end with a call
// to revalidatePath() which throws "Invariant: static generation store missing"
// outside a Next.js request scope. The stub intercepts that call.
//
// A fast-fail assertion further down confirms the stub actually intercepted
// before we run any scenarios. If it didn't, we stop and escalate rather than
// let scenarios fail opaquely.
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
import { generateCrn } from "@/lib/reconciliation/bpay-crn";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const VERIFY_MARKER = "__VERIFY_RECON__";
const VERIFY_CLERK_ID = `${VERIFY_MARKER}_CLERK_${Date.now()}_${randomUUID().slice(0, 8)}`;

// Install the userId resolver BEFORE dynamic-importing server actions. Server
// actions call getCurrentProfile(), which reads `_verificationUserIdResolver`
// each call — so the ordering contract is: set resolver → import actions →
// invoke actions. If we imported actions first, their code would still be
// fine (the resolver is read lazily at call time), but keeping the order
// explicit makes the intent legible and lets us assert below.
__setUserIdResolverForVerification(async () => VERIFY_CLERK_ID);
if (__getUserIdResolverForVerification() === null) {
  console.error("Fatal: verification userId resolver is null immediately after being set.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

// Dynamic imports so the resolver is guaranteed live before any module-level
// side-effect in the action modules runs.
type ReconActions = typeof import("./reconciliation");
type BankActions = typeof import("./bank-transactions");
let recon: ReconActions;
let bank: BankActions;

type Result = { scenario: string; passed: boolean; detail: string };
const results: Result[] = [];

function record(scenario: string, passed: boolean, detail: string) {
  results.push({ scenario, passed, detail });
  console.log(`  ${passed ? "PASS" : "FAIL"}  ${scenario}${detail ? " — " + detail : ""}`);
}

function assert(cond: unknown, msg: string = "assertion failed"): asserts cond {
  if (!cond) throw new Error(msg);
}

function approx(a: number, b: number, tol = 0.001): boolean {
  return Math.abs(a - b) <= tol;
}

// ───────── Fixture ─────────

interface Fixture {
  runId: string;
  companyId: string;
  subdivisionId: string;
  budgetId: string;
  profileId: string;
  clerkId: string;
  adminAccountId: string;
  capitalAccountId: string;
  lotIds: string[];
  noticeByLot: Record<string, { id: string; reference: string; amount: number }>;
}

async function createFixture(): Promise<Fixture> {
  const runId = `${Date.now()}_${randomUUID().slice(0, 8)}`;
  const companyName = `${VERIFY_MARKER}${runId}`;
  const profileEmail = `${VERIFY_MARKER.toLowerCase()}${runId}@recon.test`;

  console.log(`\nCreating fixture (runId=${runId})`);

  const { data: company, error: companyErr } = await supabase
    .from("management_companies")
    .insert({ name: companyName })
    .select("id")
    .single();
  if (companyErr || !company) throw new Error(`Fixture: company insert failed: ${companyErr?.message}`);

  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .insert({
      clerk_id: VERIFY_CLERK_ID,
      email: profileEmail,
      first_name: "Recon",
      last_name: "Verify",
      role: "strata_manager",
      company_role: "admin",
      management_company_id: company.id,
    })
    .select("id")
    .single();
  if (profileErr || !profile) throw new Error(`Fixture: profile insert failed: ${profileErr?.message}`);

  const { data: subdivision, error: subErr } = await supabase
    .from("subdivisions")
    .insert({
      management_company_id: company.id,
      name: companyName,
      plan_number: `PLAN-${runId}`,
      address: "1 Recon Verify St, Melbourne VIC 3000",
      total_lots: 3,
      created_by: profile.id,
    })
    .select("id")
    .single();
  if (subErr || !subdivision) throw new Error(`Fixture: subdivision: ${subErr?.message}`);

  const { data: budget, error: budgetErr } = await supabase
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
  if (budgetErr || !budget) throw new Error(`Fixture: budget: ${budgetErr?.message}`);

  const lotRows = [1, 2, 3].map((n) => ({
    subdivision_id: subdivision.id,
    lot_number: n,
    lot_entitlement: 100,
    lot_liability: 100,
  }));
  const { data: lots, error: lotsErr } = await supabase
    .from("lots")
    .insert(lotRows)
    .select("id, lot_number")
    .order("lot_number", { ascending: true });
  if (lotsErr || !lots || lots.length !== 3) throw new Error(`Fixture: lots: ${lotsErr?.message}`);
  const lotIds = lots.map((l) => l.id);

  const { data: adminAcct, error: adminErr } = await supabase
    .from("bank_accounts")
    .insert({
      subdivision_id: subdivision.id,
      account_name: "Admin Account",
      bsb: "083-001",
      account_number: "12345678",
      fund_type: "administrative",
      bank_name: "Test Bank",
      opening_balance: 0,
    })
    .select("id")
    .single();
  if (adminErr || !adminAcct) throw new Error(`Fixture: admin account: ${adminErr?.message}`);

  const { data: capitalAcct, error: capErr } = await supabase
    .from("bank_accounts")
    .insert({
      subdivision_id: subdivision.id,
      account_name: "Capital Account",
      bsb: "083-001",
      account_number: "87654321",
      fund_type: "capital_works",
      bank_name: "Test Bank",
      opening_balance: 0,
    })
    .select("id")
    .single();
  if (capErr || !capitalAcct) throw new Error(`Fixture: capital account: ${capErr?.message}`);

  // Create one levy batch with 3 notices (one per lot), one ledger debit each.
  const LEVY_AMOUNT = 500;
  const { data: batch, error: batchErr } = await supabase
    .from("levy_batches")
    .insert({
      subdivision_id: subdivision.id,
      budget_id: budget.id,
      financial_year: "2026-2027",
      fund_type: "administrative",
      period_start: "2026-07-01",
      period_end: "2026-09-30",
      period_label: "Q1 verify",
      due_date: "2026-07-28",
      total_amount: LEVY_AMOUNT * lotIds.length,
      levy_count: lotIds.length,
      status: "draft",
      generated_by: profile.id,
    })
    .select("id")
    .single();
  if (batchErr || !batch) throw new Error(`Fixture: batch: ${batchErr?.message}`);

  const noticeByLot: Record<string, { id: string; reference: string; amount: number }> = {};
  for (const lotId of lotIds) {
    const { data: ref } = await supabase.rpc("next_reference_number", {
      p_prefix: "LEV",
      p_subdivision_id: subdivision.id,
    });
    if (!ref) throw new Error("next_reference_number returned null");
    const { data: notice, error: nErr } = await supabase
      .from("levy_notices")
      .insert({
        subdivision_id: subdivision.id,
        lot_id: lotId,
        budget_id: budget.id,
        batch_id: batch.id,
        reference_number: ref as string,
        fund_type: "administrative",
        levy_type: "regular",
        period_start: "2026-07-01",
        period_end: "2026-09-30",
        amount: LEVY_AMOUNT,
        due_date: "2026-07-28",
        status: "draft",
      })
      .select("id")
      .single();
    if (nErr || !notice) throw new Error(`Fixture: notice: ${nErr?.message}`);
    noticeByLot[lotId] = { id: notice.id, reference: ref as string, amount: LEVY_AMOUNT };
  }

  const { error: batchRpcErr } = await supabase.rpc("rpc_levy_batch_debit", {
    p_batch_id: batch.id,
    p_created_by: profile.id,
  });
  if (batchRpcErr) throw new Error(`Fixture: rpc_levy_batch_debit: ${batchRpcErr.message}`);

  return {
    runId,
    companyId: company.id,
    subdivisionId: subdivision.id,
    budgetId: budget.id,
    profileId: profile.id,
    clerkId: VERIFY_CLERK_ID,
    adminAccountId: adminAcct.id,
    capitalAccountId: capitalAcct.id,
    lotIds,
    noticeByLot,
  };
}

// ───────── Helpers ─────────

async function fetchBt(id: string) {
  const { data } = await supabase
    .from("bank_transactions")
    .select(
      "id, bank_account_id, amount, matched_total, match_status, is_voided, voided_at, excluded_reason, notes, description",
    )
    .eq("id", id)
    .single();
  return data;
}

async function fetchLotState(lotId: string) {
  const { data } = await supabase
    .from("lot_ledger_state")
    .select("*")
    .eq("lot_id", lotId)
    .single();
  return data;
}

async function fetchMatches(bankTxnId: string) {
  const { data } = await supabase
    .from("reconciliation_matches")
    .select("*")
    .eq("bank_transaction_id", bankTxnId);
  return data ?? [];
}

async function fetchUndeposited(id: string) {
  const { data } = await supabase
    .from("undeposited_funds_entries")
    .select("*")
    .eq("id", id)
    .single();
  return data;
}

async function fetchLedgerEntry(id: string) {
  const { data } = await supabase
    .from("lot_ledger_entries")
    .select("*")
    .eq("id", id)
    .single();
  return data;
}

async function fetchVoidOffsets(lotId: string, sinceIso: string) {
  const { data } = await supabase
    .from("lot_ledger_entries")
    .select("id")
    .eq("lot_id", lotId)
    .eq("category", "void_offset")
    .gte("created_at", sinceIso);
  return data ?? [];
}

// ───────── Scenarios ─────────

async function scenarioR1_ManualNoAutoMatch(fx: Fixture) {
  const header = "R1: manual bank transaction, no reference → stays unmatched";
  try {
    const res = await recon.addManualBankTransaction({
      subdivision_id: fx.subdivisionId,
      bank_account_id: fx.adminAccountId,
      transaction_date: "2026-08-01",
      amount: 100,
      direction: "credit",
      description: "No reference here",
    });
    assert(res.success, `server action returned error: ${res.error}`);
    const bt = await fetchBt(res.success!.bankTransactionId);
    assert(bt, "bank transaction row missing");
    assert(bt!.match_status === "unmatched", `match_status expected unmatched, got ${bt!.match_status}`);
    assert(Number(bt!.matched_total) === 0, `matched_total expected 0, got ${bt!.matched_total}`);
    assert(!res.success!.autoMatched, "autoMatched flag should be false");
    record(header, true, `bt=${res.success!.bankTransactionId.slice(0, 8)} status=unmatched matched_total=0`);
  } catch (e) {
    record(header, false, (e as Error).message);
  }
}

async function scenarioR2_ReferenceExactAutoMatch(fx: Fixture) {
  const header = "R2: manual txn with LEV reference + exact amount → auto-matched";
  try {
    const lotId = fx.lotIds[0];
    const notice = fx.noticeByLot[lotId];
    const stateBefore = await fetchLotState(lotId);
    const balanceBefore = Number(stateBefore?.admin_balance ?? 0);

    const res = await recon.addManualBankTransaction({
      subdivision_id: fx.subdivisionId,
      bank_account_id: fx.adminAccountId,
      transaction_date: "2026-08-02",
      amount: notice.amount,
      direction: "credit",
      description: `Payment ${notice.reference}`,
    });
    assert(res.success, `server action error: ${res.error}`);
    assert(res.success!.autoMatched, "autoMatched flag should be true");

    const bt = await fetchBt(res.success!.bankTransactionId);
    assert(bt!.match_status === "auto_matched", `status expected auto_matched, got ${bt!.match_status}`);
    assert(approx(Number(bt!.matched_total), notice.amount), `matched_total expected ${notice.amount}, got ${bt!.matched_total}`);

    const matches = await fetchMatches(bt!.id);
    assert(matches.length === 1, `expected 1 match, got ${matches.length}`);
    assert(matches[0].match_method === "auto_reference", `match_method expected auto_reference, got ${matches[0].match_method}`);

    const stateAfter = await fetchLotState(lotId);
    const balanceAfter = Number(stateAfter?.admin_balance ?? 0);
    const delta = balanceAfter - balanceBefore;
    assert(approx(delta, notice.amount), `lot balance delta expected +${notice.amount}, got ${delta}`);
    record(header, true, `delta=+${notice.amount} (${balanceBefore}→${balanceAfter}), 1 credit, 1 match`);
  } catch (e) {
    record(header, false, (e as Error).message);
  }
}

async function scenarioR3_ReferencePartialAutoMatch(fx: Fixture) {
  const header = "R3: manual txn with reference but amount > outstanding → partial match, stays unmatched";
  try {
    const lotId = fx.lotIds[1];
    const notice = fx.noticeByLot[lotId];
    const overshoot = 200;
    const sent = notice.amount + overshoot;

    const res = await recon.addManualBankTransaction({
      subdivision_id: fx.subdivisionId,
      bank_account_id: fx.adminAccountId,
      transaction_date: "2026-08-03",
      amount: sent,
      direction: "credit",
      description: `Overpayment ${notice.reference}`,
    });
    assert(res.success, `server action error: ${res.error}`);

    const bt = await fetchBt(res.success!.bankTransactionId);
    assert(
      approx(Number(bt!.matched_total), notice.amount),
      `matched_total expected ${notice.amount}, got ${bt!.matched_total}`,
    );
    assert(bt!.match_status === "unmatched", `expected unmatched (partial), got ${bt!.match_status}`);
    assert(
      (bt!.notes ?? "").includes("remaining"),
      `expected partial-flag in notes, got: ${bt!.notes ?? "(null)"}`,
    );
    record(
      header,
      true,
      `matched=${notice.amount}/${sent}, status=unmatched, notes flag present`,
    );
  } catch (e) {
    record(header, false, (e as Error).message);
  }
}

async function scenarioR4_ManualMatchTwoLots(fx: Fixture): Promise<{ bankTxnId: string; allocA: number; allocB: number; lotA: string; lotB: string; lotABefore: number; lotBBefore: number }> {
  const header = "R4: manual match across two lots → 2 credits, 2 matches, manually_matched";
  const lotA = fx.lotIds[2];
  const lotB = fx.lotIds[0];
  const allocA = 500;
  const allocB = 300;
  const total = allocA + allocB;

  try {
    const stateABefore = await fetchLotState(lotA);
    const stateBBefore = await fetchLotState(lotB);
    const lotABefore = Number(stateABefore?.admin_balance ?? 0);
    const lotBBefore = Number(stateBBefore?.admin_balance ?? 0);

    const addRes = await recon.addManualBankTransaction({
      subdivision_id: fx.subdivisionId,
      bank_account_id: fx.adminAccountId,
      transaction_date: "2026-08-04",
      amount: total,
      direction: "credit",
      description: "Multi-lot batch payment",
    });
    assert(addRes.success, `add error: ${addRes.error}`);
    const bankTxnId = addRes.success!.bankTransactionId;

    const matchRes = await recon.reconcileTransaction({
      subdivision_id: fx.subdivisionId,
      bank_transaction_id: bankTxnId,
      allocations: [
        { lot_id: lotA, fund_type: "administrative", amount: allocA },
        { lot_id: lotB, fund_type: "administrative", amount: allocB },
      ],
      match_method: "manual",
      match_confidence: "manual",
    });
    assert(matchRes.success, `match error: ${matchRes.error}`);

    const bt = await fetchBt(bankTxnId);
    assert(bt!.match_status === "manually_matched", `status expected manually_matched, got ${bt!.match_status}`);
    assert(approx(Number(bt!.matched_total), total), `matched_total expected ${total}, got ${bt!.matched_total}`);

    const matches = await fetchMatches(bankTxnId);
    assert(matches.length === 2, `expected 2 matches, got ${matches.length}`);

    const stateAAfter = await fetchLotState(lotA);
    const stateBAfter = await fetchLotState(lotB);
    const lotADelta = Number(stateAAfter?.admin_balance ?? 0) - lotABefore;
    const lotBDelta = Number(stateBAfter?.admin_balance ?? 0) - lotBBefore;
    assert(approx(lotADelta, allocA), `lotA delta expected +${allocA}, got ${lotADelta}`);
    assert(approx(lotBDelta, allocB), `lotB delta expected +${allocB}, got ${lotBDelta}`);
    record(header, true, `bt=${bankTxnId.slice(0, 8)}, lotA+${allocA}, lotB+${allocB}, status=manually_matched`);

    return { bankTxnId, allocA, allocB, lotA, lotB, lotABefore, lotBBefore };
  } catch (e) {
    record(header, false, (e as Error).message);
    throw e;
  }
}

async function scenarioR5_UnmatchRestoresState(
  fx: Fixture,
  s4: { bankTxnId: string; allocA: number; allocB: number; lotA: string; lotB: string; lotABefore: number; lotBBefore: number },
) {
  const header = "R5: unmatch restores state — void_offsets created, balances back to pre-match";
  try {
    const sinceIso = new Date().toISOString();
    const res = await recon.unmatchTransaction({
      subdivision_id: fx.subdivisionId,
      bank_transaction_id: s4.bankTxnId,
      match_ids: null,
      reason: "R5 verification unmatch",
    });
    assert(res.success, `unmatch error: ${res.error}`);
    assert(res.success!.deletedMatchIds.length === 2, `expected 2 matches deleted, got ${res.success!.deletedMatchIds.length}`);
    assert(res.success!.voidedCreditIds.length === 2, `expected 2 credits voided, got ${res.success!.voidedCreditIds.length}`);

    const bt = await fetchBt(s4.bankTxnId);
    assert(bt!.match_status === "unmatched", `status expected unmatched, got ${bt!.match_status}`);
    assert(Number(bt!.matched_total) === 0, `matched_total expected 0, got ${bt!.matched_total}`);

    // Two void_offset entries exist since sinceIso for lotA and lotB combined.
    const offsetsA = await fetchVoidOffsets(s4.lotA, sinceIso);
    const offsetsB = await fetchVoidOffsets(s4.lotB, sinceIso);
    assert(offsetsA.length >= 1, `lotA expected ≥1 void_offset, got ${offsetsA.length}`);
    assert(offsetsB.length >= 1, `lotB expected ≥1 void_offset, got ${offsetsB.length}`);

    const stateA = await fetchLotState(s4.lotA);
    const stateB = await fetchLotState(s4.lotB);
    const lotANow = Number(stateA?.admin_balance ?? 0);
    const lotBNow = Number(stateB?.admin_balance ?? 0);
    assert(approx(lotANow, s4.lotABefore), `lotA expected back to ${s4.lotABefore}, got ${lotANow}`);
    assert(approx(lotBNow, s4.lotBBefore), `lotB expected back to ${s4.lotBBefore}, got ${lotBNow}`);
    record(header, true, `2 offsets, 2 credits voided, balances restored to (${s4.lotABefore}, ${s4.lotBBefore})`);
  } catch (e) {
    record(header, false, (e as Error).message);
  }
}

async function scenarioR6_CashReceiptDeposit(fx: Fixture) {
  const header = "R6: cash receipt → deposit flow — single credit, no double-count on deposit";
  const AMOUNT = 200;
  try {
    const lotId = fx.lotIds[0];
    const stateBefore = await fetchLotState(lotId);
    const balBefore = Number(stateBefore?.admin_balance ?? 0);

    const receiptRes = await recon.recordCashReceipt({
      subdivision_id: fx.subdivisionId,
      lot_id: lotId,
      bank_account_id: fx.adminAccountId,
      fund_type: "administrative",
      amount: AMOUNT,
      received_date: "2026-08-05",
      payment_method: "cash",
      description: "R6 cash receipt",
    });
    assert(receiptRes.success, `recordCashReceipt error: ${receiptRes.error}`);
    const receipt = await fetchUndeposited(receiptRes.success!.receiptId);
    assert(receipt!.status === "pending_deposit", `receipt status expected pending_deposit, got ${receipt!.status}`);
    assert(receipt!.receipt_number.startsWith("RCP-"), `receipt_number format: ${receipt!.receipt_number}`);

    const stateAfterReceipt = await fetchLotState(lotId);
    const balAfterReceipt = Number(stateAfterReceipt?.admin_balance ?? 0);
    assert(approx(balAfterReceipt - balBefore, AMOUNT), `receipt delta expected +${AMOUNT}, got ${balAfterReceipt - balBefore}`);

    // Deposit the bank transaction.
    const depositTxn = await recon.addManualBankTransaction({
      subdivision_id: fx.subdivisionId,
      bank_account_id: fx.adminAccountId,
      transaction_date: "2026-08-06",
      amount: AMOUNT,
      direction: "credit",
      description: "Deposit of daily takings",
    });
    assert(depositTxn.success, `deposit txn add: ${depositTxn.error}`);
    assert(!depositTxn.success!.autoMatched, "deposit txn should not auto-match (no reference)");

    const clearRes = await recon.depositUndepositedFunds({
      subdivision_id: fx.subdivisionId,
      bank_transaction_id: depositTxn.success!.bankTransactionId,
      undeposited_entry_ids: [receiptRes.success!.receiptId],
    });
    assert(clearRes.success, `deposit clear error: ${clearRes.error}`);
    assert(
      clearRes.success!.clearedReceiptNumbers.includes(receipt!.receipt_number),
      `cleared list missing receipt: ${clearRes.success!.clearedReceiptNumbers.join(",")}`,
    );

    const depositBt = await fetchBt(depositTxn.success!.bankTransactionId);
    assert(depositBt!.match_status === "auto_matched", `deposit bt status expected auto_matched, got ${depositBt!.match_status}`);

    const receiptAfter = await fetchUndeposited(receiptRes.success!.receiptId);
    assert(receiptAfter!.status === "deposited", `receipt status expected deposited, got ${receiptAfter!.status}`);

    const matches = await fetchMatches(depositTxn.success!.bankTransactionId);
    assert(matches.length === 1, `expected 1 match, got ${matches.length}`);
    assert(matches[0].match_confidence === "system_created", `confidence expected system_created, got ${matches[0].match_confidence}`);

    const stateAfterDeposit = await fetchLotState(lotId);
    const balAfterDeposit = Number(stateAfterDeposit?.admin_balance ?? 0);
    assert(
      approx(balAfterDeposit, balAfterReceipt),
      `balance unchanged after deposit expected ${balAfterReceipt}, got ${balAfterDeposit} (NO DOUBLE-COUNT)`,
    );
    // Assert RCP reference format so the output signal is greppable.
    const RCP_FMT = /^RCP-\d+$/;
    assert(
      RCP_FMT.test(receipt!.receipt_number),
      `receipt_number does not match RCP-{n}: ${receipt!.receipt_number}`,
    );
    record(
      header,
      true,
      `receipt_number=${receipt!.receipt_number} (format OK); receipt→credit=+${AMOUNT}; deposit→match only, balance held at ${balAfterReceipt}`,
    );
  } catch (e) {
    record(header, false, (e as Error).message);
  }
}

async function scenarioR7_DepositSumMismatchRejected(fx: Fixture) {
  const header = "R7: deposit with sum mismatch rejected, nothing changes";
  try {
    const lotId = fx.lotIds[1];
    const r1 = await recon.recordCashReceipt({
      subdivision_id: fx.subdivisionId,
      lot_id: lotId,
      bank_account_id: fx.adminAccountId,
      fund_type: "administrative",
      amount: 100,
      received_date: "2026-08-07",
      payment_method: "cash",
    });
    assert(r1.success, `r1: ${r1.error}`);
    const r2 = await recon.recordCashReceipt({
      subdivision_id: fx.subdivisionId,
      lot_id: lotId,
      bank_account_id: fx.adminAccountId,
      fund_type: "administrative",
      amount: 150,
      received_date: "2026-08-07",
      payment_method: "cash",
    });
    assert(r2.success, `r2: ${r2.error}`);

    const depositTxn = await recon.addManualBankTransaction({
      subdivision_id: fx.subdivisionId,
      bank_account_id: fx.adminAccountId,
      transaction_date: "2026-08-08",
      amount: 200,
      direction: "credit",
      description: "Wrong-sum deposit",
    });
    assert(depositTxn.success, `deposit: ${depositTxn.error}`);

    const depositRes = await recon.depositUndepositedFunds({
      subdivision_id: fx.subdivisionId,
      bank_transaction_id: depositTxn.success!.bankTransactionId,
      undeposited_entry_ids: [r1.success!.receiptId, r2.success!.receiptId],
    });
    assert(!depositRes.success && depositRes.error, `expected rejection, got ${JSON.stringify(depositRes)}`);
    assert(/sum/i.test(depositRes.error!), `error should mention sum mismatch, got: ${depositRes.error}`);

    // Nothing should have changed.
    const bt = await fetchBt(depositTxn.success!.bankTransactionId);
    assert(bt!.match_status === "unmatched", `bt status should remain unmatched, got ${bt!.match_status}`);
    assert(Number(bt!.matched_total) === 0, `matched_total should remain 0, got ${bt!.matched_total}`);
    const r1After = await fetchUndeposited(r1.success!.receiptId);
    const r2After = await fetchUndeposited(r2.success!.receiptId);
    assert(r1After!.status === "pending_deposit", `r1 status should remain pending_deposit`);
    assert(r2After!.status === "pending_deposit", `r2 status should remain pending_deposit`);
    record(header, true, `rejected with sum-mismatch error; bt, r1, r2 all unchanged`);
  } catch (e) {
    record(header, false, (e as Error).message);
  }
}

async function scenarioR8_ExcludeUnexclude(fx: Fixture) {
  const header = "R8: exclude / unexclude round-trip";
  try {
    const feeTxn = await recon.addManualBankTransaction({
      subdivision_id: fx.subdivisionId,
      bank_account_id: fx.adminAccountId,
      transaction_date: "2026-08-09",
      amount: 50,
      direction: "debit",
      description: "Monthly account keeping fee",
    });
    assert(feeTxn.success, `add: ${feeTxn.error}`);
    const bankTxnId = feeTxn.success!.bankTransactionId;

    const exRes = await recon.excludeTransaction({
      subdivision_id: fx.subdivisionId,
      bank_transaction_id: bankTxnId,
      reason: "Bank fee — not a lot payment",
    });
    assert(exRes.success, `exclude: ${exRes.error}`);
    const btEx = await fetchBt(bankTxnId);
    assert(btEx!.match_status === "excluded", `expected excluded, got ${btEx!.match_status}`);
    assert(btEx!.excluded_reason === "Bank fee — not a lot payment", `excluded_reason mismatch: ${btEx!.excluded_reason}`);

    const unexRes = await recon.unexcludeTransaction({
      subdivision_id: fx.subdivisionId,
      bank_transaction_id: bankTxnId,
    });
    assert(unexRes.success, `unexclude: ${unexRes.error}`);
    const btUnex = await fetchBt(bankTxnId);
    assert(btUnex!.match_status === "unmatched", `expected unmatched, got ${btUnex!.match_status}`);
    assert(btUnex!.excluded_reason === null, `excluded_reason should be null, got ${btUnex!.excluded_reason}`);
    record(header, true, `excluded→unmatched round-trip clean`);
  } catch (e) {
    record(header, false, (e as Error).message);
  }
}

async function scenarioR9_VoidBankCascadesUnmatch(fx: Fixture) {
  const header = "R9: void bank transaction cascades unmatch";
  try {
    const lotId = fx.lotIds[2];
    const stateBefore = await fetchLotState(lotId);
    const balBefore = Number(stateBefore?.admin_balance ?? 0);

    // Build a manual match.
    const addRes = await recon.addManualBankTransaction({
      subdivision_id: fx.subdivisionId,
      bank_account_id: fx.adminAccountId,
      transaction_date: "2026-08-10",
      amount: 100,
      direction: "credit",
      description: "R9 payment",
    });
    assert(addRes.success);
    const bankTxnId = addRes.success!.bankTransactionId;
    const matchRes = await recon.reconcileTransaction({
      subdivision_id: fx.subdivisionId,
      bank_transaction_id: bankTxnId,
      allocations: [{ lot_id: lotId, fund_type: "administrative", amount: 100 }],
      match_method: "manual",
      match_confidence: "manual",
    });
    assert(matchRes.success, `match: ${matchRes.error}`);

    const stateAfterMatch = await fetchLotState(lotId);
    const balAfterMatch = Number(stateAfterMatch?.admin_balance ?? 0);
    assert(approx(balAfterMatch - balBefore, 100), `post-match delta expected +100, got ${balAfterMatch - balBefore}`);

    const voidRes = await recon.voidBankTransaction({
      subdivision_id: fx.subdivisionId,
      bank_transaction_id: bankTxnId,
      reason: "R9 verification void",
    });
    assert(voidRes.success, `void: ${voidRes.error}`);
    assert(voidRes.success!.voidedCreditIds.length === 1, `expected 1 credit voided, got ${voidRes.success!.voidedCreditIds.length}`);

    const btAfter = await fetchBt(bankTxnId);
    assert(btAfter!.is_voided === true, `is_voided expected true`);
    assert(btAfter!.match_status === "unmatched", `status expected unmatched, got ${btAfter!.match_status}`);
    assert(Number(btAfter!.matched_total) === 0, `matched_total expected 0, got ${btAfter!.matched_total}`);

    const stateAfterVoid = await fetchLotState(lotId);
    const balAfterVoid = Number(stateAfterVoid?.admin_balance ?? 0);
    assert(approx(balAfterVoid, balBefore), `balance expected back to ${balBefore}, got ${balAfterVoid}`);
    record(header, true, `match unlinked, credit voided, is_voided=true, lot balance restored`);
  } catch (e) {
    record(header, false, (e as Error).message);
  }
}

async function scenarioR10_VoidPendingReceipt(fx: Fixture) {
  const header = "R10: void pending cash receipt — credit voided, receipt status=voided";
  try {
    const lotId = fx.lotIds[0];
    const AMOUNT = 75;
    const stateBefore = await fetchLotState(lotId);
    const balBefore = Number(stateBefore?.admin_balance ?? 0);

    const rRes = await recon.recordCashReceipt({
      subdivision_id: fx.subdivisionId,
      lot_id: lotId,
      bank_account_id: fx.adminAccountId,
      fund_type: "administrative",
      amount: AMOUNT,
      received_date: "2026-08-11",
      payment_method: "cash",
    });
    assert(rRes.success);
    const receiptId = rRes.success!.receiptId;
    const creditId = rRes.success!.ledgerEntryId;

    const voidRes = await recon.voidUndepositedReceipt({
      subdivision_id: fx.subdivisionId,
      receipt_id: receiptId,
      reason: "R10 entered in error",
    });
    assert(voidRes.success, `void receipt: ${voidRes.error}`);

    const credit = await fetchLedgerEntry(creditId);
    assert(credit!.status === "voided", `credit status expected voided, got ${credit!.status}`);
    const receipt = await fetchUndeposited(receiptId);
    assert(receipt!.status === "voided", `receipt status expected voided, got ${receipt!.status}`);
    assert(receipt!.void_reason === "R10 entered in error", `void_reason mismatch: ${receipt!.void_reason}`);

    const stateAfter = await fetchLotState(lotId);
    const balAfter = Number(stateAfter?.admin_balance ?? 0);
    assert(approx(balAfter, balBefore), `balance expected back to ${balBefore}, got ${balAfter}`);
    record(header, true, `credit voided, receipt voided, balance restored`);
  } catch (e) {
    record(header, false, (e as Error).message);
  }
}

async function scenarioR11_VoidDepositedReceiptBlocked(fx: Fixture) {
  const header = "R11: void deposited receipt blocked — must void bank transaction first";
  try {
    const lotId = fx.lotIds[1];
    const AMOUNT = 60;
    const rRes = await recon.recordCashReceipt({
      subdivision_id: fx.subdivisionId,
      lot_id: lotId,
      bank_account_id: fx.adminAccountId,
      fund_type: "administrative",
      amount: AMOUNT,
      received_date: "2026-08-12",
      payment_method: "cash",
    });
    assert(rRes.success);
    const dep = await recon.addManualBankTransaction({
      subdivision_id: fx.subdivisionId,
      bank_account_id: fx.adminAccountId,
      transaction_date: "2026-08-13",
      amount: AMOUNT,
      direction: "credit",
      description: "Deposit clearing R11",
    });
    assert(dep.success);
    const clr = await recon.depositUndepositedFunds({
      subdivision_id: fx.subdivisionId,
      bank_transaction_id: dep.success!.bankTransactionId,
      undeposited_entry_ids: [rRes.success!.receiptId],
    });
    assert(clr.success);

    const voidRes = await recon.voidUndepositedReceipt({
      subdivision_id: fx.subdivisionId,
      receipt_id: rRes.success!.receiptId,
      reason: "R11 try to void after deposit",
    });
    assert(!voidRes.success && voidRes.error, `expected rejection, got ${JSON.stringify(voidRes)}`);
    assert(/deposited|bank transaction/i.test(voidRes.error!), `error should mention bank transaction, got: ${voidRes.error}`);

    const receipt = await fetchUndeposited(rRes.success!.receiptId);
    assert(receipt!.status === "deposited", `receipt should remain deposited, got ${receipt!.status}`);
    record(header, true, `void rejected with guidance; receipt still deposited`);
  } catch (e) {
    record(header, false, (e as Error).message);
  }
}

async function scenarioR12_VoidDepositReopensReceipt(fx: Fixture) {
  const header = "R12: void bank transaction that cleared a receipt reopens the receipt";
  try {
    const lotId = fx.lotIds[2];
    const AMOUNT = 80;
    const stateBefore = await fetchLotState(lotId);
    const balBefore = Number(stateBefore?.admin_balance ?? 0);

    const rRes = await recon.recordCashReceipt({
      subdivision_id: fx.subdivisionId,
      lot_id: lotId,
      bank_account_id: fx.adminAccountId,
      fund_type: "administrative",
      amount: AMOUNT,
      received_date: "2026-08-14",
      payment_method: "cheque",
      cheque_number: "R12-001",
    });
    assert(rRes.success);
    const creditId = rRes.success!.ledgerEntryId;

    const dep = await recon.addManualBankTransaction({
      subdivision_id: fx.subdivisionId,
      bank_account_id: fx.adminAccountId,
      transaction_date: "2026-08-15",
      amount: AMOUNT,
      direction: "credit",
      description: "Deposit clearing R12",
    });
    assert(dep.success);
    const clr = await recon.depositUndepositedFunds({
      subdivision_id: fx.subdivisionId,
      bank_transaction_id: dep.success!.bankTransactionId,
      undeposited_entry_ids: [rRes.success!.receiptId],
    });
    assert(clr.success);

    const stateAfterDeposit = await fetchLotState(lotId);
    const balAfterDeposit = Number(stateAfterDeposit?.admin_balance ?? 0);
    assert(approx(balAfterDeposit - balBefore, AMOUNT), `deposit-phase delta expected +${AMOUNT}, got ${balAfterDeposit - balBefore}`);

    const voidRes = await recon.voidBankTransaction({
      subdivision_id: fx.subdivisionId,
      bank_transaction_id: dep.success!.bankTransactionId,
      reason: "R12 deposit bounced",
    });
    assert(voidRes.success, `void bank txn: ${voidRes.error}`);
    assert(voidRes.success!.reopenedReceiptIds.length === 1, `expected 1 reopened receipt, got ${voidRes.success!.reopenedReceiptIds.length}`);
    assert(voidRes.success!.voidedCreditIds.length === 0, `expected 0 credits voided (credit belongs to receipt), got ${voidRes.success!.voidedCreditIds.length}`);

    const receiptAfter = await fetchUndeposited(rRes.success!.receiptId);
    assert(receiptAfter!.status === "pending_deposit", `receipt expected pending_deposit, got ${receiptAfter!.status}`);
    assert(receiptAfter!.deposited_at === null, `deposited_at should be null`);
    assert(receiptAfter!.deposited_by_bank_transaction_id === null, `deposited_by_bank_transaction_id should be null`);

    const credit = await fetchLedgerEntry(creditId);
    assert(credit!.status === "active", `credit should remain active, got ${credit!.status}`);

    const btAfter = await fetchBt(dep.success!.bankTransactionId);
    assert(btAfter!.is_voided === true, `deposit bt should be voided`);

    const stateAfterVoid = await fetchLotState(lotId);
    const balAfterVoid = Number(stateAfterVoid?.admin_balance ?? 0);
    assert(approx(balAfterVoid, balAfterDeposit), `balance should stay at ${balAfterDeposit} (credit is active)`);
    record(
      header,
      true,
      `deposit voided, receipt reopened (status=pending_deposit, deposited_* cleared), credit stayed active`,
    );
  } catch (e) {
    record(header, false, (e as Error).message);
  }
}

// ───────── PP4-C scenarios ─────────

let _ppFreshLotCounter = 5000;
async function pp_mkFreshLot(fx: Fixture): Promise<string> {
  const n = _ppFreshLotCounter++;
  const { data: lot, error } = await supabase
    .from("lots")
    .insert({
      subdivision_id: fx.subdivisionId,
      lot_number: n,
      lot_entitlement: 100,
      lot_liability: 100,
    })
    .select("id")
    .single();
  if (error || !lot) throw new Error(`pp_mkFreshLot: ${error?.message}`);
  return lot.id;
}

async function pp_mkOutstandingNotice(
  fx: Fixture,
  lotId: string,
  opts: {
    referenceOverride?: string;
    bpayCrn?: string | null;
    amount?: number;
    fundType?: "administrative" | "capital_works";
    dueDate?: string;
    periodStart?: string;
  } = {},
): Promise<{ id: string; reference: string }> {
  let reference = opts.referenceOverride;
  if (!reference) {
    const { data: ref } = await supabase.rpc("next_reference_number", {
      p_prefix: "LEV",
      p_subdivision_id: fx.subdivisionId,
    });
    reference = String(ref);
  }
  const amount = opts.amount ?? 500;
  const fundType = opts.fundType ?? "administrative";
  const { data: notice, error } = await supabase
    .from("levy_notices")
    .insert({
      subdivision_id: fx.subdivisionId,
      lot_id: lotId,
      budget_id: fx.budgetId,
      reference_number: reference,
      bpay_crn: opts.bpayCrn ?? null,
      fund_type: fundType,
      levy_type: "regular",
      period_start: opts.periodStart ?? "2026-01-01",
      period_end: "2026-03-31",
      amount,
      due_date: opts.dueDate ?? "2026-04-28",
      status: "draft",
    })
    .select("id")
    .single();
  if (error || !notice) {
    throw new Error(`pp_mkOutstandingNotice: ${error?.message ?? "insert failed"}`);
  }
  await supabase.from("lot_ledger_entries").insert({
    subdivision_id: fx.subdivisionId,
    lot_id: lotId,
    fund_type: fundType,
    entry_type: "debit",
    category: "levy",
    amount,
    entry_date: opts.periodStart ?? "2026-01-01",
    reference,
    levy_notice_id: notice.id,
    status: "active",
    created_by: fx.profileId,
  });
  return { id: notice.id, reference };
}

async function scenarioR13_RememberPayerCollisionRoundTrip(fx: Fixture) {
  const header =
    "R13: rememberPayer + collision returns three-way payload; resolvePayerMappingCollision('update') applies cleanly";
  try {
    // Setup:
    //   - lotA has an active mapping for "ACME PROPERTY" (no notice — Strategy 3
    //     known_payer falls through cleanly)
    //   - lotB will get an outstanding notice AFTER we add the bank transaction,
    //     so addManualBankTransaction's auto-match doesn't pick it up via
    //     Strategy 5 (amount_window). We need the bank tx to arrive UNMATCHED
    //     so we can drive reconcileTransaction(rememberPayer) → collision path.
    //   - Unusual amount $87,654.32 keeps Strategy 5 inert against earlier
    //     fixture state.
    //   - First call: rpc_reconcile commits the match; collision payload returned
    //   - Second call: resolvePayerMappingCollision('update') disables lotA's
    //     mapping and creates lotB's
    const lotA = await pp_mkFreshLot(fx);
    const lotB = await pp_mkFreshLot(fx);
    const R13_AMOUNT = 87654.32;

    // Direct insert mapping for lotA — bypasses the public createBankPayerMapping
    // collision check (we WANT collision detection to fire on the second mapping).
    const { data: mappingA, error: mErr } = await supabase
      .from("bank_payer_mappings")
      .insert({
        subdivision_id: fx.subdivisionId,
        canonical_sender_name: "ACME PROPERTY",
        lot_id: lotA,
        status: "active",
        raw_examples: [],
        created_by: fx.profileId,
      })
      .select("id")
      .single();
    assert(mappingA, `R13 mapping insert: ${mErr?.message}`);

    // Manual bank transaction (no lotB notice exists yet → auto-match misses).
    const txnRes = await recon.addManualBankTransaction({
      subdivision_id: fx.subdivisionId,
      bank_account_id: fx.adminAccountId,
      transaction_date: "2026-04-15",
      amount: R13_AMOUNT,
      direction: "credit",
      description: "Acme Property",
    });
    assert(txnRes.success, `R13 addManualBankTransaction: ${txnRes.error}`);
    const bankTxnId = txnRes.success!.bankTransactionId;

    // Sanity: confirm auto-match left it unmatched.
    const { data: btCheck } = await supabase
      .from("bank_transactions")
      .select("match_status, matched_total")
      .eq("id", bankTxnId)
      .single();
    assert(
      btCheck?.match_status === "unmatched" && Number(btCheck.matched_total) === 0,
      `R13 expected unmatched after addManual, got status=${btCheck?.match_status} matched_total=${btCheck?.matched_total}`,
    );

    // NOW insert lotB's notice (after the bank tx exists, so Strategy 5 didn't
    // pre-empt our manual reconcile).
    const noticeB = await pp_mkOutstandingNotice(fx, lotB, { amount: R13_AMOUNT });

    // First call: rememberPayer=true against lotB → collision detected.
    const r1 = await recon.reconcileTransaction({
      subdivision_id: fx.subdivisionId,
      bank_transaction_id: bankTxnId,
      allocations: [
        {
          lot_id: lotB,
          fund_type: "administrative",
          amount: R13_AMOUNT,
          levy_notice_id: noticeB.id,
          reference: noticeB.reference,
        },
      ],
      match_method: "manual",
      match_confidence: "manual",
      remember_payer: true,
    });
    assert(r1.success, `R13 first call success: ${r1.error}`);
    assert(
      r1.success!.mappingCollision,
      `R13 first call expected mappingCollision payload`,
    );
    assert(
      r1.success!.matchIds.length === 1,
      `R13 first call expected 1 match committed (collision detection runs AFTER reconcile)`,
    );
    const collision = r1.success!.mappingCollision!;
    assert(
      collision.colliding_mappings.length === 1,
      `R13 expected 1 colliding mapping`,
    );
    assert(
      collision.colliding_mappings[0].lot_id === lotA,
      `R13 colliding mapping lot mismatch`,
    );
    assert(
      collision.colliding_mappings[0].current_status === "ambiguous",
      `R13 lotA should be flipped to ambiguous on collision detection`,
    );

    // Second call: resolvePayerMappingCollision('update'). Should NOT re-invoke
    // rpc_reconcile_bank_transaction (the bug PP4-C fixed).
    const r2 = await recon.resolvePayerMappingCollision({
      subdivision_id: fx.subdivisionId,
      bank_transaction_id: bankTxnId,
      proposed_lot_id: lotB,
      resolution: "update",
      expected_collisions: collision.colliding_mappings,
    });
    assert(r2.success, `R13 resolvePayerMappingCollision: ${r2.error}`);
    assert(
      r2.success!.resolution_applied === "update",
      `R13 resolution_applied: ${r2.success!.resolution_applied}`,
    );
    assert(
      r2.success!.mapping_id,
      `R13 expected new mapping_id from 'update' resolution`,
    );
    assert(!r2.success!.race, `R13 unexpected race`);

    // Verify DB state.
    const { data: lotAMapping } = await supabase
      .from("bank_payer_mappings")
      .select("status")
      .eq("id", mappingA.id)
      .single();
    assert(
      lotAMapping?.status === "disabled",
      `R13 lotA mapping expected disabled, got ${lotAMapping?.status}`,
    );

    const { data: lotBMapping } = await supabase
      .from("bank_payer_mappings")
      .select("status, lot_id")
      .eq("id", r2.success!.mapping_id!)
      .single();
    assert(
      lotBMapping?.status === "active" && lotBMapping?.lot_id === lotB,
      `R13 lotB mapping should be active on lotB, got ${JSON.stringify(lotBMapping)}`,
    );

    record(
      header,
      true,
      `first call: match committed + collision payload returned; second call: 'update' applied; lotA disabled, lotB active`,
    );
  } catch (e) {
    record(header, false, (e as Error).message);
  }
}

async function scenarioCSV1_OrchestratorE2E(fx: Fixture) {
  const header =
    "CSV-1: 5-row CSV import — Strategies 1, 2, 3 + unmatched + duplicate (orchestrator integration)";
  try {
    // Set up a BPAY-enabled bank account on this subdivision for Strategy 2.
    const { data: bpayAccount } = await supabase
      .from("bank_accounts")
      .insert({
        subdivision_id: fx.subdivisionId,
        account_name: "CSV-1 BPAY Admin",
        bsb: "012-345",
        account_number: "98765432",
        fund_type: "administrative",
        bpay_biller_code: "1234567",
      })
      .select("id")
      .single();
    assert(bpayAccount, "CSV-1 BPAY account insert");

    const lot1 = await pp_mkFreshLot(fx);
    const lot2 = await pp_mkFreshLot(fx);
    const lot3 = await pp_mkFreshLot(fx);

    // Notice with hand-picked reference "LEV-7" (PP4-A fixture refs went up to
    // LEV-99, then per-OC counter at 1000+). Use a uniquely high ref.
    const lev7 = await pp_mkOutstandingNotice(fx, lot1, {
      referenceOverride: "LEV-9999",
      amount: 500,
    });
    void lev7;

    // Notice with bpay_crn = generateCrn(100) = "00001008".
    const lev100Notice = await pp_mkOutstandingNotice(fx, lot2, {
      amount: 500,
      bpayCrn: generateCrn(100),
    });
    void lev100Notice;

    // Notice on lot3 + active mapping for "JANE BROWN" → lot3.
    const lev3Notice = await pp_mkOutstandingNotice(fx, lot3, { amount: 500 });
    void lev3Notice;
    await supabase.from("bank_payer_mappings").insert({
      subdivision_id: fx.subdivisionId,
      canonical_sender_name: "JANE BROWN",
      lot_id: lot3,
      status: "active",
      raw_examples: [],
      created_by: fx.profileId,
    });

    // Pre-insert a bank_transaction matching row 5 for duplicate detection.
    const dupKey = {
      transaction_date: "2026-04-05",
      amount: 500,
      description: "duplicate row description",
    };
    await supabase.from("bank_transactions").insert({
      bank_account_id: bpayAccount.id,
      source: "manual",
      transaction_date: dupKey.transaction_date,
      amount: dupKey.amount,
      description: dupKey.description,
      match_status: "unmatched",
    });

    // Run CSV import via the bank action.
    const result = await bank.importBankTransactions(fx.subdivisionId, {
      bank_account_id: bpayAccount.id,
      rows: [
        {
          transaction_date: "2026-04-01",
          amount: 500,
          description: "Payment LEV-9999",
          balance: null,
        },
        {
          transaction_date: "2026-04-02",
          amount: 500,
          description: "BPAY 00001008",
          balance: null,
        },
        {
          transaction_date: "2026-04-03",
          amount: 500,
          description: "JANE BROWN",
          balance: null,
        },
        {
          transaction_date: "2026-04-04",
          amount: 77777.77,
          description: "Random unrelated text",
          balance: null,
        },
        {
          transaction_date: dupKey.transaction_date,
          amount: dupKey.amount,
          description: dupKey.description,
          balance: null,
        },
      ],
    });
    assert(result.summary, `CSV-1 import error: ${result.error}`);
    const s = result.summary!;
    assert(s.imported === 4, `CSV-1 imported expected 4, got ${s.imported}`);
    assert(s.matched === 3, `CSV-1 matched expected 3, got ${s.matched}`);
    assert(s.duplicates === 1, `CSV-1 duplicates expected 1, got ${s.duplicates}`);
    assert(s.errors.length === 0, `CSV-1 errors: ${JSON.stringify(s.errors)}`);

    // Inspect bank_transactions for each imported row's match_status +
    // reconciliation_matches.match_method.
    const { data: imported } = await supabase
      .from("bank_transactions")
      .select("id, transaction_date, description, match_status")
      .eq("bank_account_id", bpayAccount.id)
      .in("transaction_date", ["2026-04-01", "2026-04-02", "2026-04-03", "2026-04-04"])
      .order("transaction_date");
    assert(imported && imported.length === 4, `CSV-1 expected 4 imported rows, got ${imported?.length}`);

    // Helper: lookup match_method for a given bank_txn id.
    async function methodFor(id: string): Promise<string | null> {
      const { data } = await supabase
        .from("reconciliation_matches")
        .select("match_method")
        .eq("bank_transaction_id", id)
        .maybeSingle();
      return data?.match_method ?? null;
    }

    const [r1Tx, r2Tx, r3Tx, r4Tx] = imported;
    assert(r1Tx.match_status === "auto_matched", `CSV-1 r1 status: ${r1Tx.match_status}`);
    assert(
      (await methodFor(r1Tx.id)) === "auto_reference",
      `CSV-1 r1 match_method: ${await methodFor(r1Tx.id)}`,
    );
    assert(r2Tx.match_status === "auto_matched", `CSV-1 r2 status: ${r2Tx.match_status}`);
    assert(
      (await methodFor(r2Tx.id)) === "auto_bpay_crn",
      `CSV-1 r2 match_method: ${await methodFor(r2Tx.id)}`,
    );
    assert(r3Tx.match_status === "auto_matched", `CSV-1 r3 status: ${r3Tx.match_status}`);
    assert(
      (await methodFor(r3Tx.id)) === "auto_sender",
      `CSV-1 r3 match_method: ${await methodFor(r3Tx.id)}`,
    );
    assert(
      r4Tx.match_status === "unmatched",
      `CSV-1 r4 status expected unmatched, got ${r4Tx.match_status}`,
    );

    record(
      header,
      true,
      `summary: imported=${s.imported}, matched=${s.matched}, duplicates=${s.duplicates}; methods: r1=auto_reference, r2=auto_bpay_crn, r3=auto_sender, r4=unmatched`,
    );
  } catch (e) {
    record(header, false, (e as Error).message);
  }
}

// ───────── Cleanup ─────────

async function cleanupMarker() {
  console.log(`\nCleaning up test data with marker "${VERIFY_MARKER}"`);
  const { data: companies } = await supabase
    .from("management_companies")
    .select("id, name")
    .like("name", `${VERIFY_MARKER}%`);

  if (!companies || companies.length === 0) {
    console.log("  (nothing to clean up)");
    return;
  }
  for (const company of companies) {
    await cleanupOneCompany(company.id);
  }
  console.log(`Cleaned up ${companies.length} test run(s).`);
}

async function cleanupOneCompany(companyId: string) {
  const { data: subs } = await supabase.from("subdivisions").select("id").eq("management_company_id", companyId);
  const subIds = (subs ?? []).map((s) => s.id);

  const { data: profs } = await supabase.from("profiles").select("id").eq("management_company_id", companyId);
  const profIds = (profs ?? []).map((p) => p.id);

  // audit_log holds RESTRICT-style FKs to profiles.profile_id and
  // subdivisions.subdivision_id. Must be deleted before any parent row.
  // Keeping these deletes at the top is crucial — without them, downstream
  // delete calls silently no-op on FK violation (PostgREST returns the error
  // in the response; .delete() without .error-check surfaces nothing).
  if (subIds.length > 0) {
    await supabase.from("audit_log").delete().in("subdivision_id", subIds);
  }
  if (profIds.length > 0) {
    await supabase.from("audit_log").delete().in("profile_id", profIds);
  }

  if (subIds.length > 0) {
    const { data: lots } = await supabase.from("lots").select("id").in("subdivision_id", subIds);
    const lotIds = (lots ?? []).map((l) => l.id);

    const { data: accounts } = await supabase.from("bank_accounts").select("id").in("subdivision_id", subIds);
    const accountIds = (accounts ?? []).map((a) => a.id);

    // undeposited_funds_entries must be deleted BEFORE lot_ledger_entries (FK)
    if (lotIds.length > 0) {
      await supabase.from("undeposited_funds_entries").delete().in("lot_id", lotIds);
    }

    if (accountIds.length > 0) {
      const { data: txns } = await supabase.from("bank_transactions").select("id").in("bank_account_id", accountIds);
      const txnIds = (txns ?? []).map((t) => t.id);
      if (txnIds.length > 0) {
        await supabase.from("reconciliation_matches").delete().in("bank_transaction_id", txnIds);
      }
    }
    if (lotIds.length > 0) {
      const { data: entries } = await supabase.from("lot_ledger_entries").select("id").in("lot_id", lotIds);
      const entryIds = (entries ?? []).map((e) => e.id);
      if (entryIds.length > 0) {
        await supabase.from("reconciliation_matches").delete().in("ledger_entry_id", entryIds);
      }
    }

    if (lotIds.length > 0) {
      await supabase
        .from("lot_ledger_entries")
        .update({ voided_by_entry_id: null, voids_entry_id: null })
        .in("lot_id", lotIds);
      await supabase.from("lot_ledger_entries").delete().in("lot_id", lotIds);
    }

    if (lotIds.length > 0) {
      await supabase.from("lot_ledger_state").delete().in("lot_id", lotIds);
    }

    if (accountIds.length > 0) {
      await supabase.from("bank_transactions").delete().in("bank_account_id", accountIds);
    }

    await supabase.from("payments").delete().in("subdivision_id", subIds);

    const { data: notices } = await supabase.from("levy_notices").select("id").in("subdivision_id", subIds);
    const noticeIds = (notices ?? []).map((n) => n.id);
    if (noticeIds.length > 0) {
      await supabase.from("levy_notice_items").delete().in("levy_notice_id", noticeIds);
      await supabase.from("levy_notices").update({ linked_levy_id: null }).in("subdivision_id", subIds);
      await supabase.from("levy_notices").delete().in("subdivision_id", subIds);
    }
    await supabase.from("levy_batches").delete().in("subdivision_id", subIds);

    const subDelErr = (await supabase.from("subdivisions").delete().in("id", subIds)).error;
    if (subDelErr) console.warn(`  cleanup: subdivisions delete error: ${subDelErr.message}`);
  }

  const profDelErr = (await supabase.from("profiles").delete().eq("management_company_id", companyId)).error;
  if (profDelErr) console.warn(`  cleanup: profiles delete error: ${profDelErr.message}`);

  const compDelErr = (await supabase.from("management_companies").delete().eq("id", companyId)).error;
  if (compDelErr) console.warn(`  cleanup: management_companies delete error: ${compDelErr.message}`);
}

// ───────── Main ─────────

async function main() {
  const cleanupOnly = process.argv.includes("--cleanup");
  const noCleanup = process.argv.includes("--no-cleanup");

  if (cleanupOnly) {
    await cleanupMarker();
    process.exit(0);
  }

  console.log("Reconciliation verification — Prompt 2 scenarios\n");

  // ─── Pre-flight 1: assert next/cache stub intercepts ──────────────────
  // Discriminator: real revalidatePath throws synchronously with
  // "static generation store missing" when called outside a request scope.
  // The stub returns undefined. We call with a known-fake path; any throw
  // means the real implementation was loaded and Variant A is not working.
  const nc = await import("next/cache");
  let stubActive = false;
  let observedBehaviour: string;
  try {
    const result = nc.revalidatePath("/__stub_check__");
    stubActive = true;
    observedBehaviour = `returned ${String(result)} without throwing`;
  } catch (e) {
    stubActive = false;
    observedBehaviour = `threw: ${(e as Error).message}`;
  }
  if (!stubActive) {
    console.error("FATAL: next/cache stub did not intercept. Variant A is not working on this Node/tsx version. Stop and escalate.");
    console.error(`  observed: ${observedBehaviour}`);
    console.error(`  Node: ${process.version}`);
    process.exit(1);
  }
  console.log(`  next/cache stub active (${observedBehaviour})`);

  // ─── Pre-flight 2: fixture sanity ─────────────────────────────────────
  // Refuse to start on top of dirty state. Count marker-tagged rows, run
  // cleanup, count again. Any residue means cleanup is incomplete — bail
  // loudly rather than run on dirty state.
  const { count: dirtyBefore } = await supabase
    .from("management_companies")
    .select("id", { count: "exact", head: true })
    .like("name", `${VERIFY_MARKER}%`);
  if ((dirtyBefore ?? 0) > 0) {
    console.log(`  Pre-flight: ${dirtyBefore} stale verification run(s) detected — cleaning up first`);
  }
  await cleanupMarker();
  const { count: dirtyAfter } = await supabase
    .from("management_companies")
    .select("id", { count: "exact", head: true })
    .like("name", `${VERIFY_MARKER}%`);
  if ((dirtyAfter ?? 0) > 0) {
    console.error(`FATAL: cleanup did not remove all marker-tagged rows. Residue count: ${dirtyAfter}.`);
    const { data: residue } = await supabase
      .from("management_companies")
      .select("id, name, created_at")
      .like("name", `${VERIFY_MARKER}%`);
    console.error("  Residue rows:", residue);
    process.exit(1);
  }

  recon = await import("./reconciliation");
  bank = await import("./bank-transactions");
  void bank;

  assert(
    __getUserIdResolverForVerification() !== null,
    "Resolver unexpectedly null after importing action modules — ordering bug.",
  );

  const fx = await createFixture();

  try {
    await scenarioR1_ManualNoAutoMatch(fx);
    await scenarioR2_ReferenceExactAutoMatch(fx);
    await scenarioR3_ReferencePartialAutoMatch(fx);
    const s4 = await scenarioR4_ManualMatchTwoLots(fx);
    await scenarioR5_UnmatchRestoresState(fx, s4);
    await scenarioR6_CashReceiptDeposit(fx);
    await scenarioR7_DepositSumMismatchRejected(fx);
    await scenarioR8_ExcludeUnexclude(fx);
    await scenarioR9_VoidBankCascadesUnmatch(fx);
    await scenarioR10_VoidPendingReceipt(fx);
    await scenarioR11_VoidDepositedReceiptBlocked(fx);
    await scenarioR12_VoidDepositReopensReceipt(fx);
    await scenarioR13_RememberPayerCollisionRoundTrip(fx);
    await scenarioCSV1_OrchestratorE2E(fx);
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
