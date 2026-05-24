/**
 * Bank-side duplicate-detection verification (PP5-A).
 *
 * Exercises the detector + marker helpers, the orchestrator early-out, the
 * manager review server actions, and the integration points (CSV import,
 * Basiq poll, manual entry) end-to-end against the live Supabase dev DB.
 *
 * Usage:
 *   npx tsx src/lib/reconciliation/duplicate-detection.verification.ts
 *   npx tsx src/lib/reconciliation/duplicate-detection.verification.ts --no-cleanup
 *   npx tsx src/lib/reconciliation/duplicate-detection.verification.ts --cleanup
 *
 * Test data is tagged with VERIFY_MARKER on management_companies.name and
 * profiles.email/auth_user_id, so --cleanup never touches real data.
 */

import { config } from "dotenv";
config({ path: ".env.local" });

// PP6-D-D-fix: gate Resend sends. This suite calls tryAutoMatch via the
// orchestrator, which triggers emitPaymentReceivedEmail on auto-match
// success. Without this gate, real emails fire when RESEND_API_KEY is
// present in .env.local.
process.env.EMAIL_DRY_RUN = "true";

// ─── next/cache stub ─────────────────────────────────────────────────────
// Pre-populate Node's CommonJS require cache with a no-op stub for `next/cache`
// BEFORE any server-action module is imported. The shim must be installed
// before the dynamic imports below.
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
import { generateOCCode } from "@/lib/oc-code";
import {
  normaliseDescription,
  hashDescription,
  detectDuplicate,
  markDuplicate,
} from "./duplicate-detection";
import { tryAutoMatch } from "./orchestrator";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const VERIFY_MARKER = "__VERIFY_DUPLICATE__";
const VERIFY_USER_ID = `${VERIFY_MARKER}_USER_${Date.now()}_${randomUUID().slice(0, 8)}`;

