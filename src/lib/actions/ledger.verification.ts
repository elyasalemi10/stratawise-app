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
  const { data: lots, error: lotsErr } = await supabase.from("lots").insert(lotRows).select("id").order("lot_number");
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

async function scenario1_BatchDebits(fx: Fixture) {
  const header = "S1: levy batch with 3 lots writes 3 debits + state balance/oldest_unpaid_date";
  try {
    const { batchId, noticeIds } = await makeLevyBatch(fx, {
      periodStart: "2026-07-01",
      periodEnd: "2026-09-30",
      dueDate: "2026-07-28",
      amountPerLot: 500,
      label: "S1 Q1",
    });
    const { error: rpcErr } = await supabase.rpc("rpc_levy_batch_debit", {
      p_batch_id: batchId,
      p_created_by: fx.profileId,
    });
    assert(!rpcErr, `rpc_levy_batch_debit failed: ${rpcErr?.message}`);

    for (const lotId of fx.lotIds) {
      const state = await fetchState(lotId);
      assert(state !== null, `state row missing for ${lotId}`);
      assert(Number(state.admin_balance) === -500, `S1 admin_balance expected -500, got ${state.admin_balance}`);
      assert(state.oldest_unpaid_date_admin === "2026-07-01", `S1 oldest_unpaid mismatch: ${state.oldest_unpaid_date_admin}`);
    }

    const { data: batch } = await supabase.from("levy_batches").select("status").eq("id", batchId).single();
    assert(batch?.status === "ledger_written", `S1 batch status expected ledger_written, got ${batch?.status}`);

    record(header, true, `3 debits written, balances correct, batch→ledger_written (noticeIds=${noticeIds.length})`);
    return { batchId, noticeIds };
  } catch (e) {
    record(header, false, (e as Error).message);
    throw e;
  }
}

async function scenario2_FullPayment(fx: Fixture) {
  const header = "S2: full payment brings balance to 0 and oldest_unpaid_date to null";
  try {
    const lotId = fx.lotIds[0];
    const { error: pErr } = await supabase.rpc("rpc_payment_credit", {
      p_subdivision_id: fx.subdivisionId,
      p_lot_id: lotId,
      p_fund_type: "administrative",
      p_amount: 500,
      p_entry_date: "2026-07-15",
      p_description: "S2 full payment",
      p_reference: null,
      p_levy_notice_id: null,
      p_created_by: fx.profileId,
    });
    assert(!pErr, `rpc_payment_credit failed: ${pErr?.message}`);

    const s = await fetchState(lotId);
    assert(Number(s.admin_balance) === 0, `S2 balance expected 0, got ${s.admin_balance}`);
    assert(s.oldest_unpaid_date_admin === null, `S2 oldest_unpaid expected null, got ${s.oldest_unpaid_date_admin}`);
    record(header, true, `balance=0, oldest_unpaid=null`);
  } catch (e) {
    record(header, false, (e as Error).message);
  }
}

async function scenario3_PartialPayment(fx: Fixture) {
  const header = "S3: partial payment reduces balance but preserves oldest_unpaid_date";
  try {
    const lotId = fx.lotIds[1];
    const { error: pErr } = await supabase.rpc("rpc_payment_credit", {
      p_subdivision_id: fx.subdivisionId,
      p_lot_id: lotId,
      p_fund_type: "administrative",
      p_amount: 200,
      p_entry_date: "2026-07-20",
      p_description: "S3 partial payment",
      p_reference: null,
      p_levy_notice_id: null,
      p_created_by: fx.profileId,
    });
    assert(!pErr, `rpc_payment_credit failed: ${pErr?.message}`);

    const s = await fetchState(lotId);
    assert(Number(s.admin_balance) === -300, `S3 balance expected -300, got ${s.admin_balance}`);
    assert(s.oldest_unpaid_date_admin === "2026-07-01", `S3 oldest_unpaid expected 2026-07-01, got ${s.oldest_unpaid_date_admin}`);
    record(header, true, `balance=-300, oldest_unpaid preserved`);
  } catch (e) {
    record(header, false, (e as Error).message);
  }
}

