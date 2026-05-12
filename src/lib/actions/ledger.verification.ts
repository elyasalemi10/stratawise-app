/**
 * Ledger verification script (Prompt 1).
 *
 * Exercises the 9 scenarios required by Prompt 1 §6 end-to-end against the
 * live Supabase dev database using the service role key. Idempotent —
 * generates fresh test data on every run and deletes it after (unless
 * --no-cleanup is passed).
 *
 * Usage:
 *   npx tsx src/lib/actions/ledger.verification.ts             # run scenarios + cleanup
 *   npx tsx src/lib/actions/ledger.verification.ts --no-cleanup # leave test data
 *   npx tsx src/lib/actions/ledger.verification.ts --cleanup   # clean up stale runs and exit
 *
 * Test data is tagged with VERIFY_MARKER in management_companies.name and
 * profiles.email, so --cleanup will never touch real data.
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { randomUUID } from "crypto";
import { generateSubdivisionCode } from "@/lib/subdivision-code";

config({ path: ".env.local" });

// PP6-D-D-fix: gate Resend sends. Some scenarios dynamic-import tryAutoMatch
// from the orchestrator, which triggers emitPaymentReceivedEmail on
// auto-match success (PP6-C-1 integration).
process.env.EMAIL_DRY_RUN = "true";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const VERIFY_MARKER = "__VERIFY_LEDGER__";
const supabase = createClient(supabaseUrl, serviceRoleKey);

type Result = { scenario: string; passed: boolean; detail: string };
const results: Result[] = [];

function record(scenario: string, passed: boolean, detail: string) {
  results.push({ scenario, passed, detail });
  console.log(`  ${passed ? "PASS" : "FAIL"}  ${scenario}${detail ? " — " + detail : ""}`);
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

// ───────── Fixture creation ─────────

type Fixture = {
  runId: string;
  companyId: string;
  subdivisionId: string;
  budgetId: string;
  profileId: string;
  lotIds: string[];
};

async function createFixture(): Promise<Fixture> {
  const runId = `${Date.now()}_${randomUUID().slice(0, 8)}`;
  const companyName = `${VERIFY_MARKER}${runId}`;
  const profileEmail = `${VERIFY_MARKER.toLowerCase()}${runId}@ledger.test`;
  const clerkId = `${VERIFY_MARKER}${runId}_clerk`;

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
      auth_user_id: clerkId,
      email: profileEmail,
      first_name: "Verify",
      last_name: "Test",
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
      short_code: generateSubdivisionCode(),
      address: "1 Ledger Verify St, Melbourne VIC 3000",
      total_lots: 3,
      created_by: profile.id,
    })
    .select("id")
    .single();
  if (subErr || !subdivision) throw new Error(`Fixture: subdivision insert failed: ${subErr?.message}`);

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
  if (budgetErr || !budget) throw new Error(`Fixture: budget insert failed: ${budgetErr?.message}`);

  const lotRows = [1, 2, 3].map((n) => ({
    subdivision_id: subdivision.id,
    lot_number: n,
    lot_entitlement: 100,
    lot_liability: 100,
  }));
  // Select lot_number alongside id so PostgREST allows ORDER BY lot_number.
  // (ORDER BY a column not in the projection raises a confusing
  // "column does not exist" error.)
  const { data: lots, error: lotsErr } = await supabase
    .from("lots")
    .insert(lotRows)
    .select("id, lot_number")
    .order("lot_number", { ascending: true });
  if (lotsErr || !lots || lots.length !== 3) throw new Error(`Fixture: lots insert failed: ${lotsErr?.message}`);

  return {
    runId,
    companyId: company.id,
    subdivisionId: subdivision.id,
    budgetId: budget.id,
    profileId: profile.id,
    lotIds: lots.map((l) => l.id),
  };
}

async function makeLevyBatch(
  fx: Fixture,
  opts: { periodStart: string; periodEnd: string; dueDate: string; amountPerLot: number; label: string },
): Promise<{ batchId: string; noticeIds: string[] }> {
  const { data: batch, error: batchErr } = await supabase
    .from("levy_batches")
    .insert({
      subdivision_id: fx.subdivisionId,
      budget_id: fx.budgetId,
      financial_year: "2026-2027",
      fund_type: "administrative",
      period_start: opts.periodStart,
      period_end: opts.periodEnd,
      period_label: opts.label,
      due_date: opts.dueDate,
      total_amount: opts.amountPerLot * fx.lotIds.length,
      levy_count: fx.lotIds.length,
      status: "draft",
      generated_by: fx.profileId,
    })
    .select("id")
    .single();
  if (batchErr || !batch) throw new Error(`makeLevyBatch: ${batchErr?.message}`);

  const noticeIds: string[] = [];
  for (const lotId of fx.lotIds) {
    const { data: ref } = await supabase.rpc("next_reference_number", {
      p_prefix: "LEV",
      p_subdivision_id: fx.subdivisionId,
    });
    if (!ref) throw new Error("next_reference_number returned null");
    const { data: notice, error: nErr } = await supabase
      .from("levy_notices")
      .insert({
        subdivision_id: fx.subdivisionId,
        lot_id: lotId,
        budget_id: fx.budgetId,
        batch_id: batch.id,
        reference_number: ref,
        fund_type: "administrative",
        levy_type: "regular",
        period_start: opts.periodStart,
        period_end: opts.periodEnd,
        amount: opts.amountPerLot,
        due_date: opts.dueDate,
        status: "draft",
      })
      .select("id")
      .single();
    if (nErr || !notice) throw new Error(`makeLevyBatch: notice insert: ${nErr?.message}`);
    noticeIds.push(notice.id);
  }

  return { batchId: batch.id, noticeIds };
}

async function fetchState(lotId: string) {
  const { data } = await supabase.from("lot_ledger_state").select("*").eq("lot_id", lotId).single();
  return data;
}

// ───────── Scenarios ─────────
//
// Assertion style: every expected value is derived from inputs declared in
// this block (e.g. a levy amount, a payment amount) or from state captured
// BEFORE the mutation (balance_before + delta). No hardcoded magic numbers.
// The script would still pass if the S1 amount were changed from 500 to 750.

type S1Out = { batchId: string; noticeIds: string[]; amount: number; periodStart: string };

async function scenario1_BatchDebits(fx: Fixture): Promise<S1Out> {
  const header = "S1: levy batch with 3 lots writes 3 debits + state balance/oldest_unpaid_date";
  const BATCH = {
    periodStart: "2026-07-01",
    periodEnd: "2026-09-30",
    dueDate: "2026-07-28",
    amountPerLot: 500,
    label: "S1 Q1",
  } as const;
  try {
    const { batchId, noticeIds } = await makeLevyBatch(fx, BATCH);
    const { error: rpcErr } = await supabase.rpc("rpc_levy_batch_debit", {
      p_batch_id: batchId,
      p_created_by: fx.profileId,
    });
    assert(!rpcErr, `rpc_levy_batch_debit failed: ${rpcErr?.message}`);

    for (const lotId of fx.lotIds) {
      const state = await fetchState(lotId);
      assert(state !== null, `S1 state row missing for ${lotId}`);
      assert(
        Number(state.admin_balance) === -BATCH.amountPerLot,
        `S1 admin_balance expected ${-BATCH.amountPerLot}, got ${state.admin_balance}`,
      );
      assert(
        state.oldest_unpaid_date_admin === BATCH.periodStart,
        `S1 oldest_unpaid_date_admin expected ${BATCH.periodStart}, got ${state.oldest_unpaid_date_admin}`,
      );
    }

    const { data: batch } = await supabase.from("levy_batches").select("status").eq("id", batchId).single();
    assert(batch?.status === "ledger_written", `S1 batch status expected ledger_written, got ${batch?.status}`);

    record(header, true, `3 debits of ${BATCH.amountPerLot} written, all balances=${-BATCH.amountPerLot}, batch→ledger_written`);
    return { batchId, noticeIds, amount: BATCH.amountPerLot, periodStart: BATCH.periodStart };
  } catch (e) {
    record(header, false, (e as Error).message);
    throw e;
  }
}

async function scenario2_FullPayment(fx: Fixture, s1: S1Out) {
  const header = "S2: full payment on lot[0] — balance delta equals payment amount";
  try {
    const lotId = fx.lotIds[0];
    const paymentAmount = s1.amount;
    const before = await fetchState(lotId);
    const balanceBefore = Number(before.admin_balance);

    const { error: pErr } = await supabase.rpc("rpc_payment_credit", {
      p_subdivision_id: fx.subdivisionId,
      p_lot_id: lotId,
      p_fund_type: "administrative",
      p_amount: paymentAmount,
      p_entry_date: "2026-07-15",
      p_description: "S2 full payment",
      p_reference: null,
      p_levy_notice_id: null,
      p_created_by: fx.profileId,
    });
    assert(!pErr, `rpc_payment_credit failed: ${pErr?.message}`);

    const after = await fetchState(lotId);
    const balanceAfter = Number(after.admin_balance);
    const expectedAfter = balanceBefore + paymentAmount;
    assert(
      balanceAfter === expectedAfter,
      `S2 balance delta: expected ${balanceBefore} + ${paymentAmount} = ${expectedAfter}, got ${balanceAfter}`,
    );
    // Payment equals the one prior debit on this lot, so the walker finds nothing unpaid.
    assert(
      after.oldest_unpaid_date_admin === null,
      `S2 oldest_unpaid expected null (full coverage), got ${after.oldest_unpaid_date_admin}`,
    );
    record(header, true, `delta=+${paymentAmount} (${balanceBefore}→${balanceAfter}), oldest_unpaid cleared`);
  } catch (e) {
    record(header, false, (e as Error).message);
  }
}

async function scenario3_PartialPayment(fx: Fixture, s1: S1Out) {
  const header = "S3: partial payment on lot[1] — balance moves by +payment, oldest_unpaid unchanged";
  const PAYMENT_AMOUNT = 200;
  try {
    const lotId = fx.lotIds[1];
    const before = await fetchState(lotId);
    const balanceBefore = Number(before.admin_balance);
    const oldestBefore = before.oldest_unpaid_date_admin;

    const { error: pErr } = await supabase.rpc("rpc_payment_credit", {
      p_subdivision_id: fx.subdivisionId,
      p_lot_id: lotId,
      p_fund_type: "administrative",
      p_amount: PAYMENT_AMOUNT,
      p_entry_date: "2026-07-20",
      p_description: "S3 partial payment",
      p_reference: null,
      p_levy_notice_id: null,
      p_created_by: fx.profileId,
    });
    assert(!pErr, `rpc_payment_credit failed: ${pErr?.message}`);

    const after = await fetchState(lotId);
    const balanceAfter = Number(after.admin_balance);
    const expectedAfter = balanceBefore + PAYMENT_AMOUNT;
    assert(
      balanceAfter === expectedAfter,
      `S3 balance delta: expected ${balanceBefore} + ${PAYMENT_AMOUNT} = ${expectedAfter}, got ${balanceAfter}`,
    );
    // Partial payment < prior debit, so the S1 debit is still the oldest uncovered.
    assert(
      after.oldest_unpaid_date_admin === oldestBefore,
      `S3 oldest_unpaid_date changed: before=${oldestBefore}, after=${after.oldest_unpaid_date_admin}`,
    );
    assert(
      after.oldest_unpaid_date_admin === s1.periodStart,
      `S3 oldest_unpaid should equal S1 period start ${s1.periodStart}, got ${after.oldest_unpaid_date_admin}`,
    );
    record(header, true, `delta=+${PAYMENT_AMOUNT}, oldest_unpaid preserved at ${oldestBefore}`);
  } catch (e) {
    record(header, false, (e as Error).message);
  }
}

async function scenario4_OldestUnpaidAdvances(fx: Fixture, s1: S1Out) {
  const header = "S4: Q2 levy + payment that covers S1 on lot[2] — oldest_unpaid advances to Q2 start";
  const Q2 = {
    periodStart: "2026-10-01",
    periodEnd: "2026-12-31",
    dueDate: "2026-10-28",
    amountPerLot: 400,
    label: "S4 Q2",
  } as const;
  const coveragePayment = s1.amount; // exactly enough to cover the first levy
  try {
    const lotId = fx.lotIds[2];
    const before = await fetchState(lotId);
    const balanceBefore = Number(before.admin_balance);

    const { batchId } = await makeLevyBatch(fx, Q2);
    const { error: rpcErr } = await supabase.rpc("rpc_levy_batch_debit", {
      p_batch_id: batchId,
      p_created_by: fx.profileId,
    });
    assert(!rpcErr, `rpc_levy_batch_debit Q2 failed: ${rpcErr?.message}`);

    const { error: pErr } = await supabase.rpc("rpc_payment_credit", {
      p_subdivision_id: fx.subdivisionId,
      p_lot_id: lotId,
      p_fund_type: "administrative",
      p_amount: coveragePayment,
      p_entry_date: "2026-08-01",
      p_description: "S4 covers first levy",
      p_reference: null,
      p_levy_notice_id: null,
      p_created_by: fx.profileId,
    });
    assert(!pErr, `rpc_payment_credit failed: ${pErr?.message}`);

    const after = await fetchState(lotId);
    const balanceAfter = Number(after.admin_balance);
    // Delta: +(-Q2.amountPerLot)  [new debit]  +coveragePayment  [new credit]
    const expectedDelta = -Q2.amountPerLot + coveragePayment;
    const expectedAfter = balanceBefore + expectedDelta;
    assert(
      balanceAfter === expectedAfter,
      `S4 balance: expected ${balanceBefore} + (${expectedDelta}) = ${expectedAfter}, got ${balanceAfter}`,
    );
    assert(
      after.oldest_unpaid_date_admin === Q2.periodStart,
      `S4 oldest_unpaid expected ${Q2.periodStart} (coverage absorbed S1), got ${after.oldest_unpaid_date_admin}`,
    );
    record(header, true, `delta=${expectedDelta}, oldest_unpaid advanced to ${Q2.periodStart}`);
  } catch (e) {
    record(header, false, (e as Error).message);
  }
}

async function scenario5_VoidLevyDebit(fx: Fixture, s1: S1Out) {
  const header = "S5: void S1 debit on lot[1] — balance delta equals voided amount; original→voided, offset created, notice→written_off";
  try {
    const lotId = fx.lotIds[1];
    const s1NoticeIdForLot = s1.noticeIds[1];

    // Find the S1 debit specifically (lot[1] now has a Q2 debit too, from S4's batch).
    const { data: debits } = await supabase
      .from("lot_ledger_entries")
      .select("id, amount")
      .eq("lot_id", lotId)
      .eq("levy_notice_id", s1NoticeIdForLot)
      .eq("entry_type", "debit")
      .eq("status", "active");
    assert(debits && debits.length === 1, `S5 setup: expected 1 active S1 debit for lot[1], got ${debits?.length}`);
    const entryId = debits[0].id;
    const voidedAmount = Number(debits[0].amount);

    const before = await fetchState(lotId);
    const balanceBefore = Number(before.admin_balance);

    const { data: offsetId, error: vErr } = await supabase.rpc("rpc_ledger_void", {
      p_entry_id: entryId,
      p_reason: "S5 test void",
      p_voided_by: fx.profileId,
    });
    assert(!vErr, `rpc_ledger_void failed: ${vErr?.message}`);
    assert(typeof offsetId === "string", `S5 expected offset uuid, got ${offsetId}`);

    const { data: original } = await supabase
      .from("lot_ledger_entries")
      .select("status, voided_by_entry_id")
      .eq("id", entryId)
      .single();
    assert(original?.status === "voided", `S5 original not marked voided`);
    assert(original?.voided_by_entry_id === offsetId, `S5 voided_by_entry_id mismatch`);

    const { data: offsetEntry } = await supabase
      .from("lot_ledger_entries")
      .select("category, entry_type, voids_entry_id, amount")
      .eq("id", offsetId)
      .single();
    assert(offsetEntry?.category === "void_offset", `S5 offset category wrong`);
    assert(offsetEntry?.entry_type === "credit", `S5 offset should be credit (inverted from debit)`);
    assert(offsetEntry?.voids_entry_id === entryId, `S5 voids_entry_id mismatch`);
    assert(Number(offsetEntry.amount) === voidedAmount, `S5 offset amount should mirror original`);

    const after = await fetchState(lotId);
    const balanceAfter = Number(after.admin_balance);
    // Voiding a debit of X moves the balance by +X (the offset credit cancels the
    // voided debit in the sum-all balance; see CONTEXT.md §4.2).
    const expectedAfter = balanceBefore + voidedAmount;
    assert(
      balanceAfter === expectedAfter,
      `S5 balance delta: expected ${balanceBefore} + ${voidedAmount} = ${expectedAfter}, got ${balanceAfter}`,
    );

    const { data: notice } = await supabase.from("levy_notices").select("status").eq("id", s1NoticeIdForLot).single();
    assert(notice?.status === "written_off", `S5 levy_notice status expected written_off, got ${notice?.status}`);

    record(header, true, `delta=+${voidedAmount} (${balanceBefore}→${balanceAfter}), notice→written_off, offset=${offsetId.slice(0, 8)}…`);
  } catch (e) {
    record(header, false, (e as Error).message);
  }
}

async function scenario6_VoidAlreadyVoided(fx: Fixture) {
  const header = "S6: re-void raises error AND leaves state unchanged";
  try {
    const lotId = fx.lotIds[1];
    const { data: voided } = await supabase
      .from("lot_ledger_entries")
      .select("id")
      .eq("lot_id", lotId)
      .eq("status", "voided")
      .limit(1)
      .single();
    assert(voided?.id, `S6 setup: no voided entry found on lot[1] (did S5 not run?)`);

    const before = await fetchState(lotId);
    const balanceBefore = Number(before.admin_balance);

    const { error: vErr } = await supabase.rpc("rpc_ledger_void", {
      p_entry_id: voided.id,
      p_reason: "second void attempt",
      p_voided_by: fx.profileId,
    });
    assert(vErr !== null, `S6 expected error but got none`);

    const after = await fetchState(lotId);
    const balanceAfter = Number(after.admin_balance);
    assert(
      balanceAfter === balanceBefore,
      `S6 balance changed despite RPC error: before=${balanceBefore}, after=${balanceAfter}`,
    );
    record(header, true, `error raised ("${vErr!.message.slice(0, 60)}…"); balance unchanged at ${balanceAfter}`);
  } catch (e) {
    record(header, false, (e as Error).message);
  }
}

async function scenario7_DuplicateLevyDebit(fx: Fixture, s1: S1Out) {
  const header = "S7: duplicate rpc_levy_debit on same levy_notice_id returns existing id, count unchanged";
  try {
    const lotId = fx.lotIds[0];
    const noticeId = s1.noticeIds[0];
    const { data: before } = await supabase
      .from("lot_ledger_entries")
      .select("id, amount")
      .eq("levy_notice_id", noticeId)
      .eq("entry_type", "debit")
      .eq("status", "active");
    assert(before && before.length === 1, `S7 setup: expected 1 active debit, got ${before?.length}`);
    const existingId = before[0].id;
    const existingAmount = Number(before[0].amount);

    const { data: returnedId, error: rErr } = await supabase.rpc("rpc_levy_debit", {
      p_subdivision_id: fx.subdivisionId,
      p_lot_id: lotId,
      p_fund_type: "administrative",
      p_amount: existingAmount,
      p_entry_date: "2026-07-01",
      p_description: "dup attempt",
      p_reference: "dup",
      p_levy_notice_id: noticeId,
      p_category: "levy",
      p_created_by: fx.profileId,
    });
    assert(!rErr, `rpc_levy_debit failed: ${rErr?.message}`);
    assert(returnedId === existingId, `S7 expected existing id ${existingId}, got ${returnedId}`);

    const { data: after } = await supabase
      .from("lot_ledger_entries")
      .select("id")
      .eq("levy_notice_id", noticeId)
      .eq("entry_type", "debit")
      .eq("status", "active");
    assert(
      (after?.length ?? 0) === before.length,
      `S7 expected count unchanged (${before.length}), got ${after?.length}`,
    );
    record(header, true, `returned existing id, active-debit count unchanged at ${before.length}`);
  } catch (e) {
    record(header, false, (e as Error).message);
  }
}

async function scenario8_ExplicitReferencePayment(fx: Fixture) {
  const header = "S8: targeted payment on OLDER levy — walker skips it, oldest_unpaid = newer levy";
  const LEVY_AMOUNT = 300;
  const OLDER = { start: "2026-01-01", end: "2026-03-31", due: "2026-01-28" } as const;
  const NEWER = { start: "2026-04-01", end: "2026-06-30", due: "2026-04-28" } as const;
  try {
    const { data: newLot, error: lotErr } = await supabase
      .from("lots")
      .insert({ subdivision_id: fx.subdivisionId, lot_number: 100, lot_entitlement: 100, lot_liability: 100 })
      .select("id")
      .single();
    assert(!lotErr && newLot, `S8 setup lot insert failed: ${lotErr?.message}`);
    const newLotId = newLot.id;

    // Fresh lot should start at balance 0 (zero-state row seeded by trigger).
    const initial = await fetchState(newLotId);
    const initialBalance = Number(initial.admin_balance);
    assert(initialBalance === 0, `S8 fresh lot should start at balance 0, got ${initialBalance}`);

    type Period = { start: string; end: string; due: string };
    const mkNotice = async (ref: string, period: Period) => {
      const { data: n } = await supabase
        .from("levy_notices")
        .insert({
          subdivision_id: fx.subdivisionId,
          lot_id: newLotId,
          budget_id: fx.budgetId,
          reference_number: ref,
          fund_type: "administrative",
          levy_type: "regular",
          period_start: period.start,
          period_end: period.end,
          amount: LEVY_AMOUNT,
          due_date: period.due,
          status: "draft",
        })
        .select("id, reference_number")
        .single();
      assert(n, `S8 notice insert failed`);
      return n;
    };
    const { data: ref1 } = await supabase.rpc("next_reference_number", {
      p_prefix: "LEV",
      p_subdivision_id: fx.subdivisionId,
    });
    const { data: ref2 } = await supabase.rpc("next_reference_number", {
      p_prefix: "LEV",
      p_subdivision_id: fx.subdivisionId,
    });
    assert(ref1 && ref2, "S8 ref alloc failed");
    const n1 = await mkNotice(ref1 as string, OLDER);
    const n2 = await mkNotice(ref2 as string, NEWER);

    for (const [n, period] of [[n1, OLDER], [n2, NEWER]] as const) {
      await supabase.rpc("rpc_levy_debit", {
        p_subdivision_id: fx.subdivisionId,
        p_lot_id: newLotId,
        p_fund_type: "administrative",
        p_amount: LEVY_AMOUNT,
        p_entry_date: period.start,
        p_description: `S8 ${period.start}`,
        p_reference: n.reference_number,
        p_levy_notice_id: n.id,
        p_category: "levy",
        p_created_by: fx.profileId,
      });
    }

    // Targeted payment on the OLDER levy.
    await supabase.rpc("rpc_payment_credit", {
      p_subdivision_id: fx.subdivisionId,
      p_lot_id: newLotId,
      p_fund_type: "administrative",
      p_amount: LEVY_AMOUNT,
      p_entry_date: "2026-02-01",
      p_description: "S8 targeted on older",
      p_reference: n1.reference_number,
      p_levy_notice_id: n1.id,
      p_created_by: fx.profileId,
    });

    const after = await fetchState(newLotId);
    const balanceAfter = Number(after.admin_balance);
    // Derived: 2 × (-LEVY_AMOUNT) debits + 1 × (+LEVY_AMOUNT) credit = -LEVY_AMOUNT.
    const expectedBalance = initialBalance - 2 * LEVY_AMOUNT + LEVY_AMOUNT;
    assert(
      balanceAfter === expectedBalance,
      `S8 balance: expected ${expectedBalance}, got ${balanceAfter}`,
    );
    assert(
      after.oldest_unpaid_date_admin === NEWER.start,
      `S8 oldest_unpaid expected ${NEWER.start} (walker skipped fully-targeted older), got ${after.oldest_unpaid_date_admin}`,
    );
    record(header, true, `balance=${balanceAfter}, walker skipped older, oldest=${NEWER.start}`);
  } catch (e) {
    record(header, false, (e as Error).message);
  }
}

async function scenario9_WriteoffAdjustment(fx: Fixture) {
  const header = "S9: writeoff credit via rpc_ledger_adjustment — balance delta equals amount, audit logged";
  const WRITEOFF_AMOUNT = 100;
  try {
    const lotId = fx.lotIds[0];
    const before = await fetchState(lotId);
    const balanceBefore = Number(before.admin_balance);

    const { data: entryId, error: aErr } = await supabase.rpc("rpc_ledger_adjustment", {
      p_subdivision_id: fx.subdivisionId,
      p_lot_id: lotId,
      p_fund_type: "administrative",
      p_entry_type: "credit",
      p_category: "writeoff",
      p_amount: WRITEOFF_AMOUNT,
      p_entry_date: "2026-08-15",
      p_description: "S9 goodwill writeoff",
      p_created_by: fx.profileId,
    });
    assert(!aErr && typeof entryId === "string", `rpc_ledger_adjustment failed: ${aErr?.message}`);

    const after = await fetchState(lotId);
    const balanceAfter = Number(after.admin_balance);
    const expectedAfter = balanceBefore + WRITEOFF_AMOUNT;
    assert(
      balanceAfter === expectedAfter,
      `S9 balance delta: expected ${balanceBefore} + ${WRITEOFF_AMOUNT} = ${expectedAfter}, got ${balanceAfter}`,
    );

    const { data: audit } = await supabase
      .from("audit_log")
      .select("action, entity_type, entity_id")
      .eq("entity_id", entryId)
      .eq("action", "ledger.adjustment.created")
      .limit(1);
    assert(audit && audit.length === 1, `S9 expected audit_log row, got ${audit?.length}`);
    record(header, true, `delta=+${WRITEOFF_AMOUNT} (${balanceBefore}→${balanceAfter}), audit logged`);
  } catch (e) {
    record(header, false, (e as Error).message);
  }
}

// ───────── PP4-A: priority-aware walker + payment-status snapshot ─────────

// Helper: insert a fresh lot for a clean ledger state. Caller passes a unique
// lot_number to avoid the (subdivision_id, lot_number) UNIQUE.
async function makeFreshLot(fx: Fixture, lotNumber: number): Promise<string> {
  const { data, error } = await supabase
    .from("lots")
    .insert({
      subdivision_id: fx.subdivisionId,
      lot_number: lotNumber,
      lot_entitlement: 100,
      lot_liability: 100,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`makeFreshLot: ${error?.message}`);
  return data.id;
}

// Helper: insert a levy_notice row directly (bypasses batch). Returns id.
async function makeNotice(
  fx: Fixture,
  lotId: string,
  opts: {
    levyType: "regular" | "special";
    amount: number;
    periodStart: string;
    periodEnd: string;
    dueDate: string;
  },
): Promise<{ id: string; reference: string }> {
  const { data: ref } = await supabase.rpc("next_reference_number", {
    p_prefix: "LEV",
    p_subdivision_id: fx.subdivisionId,
  });
  if (!ref) throw new Error("makeNotice: next_reference_number returned null");
  const { data, error } = await supabase
    .from("levy_notices")
    .insert({
      subdivision_id: fx.subdivisionId,
      lot_id: lotId,
      budget_id: fx.budgetId,
      reference_number: ref as string,
      fund_type: "administrative",
      levy_type: opts.levyType,
      period_start: opts.periodStart,
      period_end: opts.periodEnd,
      amount: opts.amount,
      due_date: opts.dueDate,
      status: "draft",
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`makeNotice: ${error?.message}`);
  return { id: data.id, reference: ref as string };
}

async function scenario10_PriorityAwareWalker(fx: Fixture) {
  const header =
    "S10: priority-aware walker — special_levy outstanding behind newer regular levy";
  try {
    // Test setup distinguishes priority-aware from date-only:
    //   - Special levy ($300, 2026-01-01) — older but lower priority (3)
    //   - Regular levy ($500, 2026-12-01) — newer, higher priority (2)
    //   - Untargeted credit ($500)
    // Date-only walk:    visits Jan first → covers special → 200 left → can't cover Dec → oldest=Dec
    // Priority-aware:    visits Dec first (pri 2) → covers regular → 0 left → can't cover Jan → oldest=Jan
    // Test asserts oldest_unpaid_date = special's date (2026-01-01) → only passes with priority-aware.

    const lotId = await makeFreshLot(fx, 200);

    const reg = await makeNotice(fx, lotId, {
      levyType: "regular",
      amount: 500,
      periodStart: "2026-12-01",
      periodEnd: "2026-12-31",
      dueDate: "2026-12-28",
    });
    const spec = await makeNotice(fx, lotId, {
      levyType: "special",
      amount: 300,
      periodStart: "2026-01-01",
      periodEnd: "2026-01-31",
      dueDate: "2026-01-28",
    });

    // Direct INSERT into lot_ledger_entries with explicit allocation_priority.
    // The PP4-A schema delta added the column + backfilled existing rows but
    // did NOT add a BEFORE-INSERT trigger to derive priority from category on
    // new rows — see PRE_LAUNCH_CLEANUP for the trigger / per-RPC fix.
    await supabase.from("lot_ledger_entries").insert([
      {
        subdivision_id: fx.subdivisionId,
        lot_id: lotId,
        fund_type: "administrative",
        entry_type: "debit",
        category: "levy",
        amount: 500,
        entry_date: "2026-12-01",
        description: "S10 regular levy",
        reference: reg.reference,
        levy_notice_id: reg.id,
        status: "active",
        created_by: fx.profileId,
        allocation_priority: 2,
      },
      {
        subdivision_id: fx.subdivisionId,
        lot_id: lotId,
        fund_type: "administrative",
        entry_type: "debit",
        category: "special_levy",
        amount: 300,
        entry_date: "2026-01-01",
        description: "S10 special levy",
        reference: spec.reference,
        levy_notice_id: spec.id,
        status: "active",
        created_by: fx.profileId,
        allocation_priority: 3,
      },
      {
        subdivision_id: fx.subdivisionId,
        lot_id: lotId,
        fund_type: "administrative",
        entry_type: "credit",
        category: "adjustment_credit",
        amount: 500,
        entry_date: "2026-06-01",
        description: "S10 free credit",
        status: "active",
        created_by: fx.profileId,
        allocation_priority: 2,
      },
    ]);

    // Trigger walker recompute.
    const { error: rcErr } = await supabase.rpc("recompute_lot_ledger_state", {
      p_lot_id: lotId,
    });
    assert(!rcErr, `S10 recompute failed: ${rcErr?.message}`);

    const state = await fetchState(lotId);
    assert(state, "S10 state row missing");
    assert(
      state.oldest_unpaid_date_admin === "2026-01-01",
      `S10 expected oldest_unpaid=2026-01-01 (special's date), got ${state.oldest_unpaid_date_admin}`,
    );

    // Sanity: total balance = 500 (credit) − 800 (debits) = -300.
    assert(
      Number(state.admin_balance) === -300,
      `S10 expected admin_balance=-300, got ${state.admin_balance}`,
    );

    record(
      header,
      true,
      `walker absorbed regular levy (priority 2), special levy remains outstanding (oldest_unpaid=2026-01-01); date-only walk would have returned 2026-12-01`,
    );
  } catch (e) {
    record(header, false, (e as Error).message);
  }
}

async function scenario11_PaymentStatusPaid(fx: Fixture) {
  const header = "S11: computeLevyPaymentStatus — fully paid notice → 'paid'";
  try {
    const lotId = await makeFreshLot(fx, 210);
    const notice = await makeNotice(fx, lotId, {
      levyType: "regular",
      amount: 500,
      periodStart: "2026-01-01",
      periodEnd: "2026-01-31",
      dueDate: "2026-01-28",
    });

    await supabase.from("lot_ledger_entries").insert([
      {
        subdivision_id: fx.subdivisionId,
        lot_id: lotId,
        fund_type: "administrative",
        entry_type: "debit",
        category: "levy",
        amount: 500,
        entry_date: "2026-01-01",
        reference: notice.reference,
        levy_notice_id: notice.id,
        status: "active",
        created_by: fx.profileId,
      },
      {
        subdivision_id: fx.subdivisionId,
        lot_id: lotId,
        fund_type: "administrative",
        entry_type: "credit",
        category: "payment",
        amount: 500,
        entry_date: "2026-02-15",
        reference: notice.reference,
        levy_notice_id: notice.id,
        status: "active",
        created_by: fx.profileId,
      },
    ]);

    const { computeLevyPaymentStatus } = await import(
      "../reconciliation/payment-status"
    );
    const rows = await computeLevyPaymentStatus(lotId, "2026-03-01");
    assert(rows.length === 1, `S11 expected 1 row, got ${rows.length}`);
    const r = rows[0];
    assert(r.status === "paid", `S11 status expected paid, got ${r.status}`);
    assert(
      r.paid_amount === 500,
      `S11 paid_amount expected 500, got ${r.paid_amount}`,
    );
    assert(
      r.outstanding_amount === 0,
      `S11 outstanding expected 0, got ${r.outstanding_amount}`,
    );
    assert(
      r.paid_date === "2026-02-15",
      `S11 paid_date expected 2026-02-15, got ${r.paid_date}`,
    );

    record(
      header,
      true,
      `notice ${notice.reference}: status=paid, paid_amount=500, paid_date=2026-02-15`,
    );
  } catch (e) {
    record(header, false, (e as Error).message);
  }
}

async function scenario12_PaymentStatusPartial(fx: Fixture) {
  const header =
    "S12: computeLevyPaymentStatus — partial credit → 'partially_paid'";
  try {
    const lotId = await makeFreshLot(fx, 220);
    const notice = await makeNotice(fx, lotId, {
      levyType: "regular",
      amount: 500,
      periodStart: "2026-01-01",
      periodEnd: "2026-01-31",
      dueDate: "2026-01-28",
    });

    await supabase.from("lot_ledger_entries").insert([
      {
        subdivision_id: fx.subdivisionId,
        lot_id: lotId,
        fund_type: "administrative",
        entry_type: "debit",
        category: "levy",
        amount: 500,
        entry_date: "2026-01-01",
        reference: notice.reference,
        levy_notice_id: notice.id,
        status: "active",
        created_by: fx.profileId,
      },
      {
        subdivision_id: fx.subdivisionId,
        lot_id: lotId,
        fund_type: "administrative",
        entry_type: "credit",
        category: "payment",
        amount: 300,
        entry_date: "2026-02-15",
        reference: notice.reference,
        levy_notice_id: notice.id,
        status: "active",
        created_by: fx.profileId,
      },
    ]);

    const { computeLevyPaymentStatus } = await import(
      "../reconciliation/payment-status"
    );
    const rows = await computeLevyPaymentStatus(lotId, "2026-03-01");
    assert(rows.length === 1, `S12 expected 1 row, got ${rows.length}`);
    const r = rows[0];
    assert(
      r.status === "partially_paid",
      `S12 status expected partially_paid, got ${r.status}`,
    );
    assert(r.paid_amount === 300, `S12 paid_amount expected 300, got ${r.paid_amount}`);
    assert(
      r.outstanding_amount === 200,
      `S12 outstanding expected 200, got ${r.outstanding_amount}`,
    );
    assert(
      r.paid_date === null,
      `S12 paid_date expected null (notice not fully paid), got ${r.paid_date}`,
    );

    record(
      header,
      true,
      `notice ${notice.reference}: status=partially_paid, paid_amount=300, outstanding=200, paid_date=null`,
    );
  } catch (e) {
    record(header, false, (e as Error).message);
  }
}

async function scenario13_PaymentStatusOutstanding(fx: Fixture) {
  const header =
    "S13: computeLevyPaymentStatus — no credits → 'outstanding'";
  try {
    const lotId = await makeFreshLot(fx, 230);
    const notice = await makeNotice(fx, lotId, {
      levyType: "regular",
      amount: 500,
      periodStart: "2026-01-01",
      periodEnd: "2026-01-31",
      dueDate: "2026-01-28",
    });

    await supabase.from("lot_ledger_entries").insert({
      subdivision_id: fx.subdivisionId,
      lot_id: lotId,
      fund_type: "administrative",
      entry_type: "debit",
      category: "levy",
      amount: 500,
      entry_date: "2026-01-01",
      reference: notice.reference,
      levy_notice_id: notice.id,
      status: "active",
      created_by: fx.profileId,
    });

    const { computeLevyPaymentStatus } = await import(
      "../reconciliation/payment-status"
    );
    const rows = await computeLevyPaymentStatus(lotId, "2026-03-01");
    assert(rows.length === 1, `S13 expected 1 row, got ${rows.length}`);
    const r = rows[0];
    assert(
      r.status === "outstanding",
      `S13 status expected outstanding, got ${r.status}`,
    );
    assert(r.paid_amount === 0, `S13 paid_amount expected 0, got ${r.paid_amount}`);
    assert(
      r.outstanding_amount === 500,
      `S13 outstanding expected 500, got ${r.outstanding_amount}`,
    );
    assert(r.paid_date === null, `S13 paid_date expected null, got ${r.paid_date}`);

    record(header, true, `notice ${notice.reference}: status=outstanding, paid=0, outstanding=500`);
  } catch (e) {
    record(header, false, (e as Error).message);
  }
}

async function scenario15_KeywordAmountPriorityWalker(fx: Fixture) {
  const header =
    "S15: Strategy 4 (keyword+amount) routes $500 to keyword-tagged regular levy; special_levy remains outstanding";
  try {
    // Setup:
    //   - Fresh lot.
    //   - Bank account (admin fund).
    //   - Two batches in this subdivision:
    //       * batch_A with match_keywords=['gardening']
    //       * batch_B with match_keywords=['painting']
    //   - Two notices, both $500, both administrative:
    //       * notice_admin: regular, in batch_A
    //       * notice_special: special, in batch_B
    //   - Two debits (regular + special), both outstanding $500.
    //
    // Action: insert a manual bank_transaction $500 with description
    //   "GARDENING SERVICES" and run tryAutoMatch.
    //
    // Expectation:
    //   - Strategy 4 hits batch_A (keyword 'gardening'), narrows to
    //     notice_admin (amount $500), allocates $500 to it.
    //   - Outcome: matched=true, strategy='keyword_amount'.
    //   - notice_admin paid; notice_special still outstanding.
    //   - Walker computes oldest_unpaid = special's date (the only
    //     remaining outstanding debit).

    const lotId = await makeFreshLot(fx, 250);

    const { data: bankAccount } = await supabase
      .from("bank_accounts")
      .insert({
        subdivision_id: fx.subdivisionId,
        account_name: "S15 Admin",
        bsb: "012-345",
        account_number: "11111111",
        fund_type: "administrative",
      })
      .select("id")
      .single();
    assert(bankAccount, "S15 bank_account insert failed");

    const { data: batchA } = await supabase
      .from("levy_batches")
      .insert({
        subdivision_id: fx.subdivisionId,
        budget_id: fx.budgetId,
        financial_year: "2026-2027",
        fund_type: "administrative",
        period_start: "2026-04-01",
        period_end: "2026-06-30",
        period_label: "S15 Q-A",
        due_date: "2026-04-28",
        total_amount: 500,
        levy_count: 1,
        status: "draft",
        generated_by: fx.profileId,
        match_keywords: ["gardening"],
      })
      .select("id")
      .single();
    const { data: batchB } = await supabase
      .from("levy_batches")
      .insert({
        subdivision_id: fx.subdivisionId,
        budget_id: fx.budgetId,
        financial_year: "2026-2027",
        fund_type: "administrative",
        period_start: "2026-01-01",
        period_end: "2026-03-31",
        period_label: "S15 Q-B",
        due_date: "2026-01-28",
        total_amount: 500,
        levy_count: 1,
        status: "draft",
        generated_by: fx.profileId,
        match_keywords: ["painting"],
      })
      .select("id")
      .single();
    assert(batchA && batchB, "S15 batch insert failed");

    const { data: refAdmin } = await supabase.rpc("next_reference_number", {
      p_prefix: "LEV",
      p_subdivision_id: fx.subdivisionId,
    });
    const { data: refSpecial } = await supabase.rpc("next_reference_number", {
      p_prefix: "LEV",
      p_subdivision_id: fx.subdivisionId,
    });
    const { data: noticeAdmin } = await supabase
      .from("levy_notices")
      .insert({
        subdivision_id: fx.subdivisionId,
        lot_id: lotId,
        budget_id: fx.budgetId,
        batch_id: batchA.id,
        reference_number: refAdmin as string,
        fund_type: "administrative",
        levy_type: "regular",
        period_start: "2026-04-01",
        period_end: "2026-06-30",
        amount: 500,
        due_date: "2026-04-28",
        status: "draft",
      })
      .select("id")
      .single();
    const { data: noticeSpecial } = await supabase
      .from("levy_notices")
      .insert({
        subdivision_id: fx.subdivisionId,
        lot_id: lotId,
        budget_id: fx.budgetId,
        batch_id: batchB.id,
        reference_number: refSpecial as string,
        fund_type: "administrative",
        levy_type: "special",
        period_start: "2026-01-01",
        period_end: "2026-03-31",
        amount: 500,
        due_date: "2026-01-28",
        status: "draft",
      })
      .select("id")
      .single();
    assert(noticeAdmin && noticeSpecial, "S15 notice insert failed");

    // Debits via direct insert. The PP4-A trigger derives
    // allocation_priority from category (levy=2, special_levy=3).
    await supabase.from("lot_ledger_entries").insert([
      {
        subdivision_id: fx.subdivisionId,
        lot_id: lotId,
        fund_type: "administrative",
        entry_type: "debit",
        category: "levy",
        amount: 500,
        entry_date: "2026-04-01",
        reference: refAdmin as string,
        levy_notice_id: noticeAdmin.id,
        status: "active",
        created_by: fx.profileId,
      },
      {
        subdivision_id: fx.subdivisionId,
        lot_id: lotId,
        fund_type: "administrative",
        entry_type: "debit",
        category: "special_levy",
        amount: 500,
        entry_date: "2026-01-01",
        reference: refSpecial as string,
        levy_notice_id: noticeSpecial.id,
        status: "active",
        created_by: fx.profileId,
      },
    ]);

    // Insert bank_transaction (credit, $500).
    const { data: bt } = await supabase
      .from("bank_transactions")
      .insert({
        bank_account_id: bankAccount.id,
        source: "manual",
        transaction_date: "2026-04-15",
        amount: 500,
        description: "GARDENING SERVICES PAID",
        match_status: "unmatched",
      })
      .select("id")
      .single();
    assert(bt, "S15 bank_transaction insert failed");

    // Run the orchestrator (dynamic import — orchestrator pulls in supabase
    // client which uses env vars already in scope).
    const { tryAutoMatch } = await import(
      "../reconciliation/orchestrator"
    );
    const outcome = await tryAutoMatch({
      bankTransactionId: bt.id,
      subdivisionId: fx.subdivisionId,
      bankAccountId: bankAccount.id,
      description: "GARDENING SERVICES PAID",
      amount: 500,
      transactionDate: "2026-04-15",
      performedBy: fx.profileId,
    });

    assert(
      outcome.matched,
      `S15 expected matched=true, got ${JSON.stringify(outcome)}`,
    );
    assert(
      outcome.strategy === "keyword_amount",
      `S15 expected strategy=keyword_amount, got ${outcome.strategy}`,
    );

    // Verify allocation went to noticeAdmin (regular).
    const { data: matches } = await supabase
      .from("reconciliation_matches")
      .select("ledger_entry_id, review_required")
      .eq("bank_transaction_id", bt.id);
    assert(matches?.length === 1, `S15 expected 1 match, got ${matches?.length}`);
    assert(
      matches[0].review_required === true,
      `S15 expected review_required=true (amount-based confidence)`,
    );

    const { data: matchedCredit } = await supabase
      .from("lot_ledger_entries")
      .select("levy_notice_id, amount")
      .eq("id", matches[0].ledger_entry_id)
      .single();
    assert(
      matchedCredit?.levy_notice_id === noticeAdmin.id,
      `S15 expected match against noticeAdmin (regular), got ${matchedCredit?.levy_notice_id}`,
    );

    // Walker after match: notice_special is the only outstanding debit;
    // oldest_unpaid_date = its entry_date (2026-01-01).
    const state = await fetchState(lotId);
    assert(state, "S15 state row missing");
    assert(
      state.oldest_unpaid_date_admin === "2026-01-01",
      `S15 expected oldest_unpaid_date_admin=2026-01-01 (special's date), got ${state.oldest_unpaid_date_admin}`,
    );

    record(
      header,
      true,
      `Strategy 4 routed $500 to regular levy via 'gardening' keyword; special_levy remains outstanding (oldest=2026-01-01)`,
    );
  } catch (e) {
    record(header, false, (e as Error).message);
  }
}

async function scenario14_PaymentStatusVoidAfterAsOfDate(fx: Fixture) {
  const header =
    "S14: computeLevyPaymentStatus — credit voided AFTER asOfDate appears active in snapshot";
  try {
    const lotId = await makeFreshLot(fx, 240);
    const notice = await makeNotice(fx, lotId, {
      levyType: "regular",
      amount: 500,
      periodStart: "2025-01-01",
      periodEnd: "2025-01-31",
      dueDate: "2025-01-28",
    });

    // Insert debit + credit (both with entry_date in 2025).
    const { data: inserted } = await supabase
      .from("lot_ledger_entries")
      .insert([
        {
          subdivision_id: fx.subdivisionId,
          lot_id: lotId,
          fund_type: "administrative",
          entry_type: "debit",
          category: "levy",
          amount: 500,
          entry_date: "2025-01-01",
          reference: notice.reference,
          levy_notice_id: notice.id,
          status: "active",
          created_by: fx.profileId,
        },
        {
          subdivision_id: fx.subdivisionId,
          lot_id: lotId,
          fund_type: "administrative",
          entry_type: "credit",
          category: "payment",
          amount: 500,
          entry_date: "2025-03-01",
          reference: notice.reference,
          levy_notice_id: notice.id,
          status: "active",
          created_by: fx.profileId,
        },
      ])
      .select("id, entry_type");

    const creditRow = (inserted ?? []).find((r) => r.entry_type === "credit");
    assert(creditRow, "S14 credit row missing");

    // Void the credit. rpc_ledger_void sets voided_at = NOW() (today's date,
    // which is well after asOfDate 2025-06-01).
    const { error: vErr } = await supabase.rpc("rpc_ledger_void", {
      p_entry_id: creditRow.id,
      p_reason: "S14: void after asOfDate snapshot",
      p_voided_by: fx.profileId,
    });
    assert(!vErr, `S14 void failed: ${vErr?.message}`);

    // Snapshot at 2025-06-01: credit voided_at::date (today) > 2025-06-01 →
    // credit visible in snapshot → notice paid.
    const { computeLevyPaymentStatus } = await import(
      "../reconciliation/payment-status"
    );
    const rows = await computeLevyPaymentStatus(lotId, "2025-06-01");
    assert(rows.length === 1, `S14 expected 1 row, got ${rows.length}`);
    const r = rows[0];
    assert(
      r.status === "paid",
      `S14 expected status=paid (credit visible in snapshot), got ${r.status}`,
    );
    assert(
      r.paid_amount === 500,
      `S14 expected paid_amount=500 (snapshot-aware), got ${r.paid_amount}`,
    );
    assert(
      r.outstanding_amount === 0,
      `S14 expected outstanding=0 in snapshot, got ${r.outstanding_amount}`,
    );

    // Sanity: at asOfDate AFTER void (today), the credit is excluded — notice
    // should be back to outstanding.
    const today = new Date().toISOString().slice(0, 10);
    const todayRows = await computeLevyPaymentStatus(lotId, today);
    const todayRow = todayRows[0];
    assert(
      todayRow.status === "outstanding",
      `S14 (today) expected status=outstanding (void in past), got ${todayRow.status}`,
    );

    record(
      header,
      true,
      `at asOfDate=2025-06-01: credit visible (paid_amount=500); at today: credit excluded (outstanding=500)`,
    );
  } catch (e) {
    record(header, false, (e as Error).message);
  }
}

// ───────── Cleanup ─────────

async function cleanupMarker() {
  console.log(`\nCleaning up test data with marker "${VERIFY_MARKER}"`);
  // Find all test management companies
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
  // Find subdivisions, lots, bank accounts under this company
  const { data: subs } = await supabase.from("subdivisions").select("id").eq("management_company_id", companyId);
  const subIds = (subs ?? []).map((s) => s.id);

  if (subIds.length > 0) {
    const { data: lots } = await supabase.from("lots").select("id").in("subdivision_id", subIds);
    const lotIds = (lots ?? []).map((l) => l.id);

    const { data: accounts } = await supabase.from("bank_accounts").select("id").in("subdivision_id", subIds);
    const accountIds = (accounts ?? []).map((a) => a.id);

    // 1. reconciliation_matches
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

    // 2. Null out self-references in lot_ledger_entries, then delete
    if (lotIds.length > 0) {
      await supabase
        .from("lot_ledger_entries")
        .update({ voided_by_entry_id: null, voids_entry_id: null })
        .in("lot_id", lotIds);
      await supabase.from("lot_ledger_entries").delete().in("lot_id", lotIds);
    }

    // 3. lot_ledger_state (cascades from lot deletion, but delete explicitly to be sure)
    if (lotIds.length > 0) {
      await supabase.from("lot_ledger_state").delete().in("lot_id", lotIds);
    }

    // 4. bank_transactions
    if (accountIds.length > 0) {
      await supabase.from("bank_transactions").delete().in("bank_account_id", accountIds);
    }

    // 5. payments
    await supabase.from("payments").delete().in("subdivision_id", subIds);

    // 6. levy_notice_items, levy_notices, levy_batches
    const { data: notices } = await supabase.from("levy_notices").select("id").in("subdivision_id", subIds);
    const noticeIds = (notices ?? []).map((n) => n.id);
    if (noticeIds.length > 0) {
      await supabase.from("levy_notice_items").delete().in("levy_notice_id", noticeIds);
      // Clear linked_levy_id self-reference if any
      await supabase.from("levy_notices").update({ linked_levy_id: null }).in("subdivision_id", subIds);
      await supabase.from("levy_notices").delete().in("subdivision_id", subIds);
    }
    await supabase.from("levy_batches").delete().in("subdivision_id", subIds);

    // 7. Subdivision delete — cascades lots, budgets, bank_accounts, etc.
    await supabase.from("subdivisions").delete().in("id", subIds);
  }

  // 8. Profiles associated with this company (by management_company_id)
  await supabase.from("profiles").delete().eq("management_company_id", companyId);

  // 9. Company itself
  await supabase.from("management_companies").delete().eq("id", companyId);
}

// ───────── Main ─────────

async function main() {
  const cleanupOnly = process.argv.includes("--cleanup");
  const noCleanup = process.argv.includes("--no-cleanup");

  if (cleanupOnly) {
    await cleanupMarker();
    process.exit(0);
  }

  console.log("Ledger verification — Prompt 1 + PP4-A scenarios\n");

  // Pre-clean any stale runs
  await cleanupMarker();

  const fx = await createFixture();

  try {
    const s1 = await scenario1_BatchDebits(fx);
    await scenario2_FullPayment(fx, s1);
    await scenario3_PartialPayment(fx, s1);
    await scenario4_OldestUnpaidAdvances(fx, s1);
    await scenario5_VoidLevyDebit(fx, s1);
    await scenario6_VoidAlreadyVoided(fx);
    await scenario7_DuplicateLevyDebit(fx, s1);
    await scenario8_ExplicitReferencePayment(fx);
    await scenario9_WriteoffAdjustment(fx);
    await scenario10_PriorityAwareWalker(fx);
    await scenario11_PaymentStatusPaid(fx);
    await scenario12_PaymentStatusPartial(fx);
    await scenario13_PaymentStatusOutstanding(fx);
    await scenario14_PaymentStatusVoidAfterAsOfDate(fx);
    await scenario15_KeywordAmountPriorityWalker(fx);
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
