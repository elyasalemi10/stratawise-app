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

config({ path: ".env.local" });

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
      clerk_id: clerkId,
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
    const { data: ref } = await supabase.rpc("next_reference_number", { prefix: "LEV" });
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
    const { data: ref1 } = await supabase.rpc("next_reference_number", { prefix: "LEV" });
    const { data: ref2 } = await supabase.rpc("next_reference_number", { prefix: "LEV" });
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

  console.log("Ledger verification — Prompt 1 scenarios\n");

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