async function scenario4_OldestUnpaidAdvances(fx: Fixture) {
  const header = "S4: two levies, pay enough to cover first → oldest_unpaid_date advances to second";
  try {
    const lotId = fx.lotIds[2];
    // lotId[2] already has S1 debit of 500 on 2026-07-01, balance -500, oldest 2026-07-01

    // Add a second batch with a later period_start
    const { batchId } = await makeLevyBatch(fx, {
      periodStart: "2026-10-01",
      periodEnd: "2026-12-31",
      dueDate: "2026-10-28",
      amountPerLot: 400,
      label: "S4 Q2",
    });
    const { error: rpcErr } = await supabase.rpc("rpc_levy_batch_debit", {
      p_batch_id: batchId,
      p_created_by: fx.profileId,
    });
    assert(!rpcErr, `rpc_levy_batch_debit Q2 failed: ${rpcErr?.message}`);

    // After 2nd batch, lotId[2] has debits: 500 on 07-01 AND 400 on 10-01. total -900.
    // Pay exactly 500 → should cover first debit entirely → oldest_unpaid advances to 10-01
    const { error: pErr } = await supabase.rpc("rpc_payment_credit", {
      p_subdivision_id: fx.subdivisionId,
      p_lot_id: lotId,
      p_fund_type: "administrative",
      p_amount: 500,
      p_entry_date: "2026-08-01",
      p_description: "S4 covers first levy",
      p_reference: null,
      p_levy_notice_id: null,
      p_created_by: fx.profileId,
    });
    assert(!pErr, `rpc_payment_credit failed: ${pErr?.message}`);

    const s = await fetchState(lotId);
    assert(Number(s.admin_balance) === -400, `S4 balance expected -400, got ${s.admin_balance}`);
    assert(s.oldest_unpaid_date_admin === "2026-10-01", `S4 oldest_unpaid expected 2026-10-01, got ${s.oldest_unpaid_date_admin}`);
    record(header, true, `balance=-400, oldest_unpaid advanced to 2026-10-01`);
  } catch (e) {
    record(header, false, (e as Error).message);
  }
}

async function scenario5_VoidLevyDebit(fx: Fixture, s1NoticeIds: string[]) {
  const header = "S5: void a levy debit → offset entry → balance 0 → levy_notices.status=written_off";
  try {
    // Use lot[1] — it had S1 debit of 500 and partial payment of 200 (balance -300)
    // Find its debit entry
    const lotId = fx.lotIds[1];
    const s1NoticeIdForLot = s1NoticeIds[1];
    const { data: debits } = await supabase
      .from("lot_ledger_entries")
      .select("id, levy_notice_id")
      .eq("lot_id", lotId)
      .eq("entry_type", "debit")
      .eq("category", "levy")
      .eq("status", "active");
    assert(debits && debits.length === 1, `S5 setup: expected 1 active debit for lot[1], got ${debits?.length}`);
    const entryId = debits[0].id;
    assert(debits[0].levy_notice_id === s1NoticeIdForLot, `S5 setup: debit not linked to expected levy_notice`);

    const { data: offsetId, error: vErr } = await supabase.rpc("rpc_ledger_void", {
      p_entry_id: entryId,
      p_reason: "S5 test void",
      p_voided_by: fx.profileId,
    });
    assert(!vErr, `rpc_ledger_void failed: ${vErr?.message}`);
    assert(typeof offsetId === "string", `S5 expected offset uuid, got ${offsetId}`);

    // Check: original voided, offset exists, balance is now +200 (credit remains, debit voided)
    const { data: original } = await supabase.from("lot_ledger_entries").select("status, voided_by_entry_id, void_reason").eq("id", entryId).single();
    assert(original?.status === "voided", `S5 original not marked voided`);
    assert(original?.voided_by_entry_id === offsetId, `S5 voided_by_entry_id mismatch`);

    const { data: offsetEntry } = await supabase.from("lot_ledger_entries").select("category, entry_type, voids_entry_id").eq("id", offsetId).single();
    assert(offsetEntry?.category === "void_offset", `S5 offset category wrong`);
    assert(offsetEntry?.entry_type === "credit", `S5 offset should be credit (inverted from debit)`);
    assert(offsetEntry?.voids_entry_id === entryId, `S5 voids_entry_id mismatch`);

    const state = await fetchState(lotId);
    // Partial payment of 200 remains; debit is voided. Balance = +200.
    assert(Number(state.admin_balance) === 200, `S5 balance expected 200, got ${state.admin_balance}`);

    const { data: notice } = await supabase.from("levy_notices").select("status").eq("id", s1NoticeIdForLot).single();
    assert(notice?.status === "written_off", `S5 levy_notice status expected written_off, got ${notice?.status}`);

    record(header, true, `offset=${offsetId}, notice→written_off, balance=+200`);
  } catch (e) {
    record(header, false, (e as Error).message);
  }
}