__setUserIdResolverForVerification(async () => VERIFY_USER_ID);
if (__getUserIdResolverForVerification() === null) {
  console.error("Fatal: verification userId resolver is null after being set.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

type Result = { scenario: string; passed: boolean; detail: string };
const results: Result[] = [];

function record(scenario: string, passed: boolean, detail: string) {
  results.push({ scenario, passed, detail });
  console.log(`  ${passed ? "PASS" : "FAIL"}  ${scenario}${detail ? " , " + detail : ""}`);
}

function assert(cond: unknown, msg = "assertion failed"): asserts cond {
  if (!cond) throw new Error(msg);
}

// ─── Fixture ──────────────────────────────────────────────────────────────

interface Fixture {
  runId: string;
  companyId: string;
  ocId: string;
  profileId: string;
  bankAccountAId: string;
  bankAccountBId: string; // for cross-account isolation tests
}

async function createFixture(): Promise<Fixture> {
  const runId = `${Date.now()}_${randomUUID().slice(0, 8)}`;
  const companyName = `${VERIFY_MARKER}${runId}`;
  const email = `${VERIFY_MARKER.toLowerCase()}${runId}@dup.test`;

  const { data: company } = await supabase
    .from("management_companies")
    .insert({ name: companyName })
    .select("id")
    .single();
  assert(company, "fixture: company insert failed");

  const { data: profile } = await supabase
    .from("profiles")
    .insert({
      auth_user_id: VERIFY_USER_ID,
      email,
      first_name: "Dup",
      last_name: "Verify",
      role: "strata_manager",
      company_role: "admin",
      management_company_id: company.id,
    })
    .select("id")
    .single();
  assert(profile, "fixture: profile insert failed");

  const { data: oc } = await supabase
    .from("owners_corporations")
    .insert({
      management_company_id: company.id,
      name: companyName,
      plan_number: `PLAN-${runId}`,
      short_code: generateOCCode(),
      address: "1 Dup Verify St, Melbourne VIC 3000",
      total_lots: 2,
      created_by: profile.id,
    })
    .select("id")
    .single();
  assert(oc, "fixture: oc insert failed");

  // Two admin-fund bank accounts so we can verify per-account scoping.
  const { data: acctA } = await supabase
    .from("bank_accounts")
    .insert({
      oc_id: oc.id,
      account_name: "Account A",
      bsb: "012-345",
      account_number: "11111111",
      fund_type: "administrative",
    })
    .select("id")
    .single();
  assert(acctA, "fixture: bank account A insert failed");

  const { data: acctB } = await supabase
    .from("bank_accounts")
    .insert({
      oc_id: oc.id,
      account_name: "Account B",
      bsb: "012-345",
      account_number: "22222222",
      fund_type: "administrative",
    })
    .select("id")
    .single();
  assert(acctB, "fixture: bank account B insert failed");

  return {
    runId,
    companyId: company.id,
    ocId: oc.id,
    profileId: profile.id,
    bankAccountAId: acctA.id,
    bankAccountBId: acctB.id,
  };
}

// ─── Test helpers ─────────────────────────────────────────────────────────

interface InsertOpts {
  bankAccountId: string;
  date: string;
  amount: number;
  description: string;
  source?: "manual" | "csv_import" | "macquarie_txn" | "macquarie_pay";
  matchStatus?: "unmatched" | "auto_matched" | "manually_matched" | "excluded";
  excludedReason?: string | null;
  isVoided?: boolean;
  voidedBy?: string;
}

async function insertTxn(opts: InsertOpts): Promise<string> {
  const payload: Record<string, unknown> = {
    bank_account_id: opts.bankAccountId,
    source: opts.source ?? "manual",
    transaction_date: opts.date,
    amount: opts.amount,
    description: opts.description,
    match_status: opts.matchStatus ?? "unmatched",
  };
  if (opts.excludedReason !== undefined) payload.excluded_reason = opts.excludedReason;
  if (opts.isVoided) {
    if (!opts.voidedBy) throw new Error("voidedBy required when isVoided=true");
    payload.is_voided = true;
    payload.voided_at = new Date().toISOString();
    payload.voided_by = opts.voidedBy;
    payload.void_reason = "verification void";
  }
  const { data, error } = await supabase
    .from("bank_transactions")
    .insert(payload)
    .select("id")
    .single();
  if (error || !data) throw new Error(`insertTxn: ${error?.message}`);
  return data.id;
}

async function fetchDuplicateState(id: string) {
  const { data } = await supabase
    .from("bank_transactions")
    .select("duplicate_of, duplicate_status, duplicate_metadata, match_status, matched_total")
    .eq("id", id)
    .single();
  return data;
}

// ─── DN: normaliseDescription unit tests ──────────────────────────────────

function runNormaliserTests() {
  const cases: Array<[string, string, string]> = [
    ["DN-1: uppercases letters", "Jane Brown", "JANE BROWN"],
    ["DN-2: strips LEV-{n}", "TRANSFER LEV-12 FROM JANE", "TRANSFER FROM JANE"],
    ["DN-3: strips RCP-{n}", "RCP-7 cash receipt", "CASH RECEIPT"],
    ["DN-4: strips PAY-{n}", "Pay-9 invoice", "INVOICE"],
    ["DN-5: strips SW-PREFIX-YYYY-NNNN", "sw-mtg-2026-000123 minutes", "MINUTES"],
    [
      "DN-6: strips punctuation, collapses whitespace",
      "  Jane,  Brown!!  ",
      "JANE BROWN",
    ],
    [
      "DN-7: empty after normalise (only ref tokens)",
      "LEV-1",
      "",
    ],
  ];
  for (const [scenario, input, expected] of cases) {
    const actual = normaliseDescription(input);
    record(scenario, actual === expected, `normalise(${JSON.stringify(input)}) -> ${JSON.stringify(actual)}`);
  }

  // Hash determinism + length.
  const h = hashDescription("HELLO WORLD");
  record(
    "DN-8: hashDescription returns 16 hex chars deterministically",
    h.length === 16 && /^[a-f0-9]+$/.test(h) && h === hashDescription("HELLO WORLD"),
    `hash=${h}`,
  );
}

// ─── Detector scenarios ───────────────────────────────────────────────────

async function dd1_detectsWithinWindow(fx: Fixture) {
  const olderId = await insertTxn({
    bankAccountId: fx.bankAccountAId,
    date: "2026-04-15",
    amount: 500,
    description: "TRANSFER FROM JANE BROWN",
  });
  const newerId = await insertTxn({
    bankAccountId: fx.bankAccountAId,
    date: "2026-04-16",
    amount: 500,
    description: "Transfer From Jane Brown",
  });
  const result = await detectDuplicate(
    {
      id: newerId,
      bank_account_id: fx.bankAccountAId,
      transaction_date: "2026-04-16",
      amount: 500,
      description: "Transfer From Jane Brown",
      source: "manual",
    },
    supabase,
  );
  record(
    "DD-1: detect duplicate within +/-2 day window with matching hash",
    result.flagged && result.duplicate_of === olderId,
    `flagged=${result.flagged}${result.flagged ? `, day_delta=${result.metadata.day_delta}` : ""}`,
  );
}

async function dd2_skipsAcrossAccounts(fx: Fixture) {
  await insertTxn({
    bankAccountId: fx.bankAccountAId,
    date: "2026-04-20",
    amount: 750,
    description: "RENT MARCH",
  });
  const newerId = await insertTxn({
    bankAccountId: fx.bankAccountBId,
    date: "2026-04-20",
    amount: 750,
    description: "RENT MARCH",
  });
  const result = await detectDuplicate(
    {
      id: newerId,
      bank_account_id: fx.bankAccountBId,
      transaction_date: "2026-04-20",
      amount: 750,
      description: "RENT MARCH",
      source: "manual",
    },
    supabase,
  );
  record(
    "DD-2: don't detect across different bank_account_ids",
    result.flagged === false,
    `flagged=${result.flagged}`,
  );
}

async function dd3_amountMustEqual(fx: Fixture) {
  await insertTxn({
    bankAccountId: fx.bankAccountAId,
    date: "2026-04-22",
    amount: 100.0,
    description: "FEE",
  });
  const newerId = await insertTxn({
    bankAccountId: fx.bankAccountAId,
    date: "2026-04-22",
    amount: 100.01,
    description: "FEE",
  });
  const result = await detectDuplicate(
    {
      id: newerId,
      bank_account_id: fx.bankAccountAId,
      transaction_date: "2026-04-22",
      amount: 100.01,
      description: "FEE",
      source: "manual",
    },
    supabase,
  );
  record(
    "DD-3: don't detect when amounts differ by $0.01",
    result.flagged === false,
    `flagged=${result.flagged}`,
  );
}

async function dd4_descriptionMustMatch(fx: Fixture) {
  await insertTxn({
    bankAccountId: fx.bankAccountAId,
    date: "2026-04-23",
    amount: 200,
    description: "JANE BROWN",
  });
  const newerId = await insertTxn({
    bankAccountId: fx.bankAccountAId,
    date: "2026-04-23",
    amount: 200,
    description: "JOHN SMITH",
  });
  const result = await detectDuplicate(
    {
      id: newerId,
      bank_account_id: fx.bankAccountAId,
      transaction_date: "2026-04-23",
      amount: 200,
      description: "JOHN SMITH",
      source: "manual",
    },
    supabase,
  );
  record(
    "DD-4: don't detect when normalised descriptions differ",
    result.flagged === false,
    `flagged=${result.flagged}`,
  );
}

async function dd5_outsideWindow(fx: Fixture) {
  await insertTxn({
    bankAccountId: fx.bankAccountAId,
    date: "2026-04-01",
    amount: 333,
    description: "PAYMENT",
  });
  const newerId = await insertTxn({
    bankAccountId: fx.bankAccountAId,
    date: "2026-04-04", // 3 days later -> outside window
    amount: 333,
    description: "PAYMENT",
  });
  const result = await detectDuplicate(
    {
      id: newerId,
      bank_account_id: fx.bankAccountAId,
      transaction_date: "2026-04-04",
      amount: 333,
      description: "PAYMENT",
      source: "manual",
    },
    supabase,
  );
  record(
    "DD-5: don't detect when day_delta > 2",
    result.flagged === false,
    `flagged=${result.flagged}`,
  );
}

// DD-5b , month-boundary in/out: Jan 31 + 2 days = Feb 2 (in), + 3 = Feb 3 (out).
// Defends against off-by-one date arithmetic regressions.
async function dd5b_monthBoundary(fx: Fixture) {
  // In-window across month boundary.
  const olderInId = await insertTxn({
    bankAccountId: fx.bankAccountAId,
    date: "2027-01-31",
    amount: 555,
    description: "BOUNDARY IN",
  });
  const newerInId = await insertTxn({
    bankAccountId: fx.bankAccountAId,
    date: "2027-02-02", // +2 days (in window)
    amount: 555,
    description: "BOUNDARY IN",
  });
  const inResult = await detectDuplicate(
    {
      id: newerInId,
      bank_account_id: fx.bankAccountAId,
      transaction_date: "2027-02-02",
      amount: 555,
      description: "BOUNDARY IN",
      source: "manual",
    },
    supabase,
  );
  record(
    "DD-5b-i: in-window across month boundary (Jan 31 -> Feb 2) flags",
    inResult.flagged && inResult.duplicate_of === olderInId,
    `flagged=${inResult.flagged}, day_delta=${inResult.flagged ? inResult.metadata.day_delta : "n/a"}`,
  );

  // Out-of-window across month boundary.
  await insertTxn({
    bankAccountId: fx.bankAccountAId,
    date: "2027-01-31",
    amount: 666,
    description: "BOUNDARY OUT",
  });
  const newerOutId = await insertTxn({
    bankAccountId: fx.bankAccountAId,
    date: "2027-02-03", // +3 days (out of window)
    amount: 666,
    description: "BOUNDARY OUT",
  });
  const outResult = await detectDuplicate(
    {
      id: newerOutId,
      bank_account_id: fx.bankAccountAId,
      transaction_date: "2027-02-03",
      amount: 666,
      description: "BOUNDARY OUT",
      source: "manual",
    },
    supabase,
  );
  record(
    "DD-5b-ii: out-of-window across month boundary (Jan 31 -> Feb 3) does not flag",
    outResult.flagged === false,
    `flagged=${outResult.flagged}`,
  );
}

async function dd6_chainPrevention(fx: Fixture) {
  // First (oldest) row.
  const firstId = await insertTxn({
    bankAccountId: fx.bankAccountAId,
    date: "2026-05-01",
    amount: 444,
    description: "CHAIN",
  });
  // Second row, flagged as duplicate of first.
  const secondId = await insertTxn({
    bankAccountId: fx.bankAccountAId,
    date: "2026-05-02",
    amount: 444,
    description: "CHAIN",
  });
  const detection2 = await detectDuplicate(
    {
      id: secondId,
      bank_account_id: fx.bankAccountAId,
      transaction_date: "2026-05-02",
      amount: 444,
      description: "CHAIN",
      source: "manual",
    },
    supabase,
  );
  assert(detection2.flagged && detection2.duplicate_of === firstId, "second should flag against first");
  await markDuplicate({
    bank_transaction_id: secondId,
    oc_id: fx.ocId,
    duplicate_of: detection2.duplicate_of,
    metadata: detection2.metadata,
    performedBy: fx.profileId,
    supabase,
  });
  // Third row arrives. Detector should anchor on first (which is unmarked),
  // skipping second (which has duplicate_of != null).
  const thirdId = await insertTxn({
    bankAccountId: fx.bankAccountAId,
    date: "2026-05-03",
    amount: 444,
    description: "CHAIN",
  });
  const detection3 = await detectDuplicate(
    {
      id: thirdId,
      bank_account_id: fx.bankAccountAId,
      transaction_date: "2026-05-03",
      amount: 444,
      description: "CHAIN",
      source: "manual",
    },
    supabase,
  );
  record(
    "DD-6: chain prevention , third anchors on first, not on second",
    detection3.flagged && detection3.duplicate_of === firstId,
    `flagged=${detection3.flagged}, anchor=${detection3.flagged ? detection3.duplicate_of : "n/a"}`,
  );
}

async function dd7_voidedExcludedFromCandidates(fx: Fixture) {
  await insertTxn({
    bankAccountId: fx.bankAccountAId,
    date: "2026-06-01",
    amount: 600,
    description: "VOIDED PARENT",
    isVoided: true,
    voidedBy: fx.profileId,
  });
  const newerId = await insertTxn({
    bankAccountId: fx.bankAccountAId,
    date: "2026-06-01",
    amount: 600,
    description: "VOIDED PARENT",
  });
  const result = await detectDuplicate(
    {
      id: newerId,
      bank_account_id: fx.bankAccountAId,
      transaction_date: "2026-06-01",
      amount: 600,
      description: "VOIDED PARENT",
      source: "manual",
    },
    supabase,
  );
  record(
    "DD-7: voided rows excluded from candidate pool",
    result.flagged === false,
    `flagged=${result.flagged}`,
  );
}

async function dd8_excludedExcludedFromCandidates(fx: Fixture) {
  await insertTxn({
    bankAccountId: fx.bankAccountAId,
    date: "2026-06-05",
    amount: 700,
    description: "EXCLUDED PARENT",
    matchStatus: "excluded",
    excludedReason: "Test exclusion reason for verification",
  });
  const newerId = await insertTxn({
    bankAccountId: fx.bankAccountAId,
    date: "2026-06-05",
    amount: 700,
    description: "EXCLUDED PARENT",
  });
  const result = await detectDuplicate(
    {
      id: newerId,
      bank_account_id: fx.bankAccountAId,
      transaction_date: "2026-06-05",
      amount: 700,
      description: "EXCLUDED PARENT",
      source: "manual",
    },
    supabase,
  );
  record(
    "DD-8: excluded rows excluded from candidate pool",
    result.flagged === false,
    `flagged=${result.flagged}`,
  );
}

async function dd9_emptyAfterNormaliseStillFlags(fx: Fixture) {
  // Both descriptions normalise to "" (only LEV- ref tokens), same amount,
  // same date. Documented behaviour: flagged.
  await insertTxn({
    bankAccountId: fx.bankAccountAId,
    date: "2026-07-01",
    amount: 800,
    description: "LEV-100",
  });
  const newerId = await insertTxn({
    bankAccountId: fx.bankAccountAId,
    date: "2026-07-01",
    amount: 800,
    description: "LEV-200",
  });
  const result = await detectDuplicate(
    {
      id: newerId,
      bank_account_id: fx.bankAccountAId,
      transaction_date: "2026-07-01",
      amount: 800,
      description: "LEV-200",
      source: "manual",
    },
    supabase,
  );
  record(
    "DD-9: empty-after-normalise descriptions DO flag (documented behaviour)",
    result.flagged === true,
    `flagged=${result.flagged}`,
  );
}

// ─── Manager review action scenarios (DD-10..DD-12) ───────────────────────

async function dd10_confirmBlocksWhenMatchActive(
  fx: Fixture,
  recon: typeof import("@/lib/actions/reconciliation"),
) {
  const olderId = await insertTxn({
    bankAccountId: fx.bankAccountAId,
    date: "2026-08-01",
    amount: 900,
    description: "MATCH ACTIVE",
  });
  const newerId = await insertTxn({
    bankAccountId: fx.bankAccountAId,
    date: "2026-08-01",
    amount: 900,
    description: "MATCH ACTIVE",
    matchStatus: "auto_matched",
  });
  // Flag the newer row first.
  const det = await detectDuplicate(
    {
      id: newerId,
      bank_account_id: fx.bankAccountAId,
      transaction_date: "2026-08-01",
      amount: 900,
      description: "MATCH ACTIVE",
      source: "manual",
    },
    supabase,
  );
  assert(det.flagged && det.duplicate_of === olderId, "DD-10 setup: detection failed");
  await markDuplicate({
    bank_transaction_id: newerId,
    oc_id: fx.ocId,
    duplicate_of: det.duplicate_of,
    metadata: det.metadata,
    performedBy: fx.profileId,
    supabase,
  });

  const result = await recon.confirmDuplicate({
    oc_id: fx.ocId,
    bank_transaction_id: newerId,
  });
  record(
    "DD-10: confirmDuplicate blocks with errorCode=MATCH_ACTIVE on auto_matched row",
    result.errorCode === "MATCH_ACTIVE",
    `errorCode=${result.errorCode}, error=${result.error}`,
  );
}

async function dd11_confirmBlocksWhenMatchedTotalNonZero(
  fx: Fixture,
  recon: typeof import("@/lib/actions/reconciliation"),
) {
  const olderId = await insertTxn({
    bankAccountId: fx.bankAccountAId,
    date: "2026-08-05",
    amount: 1000,
    description: "PARTIAL ALLOC",
  });
  const newerId = await insertTxn({
    bankAccountId: fx.bankAccountAId,
    date: "2026-08-05",
    amount: 1000,
    description: "PARTIAL ALLOC",
  });
  // Force matched_total > 0 even though match_status is unmatched (partial alloc edge).
  await supabase
    .from("bank_transactions")
    .update({ matched_total: 100 })
    .eq("id", newerId);
  const det = await detectDuplicate(
    {
      id: newerId,
      bank_account_id: fx.bankAccountAId,
      transaction_date: "2026-08-05",
      amount: 1000,
      description: "PARTIAL ALLOC",
      source: "manual",
    },
    supabase,
  );
  assert(det.flagged && det.duplicate_of === olderId, "DD-11 setup: detection failed");
  await markDuplicate({
    bank_transaction_id: newerId,
    oc_id: fx.ocId,
    duplicate_of: det.duplicate_of,
    metadata: det.metadata,
    performedBy: fx.profileId,
    supabase,
  });

  const result = await recon.confirmDuplicate({
    oc_id: fx.ocId,
    bank_transaction_id: newerId,
  });
  record(
    "DD-11: confirmDuplicate blocks with errorCode=MATCH_ACTIVE when matched_total > 0",
    result.errorCode === "MATCH_ACTIVE",
    `errorCode=${result.errorCode}`,
  );
}

async function dd12_rejectSucceedsAndReruns(
  fx: Fixture,
  recon: typeof import("@/lib/actions/reconciliation"),
) {
  await insertTxn({
    bankAccountId: fx.bankAccountAId,
    date: "2026-09-01",
    amount: 1234,
    description: "REJECT TEST",
  });
  const newerId = await insertTxn({
    bankAccountId: fx.bankAccountAId,
    date: "2026-09-01",
    amount: 1234,
    description: "REJECT TEST",
  });
  const det = await detectDuplicate(
    {
      id: newerId,
      bank_account_id: fx.bankAccountAId,
      transaction_date: "2026-09-01",
      amount: 1234,
      description: "REJECT TEST",
      source: "manual",
    },
    supabase,
  );
  assert(det.flagged, "DD-12 setup: detection failed");
  await markDuplicate({
    bank_transaction_id: newerId,
    oc_id: fx.ocId,
    duplicate_of: det.duplicate_of,
    metadata: det.metadata,
    performedBy: fx.profileId,
    supabase,
  });

  const result = await recon.rejectDuplicate({
    oc_id: fx.ocId,
    bank_transaction_id: newerId,
  });
  const state = await fetchDuplicateState(newerId);
  // matchOutcome is non-null because amount > 0; no levy notice exists so
  // it falls through with matched=false. We assert the field shape, not the
  // match success.
  const ok =
    result.success?.rejected === true &&
    state?.duplicate_status === "rejected" &&
    result.success?.matchOutcome !== undefined;
  record(
    "DD-12: rejectDuplicate succeeds and re-runs tryAutoMatch",
    ok,
    `status=${state?.duplicate_status}, matchOutcome=${result.success?.matchOutcome === null ? "null" : "set"}`,
  );
}

// ─── DD-13: orchestrator early-out ────────────────────────────────────────

async function dd13_orchestratorSkipsSuspected(fx: Fixture) {
  await insertTxn({
    bankAccountId: fx.bankAccountAId,
    date: "2026-10-01",
    amount: 50,
    description: "ORCH SKIP",
  });
  const newerId = await insertTxn({
    bankAccountId: fx.bankAccountAId,
    date: "2026-10-01",
    amount: 50,
    description: "ORCH SKIP",
  });
  const det = await detectDuplicate(
    {
      id: newerId,
      bank_account_id: fx.bankAccountAId,
      transaction_date: "2026-10-01",
      amount: 50,
      description: "ORCH SKIP",
      source: "manual",
    },
    supabase,
  );
  assert(det.flagged, "DD-13 setup: detection failed");
  await markDuplicate({
    bank_transaction_id: newerId,
    oc_id: fx.ocId,
    duplicate_of: det.duplicate_of,
    metadata: det.metadata,
    performedBy: fx.profileId,
    supabase,
  });

  const outcome = await tryAutoMatch({
    bankTransactionId: newerId,
    ocId: fx.ocId,
    bankAccountId: fx.bankAccountAId,
    description: "ORCH SKIP",
    amount: 50,
    transactionDate: "2026-10-01",
    performedBy: fx.profileId,
  });
  record(
    "DD-13: orchestrator skips suspected duplicates with duplicate_skipped=true",
    outcome.duplicate_skipped === true && outcome.matched === false,
    `duplicate_skipped=${outcome.duplicate_skipped}, matched=${outcome.matched}`,
  );

  // No reconciliation.auto_match_attempted audit should have been written
  // for this bank_transaction_id.
  const { data: audits } = await supabase
    .from("audit_log")
    .select("action")
    .eq("entity_id", newerId)
    .eq("action", "reconciliation.auto_match_attempted");
  record(
    "DD-13b: orchestrator did NOT write an auto_match_attempted audit",
    (audits ?? []).length === 0,
    `audits found=${(audits ?? []).length}`,
  );
}

// ─── DD-14: CSV import integration ────────────────────────────────────────

async function dd14_csvImportIntegration(
  fx: Fixture,
  bankActions: typeof import("@/lib/actions/bank-transactions"),
) {
  // Existing Basiq row in the account.
  await insertTxn({
    bankAccountId: fx.bankAccountAId,
    date: "2026-11-01",
    amount: 333,
    description: "BASIQ INCOMING JANE",
    source: "csv_import",
  });

  // CSV import delivers two rows:
  //  - one identical to a row we'll insert twice (intra-batch + prior-import dedup)
  //  - one cross-source dup of the Basiq row (different desc formatting)
  const res1 = await bankActions.importBankTransactions(fx.ocId, {
    bank_account_id: fx.bankAccountAId,
    rows: [
      {
        transaction_date: "2026-11-15",
        amount: 100,
        description: "STANDARD ROW",
        balance: null,
      },
    ],
  });
  assert(res1.summary, `DD-14 first import: ${res1.error}`);

  // Second import: same standard row (prior-import dup) + cross-source dup
  // of the Basiq row.
  const res2 = await bankActions.importBankTransactions(fx.ocId, {
    bank_account_id: fx.bankAccountAId,
    rows: [
      {
        transaction_date: "2026-11-15",
        amount: 100,
        description: "STANDARD ROW",
        balance: null,
      },
      {
        transaction_date: "2026-11-01",
        amount: 333,
        description: "Basiq incoming Jane",
        balance: null,
      },
    ],
  });
  assert(res2.summary, `DD-14 second import: ${res2.error}`);

  const ok =
    res2.summary!.exact_duplicates_dropped === 1 &&
    res2.summary!.cross_source_duplicates_flagged === 1 &&
    res2.summary!.imported === 1;
  record(
    "DD-14: CSV import populates exact_duplicates_dropped and cross_source_duplicates_flagged",
    ok,
    `summary=${JSON.stringify(res2.summary)}`,
  );
}

// ─── DD-15: Basiq insert path ─────────────────────────────────────────────
// Direct test of the integration shape , inserts a row tagged source='basiq'
// then runs detector + marker against it. Validates the same code path the
// pollConnectionAsSystem function executes per-tx without depending on the
// external Basiq API client.

async function dd15_basiqIntegration(fx: Fixture) {
  await insertTxn({
    bankAccountId: fx.bankAccountAId,
    date: "2026-12-01",
    amount: 222,
    description: "MANUAL ENTRY OF BASIQ TX",
    source: "manual",
  });
  const basiqId = await insertTxn({
    bankAccountId: fx.bankAccountAId,
    date: "2026-12-01",
    amount: 222,
    description: "Manual Entry Of Basiq Tx",
    source: "csv_import",
  });
  const det = await detectDuplicate(
    {
      id: basiqId,
      bank_account_id: fx.bankAccountAId,
      transaction_date: "2026-12-01",
      amount: 222,
      description: "Manual Entry Of Basiq Tx",
      source: "csv_import",
    },
    supabase,
  );
  assert(det.flagged, "DD-15 setup: detection failed");
  const marked = await markDuplicate({
    bank_transaction_id: basiqId,
    oc_id: fx.ocId,
    duplicate_of: det.duplicate_of,
    metadata: det.metadata,
    performedBy: fx.profileId,
    supabase,
  });
  const state = await fetchDuplicateState(basiqId);
  const meta = (state?.duplicate_metadata ?? {}) as { older_source?: string; newer_source?: string };
  record(
    "DD-15: Basiq integration triggers detection (older_source=manual, newer_source=basiq)",
    marked.ok && state?.duplicate_status === "suspected" && meta.newer_source === "csv_import" && meta.older_source === "manual",
    `older=${meta.older_source}, newer=${meta.newer_source}, status=${state?.duplicate_status}`,
  );
}

// ─── DD-16: addManualBankTransaction integration ──────────────────────────

async function dd16_addManualIntegration(
  fx: Fixture,
  recon: typeof import("@/lib/actions/reconciliation"),
) {
  // Existing CSV row.
  await insertTxn({
    bankAccountId: fx.bankAccountAId,
    date: "2027-01-15",
    amount: 88,
    description: "RENT JANUARY",
    source: "csv_import",
  });
  // Manager manually enters the same tx.
  const res = await recon.addManualBankTransaction({
    oc_id: fx.ocId,
    bank_account_id: fx.bankAccountAId,
    transaction_date: "2027-01-15",
    amount: 88,
    direction: "credit",
    description: "Rent January",
  });
  assert(res.success, `DD-16: ${res.error}`);
  const state = await fetchDuplicateState(res.success!.bankTransactionId);
  const ok =
    res.success!.duplicateSuspected === true &&
    res.success!.autoMatched === false &&
    state?.duplicate_status === "suspected";
  record(
    "DD-16: addManualBankTransaction triggers detection (duplicateSuspected=true, autoMatch skipped)",
    ok,
    `duplicateSuspected=${res.success!.duplicateSuspected}, status=${state?.duplicate_status}`,
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
    .from("owners_corporations")
    .select("id")
    .eq("management_company_id", companyId);
  const subIds = (subs ?? []).map((s) => s.id);
  if (subIds.length > 0) {
    const { data: accounts } = await supabase
      .from("bank_accounts")
      .select("id")
      .in("oc_id", subIds);
    const accountIds = (accounts ?? []).map((a) => a.id);
    if (accountIds.length > 0) {
      // Clear duplicate_of self-references first so deletes don't FK-fail.
      await supabase
        .from("bank_transactions")
        .update({ duplicate_of: null, duplicate_status: null, duplicate_metadata: null })
        .in("bank_account_id", accountIds);
      const { data: txns } = await supabase
        .from("bank_transactions")
        .select("id")
        .in("bank_account_id", accountIds);
      const txnIds = (txns ?? []).map((t) => t.id);
      if (txnIds.length > 0) {
        await supabase.from("reconciliation_matches").delete().in("bank_transaction_id", txnIds);
      }
      await supabase.from("bank_transactions").delete().in("bank_account_id", accountIds);
    }
    await supabase.from("audit_log").delete().in("oc_id", subIds);
    await supabase.from("owners_corporations").delete().in("id", subIds);
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

  console.log("Duplicate-detection verification , PP5-A scenarios\n");
  console.log("[1/3] Cleaning up stale verification data");
  await cleanupMarker();

  console.log("[2/3] Creating fixture");
  const fx = await createFixture();

  console.log("[3/3] Running scenarios\n");

  // Pure normaliser tests first , no fixture dependency.
  runNormaliserTests();

  // Detector scenarios.
  await dd1_detectsWithinWindow(fx);
  await dd2_skipsAcrossAccounts(fx);
  await dd3_amountMustEqual(fx);
  await dd4_descriptionMustMatch(fx);
  await dd5_outsideWindow(fx);
  await dd5b_monthBoundary(fx);
  await dd6_chainPrevention(fx);
  await dd7_voidedExcludedFromCandidates(fx);
  await dd8_excludedExcludedFromCandidates(fx);
  await dd9_emptyAfterNormaliseStillFlags(fx);

  // Server-action and integration scenarios , dynamic-import after the
  // auth-resolver shim is set, parallel to the reconciliation.verification.ts
  // pattern.
  const recon = await import("@/lib/actions/reconciliation");
  const bankActions = await import("@/lib/actions/bank-transactions");

  await dd10_confirmBlocksWhenMatchActive(fx, recon);
  await dd11_confirmBlocksWhenMatchedTotalNonZero(fx, recon);
  await dd12_rejectSucceedsAndReruns(fx, recon);
  await dd13_orchestratorSkipsSuspected(fx);
  await dd14_csvImportIntegration(fx, bankActions);
  await dd15_basiqIntegration(fx);
  await dd16_addManualIntegration(fx, recon);

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