async function scenario6_VoidAlreadyVoided(fx: Fixture) {
  const header = "S6: voiding an already-voided entry raises an error";
  try {
    // Reuse the voided entry from S5 (still on lot[1])
    const lotId = fx.lotIds[1];
    const { data: voided } = await supabase
      .from("lot_ledger_entries")
      .select("id")
      .eq("lot_id", lotId)
      .eq("status", "voided")
      .limit(1)
      .single();
    assert(voided?.id, `S6 setup: no voided entry found`);

    const { error: vErr } = await supabase.rpc("rpc_ledger_void", {
      p_entry_id: voided.id,
      p_reason: "second void attempt",
      p_voided_by: fx.profileId,
    });
    assert(vErr !== null, `S6 expected error but got none`);
    record(header, true, `error raised: ${vErr!.message.slice(0, 80)}`);
  } catch (e) {
    record(header, false, (e as Error).message);
  }
}

async function scenario7_DuplicateLevyDebit(fx: Fixture, s1NoticeIds: string[]) {
  const header = "S7: duplicate levy debit for same levy_notice_id returns existing id, no insert";
  try {
    // Pick a notice whose debit is still active (lot[0] — its debit wasn't voided).
    const lotId = fx.lotIds[0];
    const noticeId = s1NoticeIds[0];
    const { data: before } = await supabase
      .from("lot_ledger_entries")
      .select("id")
      .eq("levy_notice_id", noticeId)
      .eq("entry_type", "debit")
      .eq("status", "active");
    assert(before && before.length === 1, `S7 setup: expected exactly 1 active debit`);
    const existingId = before[0].id;

    const { data: returnedId, error: rErr } = await supabase.rpc("rpc_levy_debit", {
      p_subdivision_id: fx.subdivisionId,
      p_lot_id: lotId,
      p_fund_type: "administrative",
      p_amount: 500,
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
    assert(after && after.length === 1, `S7 expected still 1 active debit, got ${after?.length}`);
    record(header, true, `returned existing id, no duplicate insert`);
  } catch (e) {
    record(header, false, (e as Error).message);
  }
}

async function scenario8_ExplicitReferencePayment(fx: Fixture) {
  const header = "S8: payment with explicit ref to OLDER levy skips that levy in walker, oldest_unpaid = newer levy";
  try {
    // Use lot[2] — has active debits: 500 on 07-01 and 400 on 10-01, plus a free-pool
    // credit of 500 from S4 that consumed the 07-01 debit. Reset by adding a
    // fresh lot via another batch would be noisy; instead use another lot.
    //
    // Cleaner: create a new lot and a 2-period batch just for this scenario.
    // But we can also add a fresh lot[2] equivalent via a new batch set:
    //
    // Actually, lot[2] after S4 has: debits 500@07-01, 400@10-01; credits 500@08-01 (free).
    // Walker: free_pool=500. debit1 (500): no targeted → needs 500 from free → 0 left. debit2 (400): no free → return 10-01. So oldest=10-01.
    //
    // For S8, we need a pristine 2-debit lot. Let's create a new lot directly.
    const { data: newLot, error: lotErr } = await supabase
      .from("lots")
      .insert({ subdivision_id: fx.subdivisionId, lot_number: 100, lot_entitlement: 100, lot_liability: 100 })
      .select("id")
      .single();
    assert(!lotErr && newLot, `S8 setup lot insert failed: ${lotErr?.message}`);

    // Generate two levy notices on different dates directly
    const { data: ref1 } = await supabase.rpc("next_reference_number", { prefix: "LEV" });
    const { data: ref2 } = await supabase.rpc("next_reference_number", { prefix: "LEV" });
    assert(ref1 && ref2, "S8 ref num fetch failed");

    const { data: n1, error: n1Err } = await supabase
      .from("levy_notices")
      .insert({
        subdivision_id: fx.subdivisionId,
        lot_id: newLot.id,
        budget_id: fx.budgetId,
        reference_number: ref1!,
        fund_type: "administrative",
        levy_type: "regular",
        period_start: "2026-01-01",
        period_end: "2026-03-31",
        amount: 300,
        due_date: "2026-01-28",
        status: "draft",
      })
      .select("id, reference_number")
      .single();
    const { data: n2, error: n2Err } = await supabase
      .from("levy_notices")
      .insert({
        subdivision_id: fx.subdivisionId,
        lot_id: newLot.id,
        budget_id: fx.budgetId,
        reference_number: ref2!,
        fund_type: "administrative",
        levy_type: "regular",
        period_start: "2026-04-01",
        period_end: "2026-06-30",
        amount: 300,
        due_date: "2026-04-28",
        status: "draft",
      })
      .select("id, reference_number")
      .single();
    assert(!n1Err && !n2Err && n1 && n2, `S8 notice inserts failed`);

    await supabase.rpc("rpc_levy_debit", {
      p_subdivision_id: fx.subdivisionId,
      p_lot_id: newLot.id,
      p_fund_type: "administrative",
      p_amount: 300,
      p_entry_date: "2026-01-01",
      p_description: "S8 older levy",
      p_reference: n1.reference_number,
      p_levy_notice_id: n1.id,
      p_category: "levy",
      p_created_by: fx.profileId,
    });
    await supabase.rpc("rpc_levy_debit", {
      p_subdivision_id: fx.subdivisionId,
      p_lot_id: newLot.id,
      p_fund_type: "administrative",
      p_amount: 300,
      p_entry_date: "2026-04-01",
      p_description: "S8 newer levy",
      p_reference: n2.reference_number,
      p_levy_notice_id: n2.id,
      p_category: "levy",
      p_created_by: fx.profileId,
    });

    // Explicit-reference payment targeting the OLDER levy
    await supabase.rpc("rpc_payment_credit", {
      p_subdivision_id: fx.subdivisionId,
      p_lot_id: newLot.id,
      p_fund_type: "administrative",
      p_amount: 300,
      p_entry_date: "2026-02-01",
      p_description: "S8 targeted payment on older levy",
      p_reference: n1.reference_number,
      p_levy_notice_id: n1.id,
      p_created_by: fx.profileId,
    });

    const s = await fetchState(newLot.id);
    // Balance: credits=300, debits=600 → -300
    assert(Number(s.admin_balance) === -300, `S8 balance expected -300, got ${s.admin_balance}`);
    // Walker should skip older levy (fully targeted), then hit newer one (uncovered)
    assert(s.oldest_unpaid_date_admin === "2026-04-01", `S8 oldest_unpaid expected 2026-04-01 (newer levy), got ${s.oldest_unpaid_date_admin}`);
    record(header, true, `walker skipped targeted older levy; oldest=2026-04-01`);
  } catch (e) {
    record(header, false, (e as Error).message);
  }
}

async function scenario9_WriteoffAdjustment(fx: Fixture) {
  const header = "S9: writeoff adjustment adjusts balance and records audit_log entry";
  try {
    // Use lot[0] — balance currently -500 (original S1 debit, no payment on this lot).
    const lotId = fx.lotIds[0];
    const before = await fetchState(lotId);
    const beforeBalance = Number(before.admin_balance);

    const { data: entryId, error: aErr } = await supabase.rpc("rpc_ledger_adjustment", {
      p_subdivision_id: fx.subdivisionId,
      p_lot_id: lotId,
      p_fund_type: "administrative",
      p_entry_type: "credit",
      p_category: "writeoff",
      p_amount: 100,
      p_entry_date: "2026-08-15",
      p_description: "S9 goodwill writeoff",
      p_created_by: fx.profileId,
    });
    assert(!aErr && typeof entryId === "string", `rpc_ledger_adjustment failed: ${aErr?.message}`);

    const after = await fetchState(lotId);
    assert(Number(after.admin_balance) === beforeBalance + 100, `S9 balance mismatch: before=${beforeBalance}, after=${after.admin_balance}`);

    const { data: audit } = await supabase
      .from("audit_log")
      .select("action, entity_type, entity_id")
      .eq("entity_id", entryId)
      .eq("action", "ledger.adjustment.created")
      .limit(1);
    assert(audit && audit.length === 1, `S9 expected audit_log row for entry, got ${audit?.length}`);
    record(header, true, `balance delta=+100, audit logged`);
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
    const { noticeIds: s1Notices } = await scenario1_BatchDebits(fx);
    await scenario2_FullPayment(fx);
    await scenario3_PartialPayment(fx);
    await scenario4_OldestUnpaidAdvances(fx);
    await scenario5_VoidLevyDebit(fx, s1Notices);
    await scenario6_VoidAlreadyVoided(fx);
    await scenario7_DuplicateLevyDebit(fx, s1Notices);
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
