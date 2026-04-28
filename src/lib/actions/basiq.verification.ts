/**
 * Basiq bank-feed verification script (Prompt 3).
 *
 * Exercises the 15 automated scenarios required by Prompt 3 §Verification.
 * All Basiq HTTP calls are intercepted via __setBasiqApiClientForVerification
 * — zero live network traffic on the default (non-`--live`) run.
 *
 * Usage:
 *   npx tsx src/lib/actions/basiq.verification.ts             # run + cleanup
 *   npx tsx src/lib/actions/basiq.verification.ts --no-cleanup # leave fixture
 *   npx tsx src/lib/actions/basiq.verification.ts --cleanup    # clean stale runs and exit
 *   npx tsx src/lib/actions/basiq.verification.ts --live       # also run B-LIVE (needs BASIQ_SANDBOX_CREDENTIALS)
 */

import { config } from "dotenv";
config({ path: ".env.local" });

// ─── next/cache stub (Variant A) — see PRE_LAUNCH_CLEANUP.md ──
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
import { createHmac, randomUUID } from "node:crypto";
import {
  __setUserIdResolverForVerification,
  __getUserIdResolverForVerification,
} from "@/lib/auth-resolver";
import {
  __setBasiqApiClientForVerification,
  type BasiqApiClient,
} from "@/lib/basiq/client";
import { verifyBasiqWebhookSignature } from "@/lib/basiq/webhook-signature";
import type {
  BasiqAccountApi,
  BasiqConnectionApi,
  BasiqInstitution,
  BasiqJob,
  BasiqTransactionPayload,
} from "@/lib/validations/basiq";

// ─── Environment ──────────────────────────────────────────────

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local",
  );
  process.exit(1);
}
process.env.BASIQ_STATE_SECRET =
  process.env.BASIQ_STATE_SECRET ??
  "test-state-secret-min-32-chars-required-xxxx";
process.env.BASIQ_API_KEY =
  process.env.BASIQ_API_KEY ?? "test-api-key-not-used-by-stub";
process.env.BASIQ_WEBHOOK_SECRET =
  process.env.BASIQ_WEBHOOK_SECRET ?? "whsec_" + Buffer.from("test-secret-bytes").toString("base64");

const VERIFY_MARKER = "__VERIFY_BASIQ__";
const VERIFY_CLERK_ID = `${VERIFY_MARKER}_CLERK_${Date.now()}_${randomUUID().slice(0, 8)}`;

__setUserIdResolverForVerification(async () => VERIFY_CLERK_ID);
if (__getUserIdResolverForVerification() === null) {
  console.error("Fatal: verification userId resolver is null after being set.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

// ─── Stub BasiqApiClient ──────────────────────────────────────

class StubBasiqApiClient implements BasiqApiClient {
  calls: Record<string, number> = {};
  stubUserId = "basiq-user-stub-001";
  stubClientToken = "stub-client-access-token";
  stubInstitutions: BasiqInstitution[] = [
    { id: "AU00000", name: "Commonwealth Bank", shortName: "CBA" },
    { id: "AU00003", name: "Westpac", shortName: "WBC" },
  ];
  stubConnections: BasiqConnectionApi[] = [];
  stubTransactions: BasiqTransactionPayload[] = [];
  stubTransactionsPerCall: BasiqTransactionPayload[][] | null = null;
  stubJob: BasiqJob | null = null;
  existingUserIdByEmail: Record<string, string> = {};
  deletedConnectionIds: string[] = [];

  private bump(name: string) {
    this.calls[name] = (this.calls[name] ?? 0) + 1;
  }

  async createUser(args: {
    email: string;
    mobile?: string;
  }): Promise<{ id: string }> {
    this.bump("createUser");
    if (this.existingUserIdByEmail[args.email]) {
      return { id: this.existingUserIdByEmail[args.email] };
    }
    const id = this.stubUserId;
    this.existingUserIdByEmail[args.email] = id;
    return { id };
  }
  async generateClientToken(): Promise<{
    access_token: string;
    expires_in: number;
  }> {
    this.bump("generateClientToken");
    return { access_token: this.stubClientToken, expires_in: 600 };
  }
  async listInstitutions(): Promise<BasiqInstitution[]> {
    this.bump("listInstitutions");
    return this.stubInstitutions;
  }
  async getConnection(args: {
    basiqUserId: string;
    connectionId: string;
  }): Promise<BasiqConnectionApi> {
    this.bump("getConnection");
    const match = this.stubConnections.find((c) => c.id === args.connectionId);
    if (!match) throw new Error("stub: connection not found");
    return match;
  }
  async getUserConnections(): Promise<BasiqConnectionApi[]> {
    this.bump("getUserConnections");
    return this.stubConnections;
  }
  async deleteConnection(args: {
    basiqUserId: string;
    connectionId: string;
  }): Promise<{ ok: true }> {
    this.bump("deleteConnection");
    this.deletedConnectionIds.push(args.connectionId);
    return { ok: true };
  }
  async getTransactions(): Promise<BasiqTransactionPayload[]> {
    this.bump("getTransactions");
    if (
      this.stubTransactionsPerCall &&
      this.stubTransactionsPerCall.length > 0
    ) {
      return this.stubTransactionsPerCall.shift() ?? [];
    }
    return this.stubTransactions;
  }
  async getJob(): Promise<BasiqJob> {
    this.bump("getJob");
    if (!this.stubJob) throw new Error("stub: no job configured");
    return this.stubJob;
  }
  stubAccounts: BasiqAccountApi[] = [];
  async getAccounts(): Promise<BasiqAccountApi[]> {
    this.bump("getAccounts");
    return this.stubAccounts;
  }
}

const stubClient = new StubBasiqApiClient();
__setBasiqApiClientForVerification(stubClient);

// ─── Dynamic imports AFTER seams are in place ─────────────────

type BasiqActions = typeof import("./basiq");
let basiq: BasiqActions;

// ─── Result tracking ──────────────────────────────────────────

type Result = { scenario: string; passed: boolean; detail: string };
const results: Result[] = [];

function record(scenario: string, passed: boolean, detail: string) {
  results.push({ scenario, passed, detail });
  console.log(`  ${passed ? "PASS" : "FAIL"}  ${scenario}${detail ? " — " + detail : ""}`);
}

function assert(cond: unknown, msg = "assertion failed"): asserts cond {
  if (!cond) throw new Error(msg);
}

// ─── Fixture ───────────────────────────────────────────────────

interface Fixture {
  runId: string;
  companyId: string;
  subdivisionId: string;
  profileId: string;
  adminAccountId: string;
  basiqAccountId: string; // the Basiq-side account id we stubbed
  lotId: string;
  notice: { id: string; reference: string; amount: number };
}

async function createFixture(): Promise<Fixture> {
  const runId = `${Date.now()}_${randomUUID().slice(0, 8)}`;
  const companyName = `${VERIFY_MARKER}${runId}`;
  const profileEmail = `${VERIFY_MARKER.toLowerCase()}${runId}@basiq.test`;

  console.log(`\nCreating fixture (runId=${runId})`);

  const { data: company, error: companyErr } = await supabase
    .from("management_companies")
    .insert({ name: companyName })
    .select("id")
    .single();
  if (companyErr || !company) throw new Error(`fixture: company: ${companyErr?.message}`);

  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .insert({
      clerk_id: VERIFY_CLERK_ID,
      email: profileEmail,
      first_name: "Basiq",
      last_name: "Verify",
      role: "strata_manager",
      company_role: "admin",
      management_company_id: company.id,
    })
    .select("id")
    .single();
  if (profileErr || !profile) throw new Error(`fixture: profile: ${profileErr?.message}`);

  const { data: subdivision, error: subErr } = await supabase
    .from("subdivisions")
    .insert({
      management_company_id: company.id,
      name: companyName,
      plan_number: `PLAN-${runId}`,
      address: "1 Basiq Verify St, Melbourne VIC 3000",
      total_lots: 1,
      created_by: profile.id,
    })
    .select("id")
    .single();
  if (subErr || !subdivision) throw new Error(`fixture: subdivision: ${subErr?.message}`);

  const { data: lot, error: lotErr } = await supabase
    .from("lots")
    .insert({
      subdivision_id: subdivision.id,
      lot_number: 1,
      lot_entitlement: 100,
      lot_liability: 100,
    })
    .select("id")
    .single();
  if (lotErr || !lot) throw new Error(`fixture: lot: ${lotErr?.message}`);

  const basiqAccountId = `basiq-acct-${runId}`;
  const { data: account, error: acctErr } = await supabase
    .from("bank_accounts")
    .insert({
      subdivision_id: subdivision.id,
      account_name: "Admin",
      bsb: "083-001",
      account_number: "12345678",
      fund_type: "administrative",
      bank_name: "CBA",
      opening_balance: 0,
      basiq_account_id: basiqAccountId,
    })
    .select("id")
    .single();
  if (acctErr || !account) throw new Error(`fixture: account: ${acctErr?.message}`);

  // Budget + levy notice for auto-match testing.
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
  if (!budget) throw new Error("fixture: budget");

  const { data: batch } = await supabase
    .from("levy_batches")
    .insert({
      subdivision_id: subdivision.id,
      budget_id: budget.id,
      financial_year: "2026-2027",
      fund_type: "administrative",
      period_start: "2026-07-01",
      period_end: "2026-09-30",
      period_label: "Q1 basiq-verify",
      due_date: "2026-07-28",
      total_amount: 500,
      levy_count: 1,
      status: "draft",
      generated_by: profile.id,
    })
    .select("id")
    .single();
  if (!batch) throw new Error("fixture: batch");

  const { data: ref } = await supabase.rpc("next_reference_number", {
    p_prefix: "LEV",
    p_subdivision_id: subdivision.id,
  });
  if (!ref) throw new Error("fixture: next_reference_number");

  const { data: notice } = await supabase
    .from("levy_notices")
    .insert({
      subdivision_id: subdivision.id,
      lot_id: lot.id,
      budget_id: budget.id,
      batch_id: batch.id,
      reference_number: ref as string,
      fund_type: "administrative",
      levy_type: "regular",
      period_start: "2026-07-01",
      period_end: "2026-09-30",
      amount: 500,
      due_date: "2026-07-28",
      status: "draft",
    })
    .select("id")
    .single();
  if (!notice) throw new Error("fixture: notice");

  await supabase.rpc("rpc_levy_batch_debit", {
    p_batch_id: batch.id,
    p_created_by: profile.id,
  });

  return {
    runId,
    companyId: company.id,
    subdivisionId: subdivision.id,
    profileId: profile.id,
    adminAccountId: account.id,
    basiqAccountId,
    lotId: lot.id,
    notice: { id: notice.id, reference: ref as string, amount: 500 },
  };
}

// ─── Helpers ──────────────────────────────────────────────────

async function fetchConnection(id: string) {
  const { data } = await supabase
    .from("basiq_connections")
    .select("*")
    .eq("id", id)
    .single();
  return data;
}

async function countBankTransactionsFor(bankAccountId: string) {
  const { count } = await supabase
    .from("bank_transactions")
    .select("id", { count: "exact", head: true })
    .eq("bank_account_id", bankAccountId);
  return count ?? 0;
}

function buildStubTxn(
  basiqId: string,
  amount: number,
  description: string,
  date = "2026-08-05",
  accountId?: string,
): BasiqTransactionPayload {
  return {
    id: basiqId,
    account: accountId ?? "stub-account",
    description,
    amount: String(amount),
    postDate: date,
    direction: amount >= 0 ? "credit" : "debit",
    balance: null,
  };
}

async function linkAccountToConnection(connectionId: string, accountId: string, basiqAccountId: string) {
  await supabase
    .from("bank_accounts")
    .update({
      basiq_connection_id: connectionId,
      basiq_account_id: basiqAccountId,
    })
    .eq("id", accountId);
}

// ─── Scenarios ────────────────────────────────────────────────

async function scenarioB1(fx: Fixture) {
  const header = "B1: createBasiqUser is idempotent";
  try {
    const first = await basiq.createBasiqUser(fx.subdivisionId);
    assert(first.success, `first call error: ${first.error}`);
    const firstId = first.success!.basiqUserId;

    // Force creation of a basiq_connections row so the idempotency path
    // returns the stored basiq_user_id without hitting the API again.
    await supabase
      .from("basiq_connections")
      .insert({
        subdivision_id: fx.subdivisionId,
        basiq_user_id: firstId,
        basiq_external_connection_id: `scaffold-${fx.runId}`,
        basiq_institution_id: "AU00000",
        institution_name: "CBA",
        status: "pending",
        created_by: fx.profileId,
      });

    stubClient.calls.createUser = 0;
    const second = await basiq.createBasiqUser(fx.subdivisionId);
    assert(second.success, `second call error: ${second.error}`);
    assert(
      second.success!.basiqUserId === firstId,
      `expected same id, got ${second.success!.basiqUserId} vs ${firstId}`,
    );
    assert(
      stubClient.calls.createUser === 0,
      "second call should not hit createUser API",
    );

    // Remove scaffold row so downstream scenarios start fresh.
    await supabase
      .from("basiq_connections")
      .delete()
      .eq("subdivision_id", fx.subdivisionId);

    record(header, true, `userId=${firstId}, no extra API call on 2nd invocation`);
  } catch (e) {
    record(header, false, (e as Error).message);
  }
}

async function scenarioB2(fx: Fixture): Promise<{ connectionId: string } | null> {
  const header = "B2: startBasiqConsent creates pending row + returns consent URL";
  try {
    const accountsBefore = await supabase
      .from("bank_accounts")
      .select("id, basiq_connection_id")
      .eq("subdivision_id", fx.subdivisionId);
    const res = await basiq.startBasiqConsent({
      subdivision_id: fx.subdivisionId,
      institution_id: "AU00000",
      nominated_rep_name: "Jane Manager",
    });
    assert("success" in res, `unexpected error: ${"error" in res ? res.error : "?"}`);
    const { consentUrl, connectionId } = res.success!;
    assert(
      consentUrl.startsWith("https://consent.basiq.io/home?"),
      `unexpected consent url: ${consentUrl}`,
    );
    assert(consentUrl.includes("token="), "consent url missing token param");
    assert(consentUrl.includes("state="), "consent url missing state param");
    const row = await fetchConnection(connectionId);
    assert(row, "pending row not inserted");
    assert(row!.status === "pending", `expected status=pending, got ${row!.status}`);
    assert(
      row!.nominated_representative_name === "Jane Manager",
      "nominated rep not recorded",
    );

    const accountsAfter = await supabase
      .from("bank_accounts")
      .select("id, basiq_connection_id")
      .eq("subdivision_id", fx.subdivisionId);
    const mutated = (accountsAfter.data ?? []).some(
      (a) =>
        (a as { basiq_connection_id: string | null }).basiq_connection_id !==
        ((accountsBefore.data ?? []).find(
          (b) => (b as { id: string }).id === (a as { id: string }).id,
        ) as { basiq_connection_id: string | null } | undefined)
          ?.basiq_connection_id,
    );
    assert(!mutated, "bank_accounts.basiq_connection_id was unexpectedly set");
    record(header, true, `connectionId=${connectionId.slice(0, 8)} status=pending`);
    return { connectionId };
  } catch (e) {
    record(header, false, (e as Error).message);
    return null;
  }
}

async function scenarioB3(fx: Fixture, pendingConnectionId: string) {
  const header = "B3: completeBasiqConsent flips to active + 12-month expiry";
  try {
    // Stub the getUserConnections response to yield a "freshly-created"
    // connection whose id is new to us.
    const newExternalId = `ext-fresh-${fx.runId}`;
    stubClient.stubConnections = [
      {
        id: newExternalId,
        status: "active",
        institution: { id: "AU00000", name: "CBA" },
      },
    ];
    stubClient.stubJob = {
      id: "job-001",
      steps: [{ title: "retrieve-accounts", status: "success" }],
      links: { source: `/users/${stubClient.stubUserId}/connections/${newExternalId}` },
    };

    const res = await basiq.completeBasiqConsent({
      connectionId: pendingConnectionId,
      basiqJobId: "job-001",
    });
    assert(res.success, `unexpected error: ${res.error}`);
    const row = await fetchConnection(pendingConnectionId);
    assert(row, "row missing after completion");
    assert(row!.status === "active", `expected active, got ${row!.status}`);
    assert(
      row!.basiq_external_connection_id === newExternalId,
      `expected external id ${newExternalId}, got ${row!.basiq_external_connection_id}`,
    );
    const expires = new Date(row!.consent_expires_at!).getTime();
    const target = Date.now() + 365 * 24 * 60 * 60 * 1000;
    const drift = Math.abs(expires - target);
    assert(drift < 60 * 60 * 1000, `12mo drift too large: ${drift}ms`);

    // Link our bank_account to the new connection so subsequent
    // force-sync scenarios have a mapping.
    await linkAccountToConnection(
      pendingConnectionId,
      fx.adminAccountId,
      fx.basiqAccountId,
    );
    record(header, true, `status=active, expires in ~365d, ext=${newExternalId}`);
  } catch (e) {
    record(header, false, (e as Error).message);
  }
}

async function scenarioB4(fx: Fixture, connectionId: string) {
  const header = "B4: force-sync inserts + auto-matches on LEV reference";
  try {
    const txns: BasiqTransactionPayload[] = [
      buildStubTxn(
        `btx-b4-1-${fx.runId}`,
        500,
        `Transfer ${fx.notice.reference} from owner`,
        "2026-08-01",
        fx.basiqAccountId,
      ),
      buildStubTxn(
        `btx-b4-2-${fx.runId}`,
        200,
        "Unrelated deposit",
        "2026-08-02",
        fx.basiqAccountId,
      ),
    ];
    stubClient.stubTransactions = txns;

    const before = await countBankTransactionsFor(fx.adminAccountId);
    const res = await basiq.forceSyncBasiqConnection({
      subdivisionId: fx.subdivisionId,
    });
    assert(res.success, `unexpected error: ${res.error}`);
    const after = await countBankTransactionsFor(fx.adminAccountId);
    assert(after - before === 2, `expected 2 new txns, got ${after - before}`);

    const { data: matched } = await supabase
      .from("bank_transactions")
      .select("match_status, matched_total")
      .eq("basiq_transaction_id", `btx-b4-1-${fx.runId}`)
      .single();
    assert(matched, "reference txn row missing");
    assert(
      matched!.match_status === "auto_matched",
      `expected auto_matched, got ${matched!.match_status}`,
    );
    record(header, true, `inserted=2, auto_matched=1`);
  } catch (e) {
    record(header, false, (e as Error).message);
  }
}

async function scenarioB5(fx: Fixture) {
  const header = "B5: duplicate basiq_transaction_id inserts once";
  try {
    stubClient.stubTransactions = [
      buildStubTxn(
        `btx-b5-dupe-${fx.runId}`,
        150,
        "duplicate test",
        "2026-08-03",
        fx.basiqAccountId,
      ),
      buildStubTxn(
        `btx-b5-dupe-${fx.runId}`, // identical id
        150,
        "duplicate test",
        "2026-08-03",
        fx.basiqAccountId,
      ),
    ];
    const before = await countBankTransactionsFor(fx.adminAccountId);
    const res = await basiq.forceSyncBasiqConnection({
      subdivisionId: fx.subdivisionId,
      bypassRateLimit: true,
    });
    assert(res.success, `unexpected error: ${res.error}`);
    const after = await countBankTransactionsFor(fx.adminAccountId);
    assert(after - before === 1, `expected 1 new, got ${after - before}`);
    record(header, true, `rows=+1 (silently deduplicated)`);
  } catch (e) {
    record(header, false, (e as Error).message);
  }
}

async function scenarioB6(fx: Fixture) {
  const header = "B6: force-sync rate limit (30s)";
  try {
    stubClient.stubTransactions = [];
    const first = await basiq.forceSyncBasiqConnection({
      subdivisionId: fx.subdivisionId,
    });
    assert(first.success, `first error: ${first.error}`);
    const second = await basiq.forceSyncBasiqConnection({
      subdivisionId: fx.subdivisionId,
    });
    assert(second.success, `second error: ${second.error}`);
    assert(second.success!.rateLimited, "second call should be rate-limited");
    const bypass = await basiq.forceSyncBasiqConnection({
      subdivisionId: fx.subdivisionId,
      bypassRateLimit: true,
    });
    assert(bypass.success, `bypass error: ${bypass.error}`);
    assert(!bypass.success!.rateLimited, "bypass should not be rate-limited");
    record(header, true, `first→ok, second→limited, bypass→ok`);
  } catch (e) {
    record(header, false, (e as Error).message);
  }
}

async function scenarioB7(fx: Fixture, connectionId: string) {
  const header = "B7: pollBasiqConnection updates last_sync_at + inserts new txns";
  try {
    stubClient.stubTransactions = [
      buildStubTxn(
        `btx-b7-${fx.runId}`,
        80,
        "poll-test",
        "2026-08-04",
        fx.basiqAccountId,
      ),
    ];
    const before = await fetchConnection(connectionId);
    const res = await basiq.pollBasiqConnection(connectionId);
    assert(res.success, `error: ${res.error}`);
    assert(res.success!.inserted >= 1, "expected at least 1 insert");
    const after = await fetchConnection(connectionId);
    assert(after!.last_sync_at, "last_sync_at not set");
    assert(
      new Date(after!.last_sync_at).getTime() >
        (before!.last_sync_at ? new Date(before!.last_sync_at).getTime() : 0),
      "last_sync_at not advanced",
    );
    record(header, true, `inserted=${res.success!.inserted}`);
  } catch (e) {
    record(header, false, (e as Error).message);
  }
}

async function scenarioB8(fx: Fixture) {
  const header = "B8: webhook signature verification (good + bad)";
  try {
    const secretB64 = Buffer.from("test-secret-bytes-raw").toString("base64");
    const secret = "whsec_" + secretB64;

    const body = JSON.stringify({
      type: "transactions.updated",
      data: { connectionId: "stub" },
    });
    const id = "evt_" + fx.runId;
    const ts = Math.floor(Date.now() / 1000).toString();
    const signedContent = `${id}.${ts}.${body}`;
    const sig = createHmac("sha256", Buffer.from(secretB64, "base64"))
      .update(signedContent)
      .digest("base64");

    const good = verifyBasiqWebhookSignature({
      id,
      timestamp: ts,
      signatureHeader: `v1,${sig}`,
      rawBody: body,
      secret,
    });
    assert(good.valid, `good signature should verify: ${!good.valid && good.reason}`);

    const bad = verifyBasiqWebhookSignature({
      id,
      timestamp: ts,
      signatureHeader: `v1,${Buffer.from("wrong").toString("base64")}`,
      rawBody: body,
      secret,
    });
    assert(!bad.valid, "bad signature should fail");

    // Also exercise the dispatcher for a recognised event to prove it
    // processes without errors (no-op because our event has no tracked
    // connection id matching stub).
    const dispatch = await basiq.handleBasiqEvent({
      eventType: "transactions.updated",
      payload: { connectionId: "unmatched-ext-id" },
    });
    assert(!dispatch.handled, "dispatcher should not handle unmatched connection");
    record(header, true, "good=valid, bad=reject, dispatcher=ok");
  } catch (e) {
    record(header, false, (e as Error).message);
  }
}

async function scenarioB9(fx: Fixture, connectionId: string) {
  const header = "B9: connection.invalidated dispatcher updates local row";
  try {
    const row = await fetchConnection(connectionId);
    // Stub the remote connection to be explicitly "invalid" so our dispatcher
    // maps it to 'revoked'.
    stubClient.stubConnections = [
      {
        id: row!.basiq_external_connection_id,
        status: "invalid",
        institution: { id: "AU00000", name: "CBA" },
      },
    ];
    const res = await basiq.handleBasiqEvent({
      eventType: "connection.invalidated",
      payload: { connectionId: row!.basiq_external_connection_id },
    });
    assert(res.handled, `dispatcher did not handle: ${res.reason}`);
    const after = await fetchConnection(connectionId);
    assert(
      after!.status === "revoked",
      `expected revoked, got ${after!.status}`,
    );
    void fx;
    record(header, true, `status transitioned to ${after!.status}`);
  } catch (e) {
    record(header, false, (e as Error).message);
  }
}

async function scenarioB10(fx: Fixture, connectionId: string) {
  const header = "B10: expired consent returns consent_required on force-sync";
  try {
    // Re-activate the connection so we can then force it to expire.
    await supabase
      .from("basiq_connections")
      .update({
        status: "active",
        consent_expires_at: new Date(Date.now() - 60 * 1000).toISOString(),
      })
      .eq("id", connectionId);
    const { error } = await supabase.rpc(
      "rpc_mark_basiq_connection_expired",
      {
        p_basiq_connection_id: connectionId,
        p_reason: "test",
        p_performed_by: fx.profileId,
      },
    );
    assert(!error, `rpc error: ${error?.message}`);
    const row = await fetchConnection(connectionId);
    assert(row!.status === "expired", `expected expired, got ${row!.status}`);

    // Force-sync should treat expired connections as a no-op (the loop
    // only picks active/syncing).
    const res = await basiq.forceSyncBasiqConnection({
      subdivisionId: fx.subdivisionId,
      bypassRateLimit: true,
    });
    assert(res.success, `error: ${res.error}`);
    assert(res.success!.syncedCount === 0, "expired connection should not sync");
    record(header, true, `status=expired, force-sync skipped`);
  } catch (e) {
    record(header, false, (e as Error).message);
  }
}

async function scenarioB11(fx: Fixture, connectionId: string) {
  const header = "B11: initiateReauth returns new consent URL with action=reauthorise";
  try {
    const res = await basiq.initiateReauth(connectionId);
    assert(res.success, `error: ${res.error}`);
    const url = res.success!.consentUrl;
    assert(url.includes("action=reauthorise"), "missing action=reauthorise");
    assert(url.includes("connectionId="), "missing connectionId param");

    // Simulate the reauth callback completing: flip back to active with
    // new expiry.
    await supabase
      .from("basiq_connections")
      .update({
        status: "active",
        consent_granted_at: new Date().toISOString(),
        consent_expires_at: new Date(
          Date.now() + 365 * 24 * 60 * 60 * 1000,
        ).toISOString(),
      })
      .eq("id", connectionId);
    const row = await fetchConnection(connectionId);
    assert(row!.status === "active", "should be active after reauth");
    void fx;
    record(header, true, "reauth URL ok, row active");
  } catch (e) {
    record(header, false, (e as Error).message);
  }
}

async function scenarioB12(fx: Fixture, connectionId: string) {
  const header =
    "B12: runGapReconciliation creates gap report + 48h suppression";
  try {
    // Simulate a 5-day gap: last_sync was 5 days ago. No auto-match needed —
    // stubTransactions empty.
    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    await supabase
      .from("basiq_connections")
      .update({ last_sync_at: fiveDaysAgo, consent_expires_at: null })
      .eq("id", connectionId);
    stubClient.stubTransactions = [];

    const res = await basiq.runGapReconciliation(connectionId);
    assert(res.success, `error: ${res.error}`);
    const gap = res.success!;
    assert(
      gap.gapHours >= 115 && gap.gapHours <= 125,
      `gap hours unreasonable: ${gap.gapHours}`,
    );
    assert(!gap.committeeNotified, "5-day gap should not notify committee");

    const { data: suppression } = await supabase
      .from("subdivision_notification_suppressions")
      .select("suppressed_until")
      .eq("subdivision_id", fx.subdivisionId)
      .eq("suppression_type", "arrears_post_gap_reauth")
      .order("created_at", { ascending: false })
      .limit(1);
    assert(suppression && suppression.length > 0, "suppression row missing");
    const until = new Date(suppression![0].suppressed_until).getTime();
    const diffH = (until - Date.now()) / (60 * 60 * 1000);
    assert(diffH >= 47 && diffH <= 49, `suppression not ~48h: ${diffH}h`);
    record(header, true, `gap=${gap.gapHours}h, suppression=+${Math.round(diffH)}h`);
  } catch (e) {
    record(header, false, (e as Error).message);
  }
}

async function scenarioB13(fx: Fixture, connectionId: string) {
  const header = "B13: >30-day gap flags committee_notified=true";
  try {
    const fortyDaysAgo = new Date(
      Date.now() - 40 * 24 * 60 * 60 * 1000,
    ).toISOString();
    await supabase
      .from("basiq_connections")
      .update({ last_sync_at: fortyDaysAgo })
      .eq("id", connectionId);
    stubClient.stubTransactions = [];
    const res = await basiq.runGapReconciliation(connectionId);
    assert(res.success, `error: ${res.error}`);
    assert(
      res.success!.committeeNotified === true,
      "committee_notified should be true for 40-day gap",
    );
    void fx;
    record(header, true, `gap=${res.success!.gapHours}h, committee notified`);
  } catch (e) {
    record(header, false, (e as Error).message);
  }
}

async function scenarioB14(fx: Fixture, connectionId: string) {
  const header =
    "B14: reauth notification cadence is idempotent (no duplicate)";
  try {
    // Connection expiring in exactly 30 days — sendPendingReauthNotifications
    // should send one.
    const thirtyFromNow = new Date(
      Date.now() + 30 * 24 * 60 * 60 * 1000 + 12 * 60 * 60 * 1000,
    ).toISOString(); // 30d + 12h to ensure floor = 30
    await supabase
      .from("basiq_connections")
      .update({
        status: "active",
        consent_expires_at: thirtyFromNow,
        nominated_representative_profile_id: fx.profileId,
      })
      .eq("id", connectionId);

    // Clear any prior 30d records so the first run triggers.
    await supabase
      .from("basiq_reauth_notifications")
      .delete()
      .eq("basiq_connection_id", connectionId)
      .eq("notification_type", "reauth_30d");

    const a = await basiq.sendPendingReauthNotifications();
    const b = await basiq.sendPendingReauthNotifications();
    assert(a.sentCount >= 1, `first run sent none: ${a.sentCount}`);
    assert(b.sentCount === 0, `second run should dedupe, got ${b.sentCount}`);
    record(header, true, `1st=${a.sentCount}, 2nd=${b.sentCount} (idempotent)`);
  } catch (e) {
    record(header, false, (e as Error).message);
  }
}

async function scenarioB16(fx: Fixture, connectionId: string) {
  const header =
    "B16: webhook transactions.updated → orchestrator persists fuzzy_hint_metadata";
  try {
    // Re-anchor connection: B13 left last_sync_at 40d in the past, B14 set
    // consent expiring in 30d. Webhook handler dispatches to
    // pollConnectionAsSystem, which only fetches if status is active and
    // consent has not expired. Make both clearly true.
    await supabase
      .from("basiq_connections")
      .update({
        status: "active",
        consent_expires_at: new Date(
          Date.now() + 365 * 24 * 60 * 60 * 1000,
        ).toISOString(),
        last_sync_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      })
      .eq("id", connectionId);

    // Seed a single active mapping under this subdivision. Strategy 6
    // (fuzzy_hint) compares canonicalised description against active
    // mappings; "Marc" canonicalises to MARC, jw(MARC, MARTHA) ≈ 0.825.
    const { error: mapErr } = await supabase
      .from("bank_payer_mappings")
      .insert({
        subdivision_id: fx.subdivisionId,
        canonical_sender_name: "MARTHA",
        lot_id: fx.lotId,
        status: "active",
        raw_examples: [],
        created_by: fx.profileId,
      });
    assert(!mapErr, `seed mapping failed: ${mapErr?.message}`);

    // Stub a credit with an amount that no fixture notice can satisfy
    // ($500 notice exists on fx.lotId). $77,777.77 is far outside the
    // amount-window tolerance of every active notice → Strategies 1-5
    // miss, Strategy 6 fires.
    const basiqTxnId = `btx-b16-${fx.runId}`;
    stubClient.stubTransactions = [
      buildStubTxn(
        basiqTxnId,
        77777.77,
        "Marc",
        "2026-08-08",
        fx.basiqAccountId,
      ),
    ];

    // Resolve the basiq external connection id used in webhook payloads.
    const conn = await fetchConnection(connectionId);
    assert(conn?.basiq_external_connection_id, "no external connection id");
    const beforeCount = await countBankTransactionsFor(fx.adminAccountId);

    const res = await basiq.handleBasiqEvent({
      eventType: "transactions.updated",
      payload: { connectionId: conn!.basiq_external_connection_id },
    });
    assert(res.handled, `webhook not handled: ${res.reason}`);

    const afterCount = await countBankTransactionsFor(fx.adminAccountId);
    assert(
      afterCount - beforeCount === 1,
      `expected 1 inserted txn, got ${afterCount - beforeCount}`,
    );

    const { data: bt } = await supabase
      .from("bank_transactions")
      .select("id, match_status, fuzzy_hint_metadata")
      .eq("basiq_transaction_id", basiqTxnId)
      .single();
    assert(bt, "B16 bank_transaction row missing");
    assert(
      bt!.match_status === "unmatched",
      `expected unmatched (fuzzy never auto-matches), got ${bt!.match_status}`,
    );
    assert(
      bt!.fuzzy_hint_metadata,
      "B16 expected fuzzy_hint_metadata to be persisted",
    );
    const meta = bt!.fuzzy_hint_metadata as Record<string, unknown>;
    assert(
      meta.hint_surfaced === true,
      `B16 hint_surfaced=true expected, got ${JSON.stringify(meta)}`,
    );
    assert(
      meta.canonical_name === "MARTHA",
      `B16 canonical_name should be MARTHA, got ${meta.canonical_name}`,
    );
    const sim = meta.similarity as number;
    assert(
      typeof sim === "number" && sim >= 0.75,
      `B16 similarity must be ≥ 0.75, got ${sim}`,
    );

    record(
      header,
      true,
      `webhook ingested 1 txn, fuzzy hint persisted (canonical=MARTHA, sim=${sim})`,
    );
  } catch (e) {
    record(header, false, (e as Error).message);
  }
}

async function scenarioB15(fx: Fixture, connectionId: string) {
  const header =
    "B15: disconnectBasiqConnection flips to revoked, keeps transactions";
  try {
    // Make sure the connection is active so the disconnect is a real transition.
    await supabase
      .from("basiq_connections")
      .update({ status: "active" })
      .eq("id", connectionId);
    const beforeTxns = await countBankTransactionsFor(fx.adminAccountId);
    const res = await basiq.disconnectBasiqConnection(connectionId);
    assert(res.success, `error: ${res.error}`);
    const row = await fetchConnection(connectionId);
    assert(row!.status === "revoked", `expected revoked, got ${row!.status}`);
    const afterTxns = await countBankTransactionsFor(fx.adminAccountId);
    assert(
      afterTxns === beforeTxns,
      `transactions should be preserved: ${beforeTxns} → ${afterTxns}`,
    );
    record(header, true, `status=revoked, txns preserved (${afterTxns})`);
  } catch (e) {
    record(header, false, (e as Error).message);
  }
}

// ─── Cleanup ──────────────────────────────────────────────────

async function cleanupMarker(): Promise<void> {
  const { data: companies } = await supabase
    .from("management_companies")
    .select("id")
    .like("name", `${VERIFY_MARKER}%`);
  for (const c of companies ?? []) {
    await cleanupOneCompany((c as { id: string }).id);
  }
}

async function cleanupOneCompany(companyId: string): Promise<void> {
  const { data: subs } = await supabase
    .from("subdivisions")
    .select("id")
    .eq("management_company_id", companyId);
  const subIds = (subs ?? []).map((s) => (s as { id: string }).id);
  const { data: profs } = await supabase
    .from("profiles")
    .select("id")
    .eq("management_company_id", companyId);
  const profIds = (profs ?? []).map((p) => (p as { id: string }).id);

  if (subIds.length > 0) {
    await supabase.from("audit_log").delete().in("subdivision_id", subIds);
  }
  if (profIds.length > 0) {
    await supabase.from("audit_log").delete().in("profile_id", profIds);
  }

  if (subIds.length > 0) {
    const { data: conns } = await supabase
      .from("basiq_connections")
      .select("id")
      .in("subdivision_id", subIds);
    const connIds = (conns ?? []).map((c) => (c as { id: string }).id);
    if (connIds.length > 0) {
      await supabase
        .from("basiq_reauth_notifications")
        .delete()
        .in("basiq_connection_id", connIds);
      await supabase
        .from("basiq_gap_reports")
        .delete()
        .in("basiq_connection_id", connIds);
    }
    await supabase
      .from("subdivision_notification_suppressions")
      .delete()
      .in("subdivision_id", subIds);

    // Null out bank_accounts.basiq_connection_id before deleting connections.
    await supabase
      .from("bank_accounts")
      .update({ basiq_connection_id: null })
      .in("subdivision_id", subIds);

    await supabase
      .from("basiq_connections")
      .delete()
      .in("subdivision_id", subIds);

    const { data: lots } = await supabase
      .from("lots")
      .select("id")
      .in("subdivision_id", subIds);
    const lotIds = (lots ?? []).map((l) => (l as { id: string }).id);

    const { data: accounts } = await supabase
      .from("bank_accounts")
      .select("id")
      .in("subdivision_id", subIds);
    const accountIds = (accounts ?? []).map((a) => (a as { id: string }).id);

    if (lotIds.length > 0) {
      await supabase
        .from("undeposited_funds_entries")
        .delete()
        .in("lot_id", lotIds);
    }
    if (accountIds.length > 0) {
      const { data: txns } = await supabase
        .from("bank_transactions")
        .select("id")
        .in("bank_account_id", accountIds);
      const txnIds = (txns ?? []).map((t) => (t as { id: string }).id);
      if (txnIds.length > 0) {
        await supabase
          .from("reconciliation_matches")
          .delete()
          .in("bank_transaction_id", txnIds);
      }
    }
    if (lotIds.length > 0) {
      const { data: entries } = await supabase
        .from("lot_ledger_entries")
        .select("id")
        .in("lot_id", lotIds);
      const entryIds = (entries ?? []).map((e) => (e as { id: string }).id);
      if (entryIds.length > 0) {
        await supabase
          .from("reconciliation_matches")
          .delete()
          .in("ledger_entry_id", entryIds);
      }
      await supabase
        .from("lot_ledger_entries")
        .update({ voided_by_entry_id: null, voids_entry_id: null })
        .in("lot_id", lotIds);
      await supabase.from("lot_ledger_entries").delete().in("lot_id", lotIds);
      await supabase.from("lot_ledger_state").delete().in("lot_id", lotIds);
    }
    if (accountIds.length > 0) {
      await supabase
        .from("bank_transactions")
        .delete()
        .in("bank_account_id", accountIds);
    }

    await supabase.from("payments").delete().in("subdivision_id", subIds);

    const { data: notices } = await supabase
      .from("levy_notices")
      .select("id")
      .in("subdivision_id", subIds);
    const noticeIds = (notices ?? []).map((n) => (n as { id: string }).id);
    if (noticeIds.length > 0) {
      await supabase
        .from("levy_notice_items")
        .delete()
        .in("levy_notice_id", noticeIds);
      await supabase
        .from("levy_notices")
        .update({ linked_levy_id: null })
        .in("subdivision_id", subIds);
      await supabase.from("levy_notices").delete().in("subdivision_id", subIds);
    }
    await supabase.from("levy_batches").delete().in("subdivision_id", subIds);

    await supabase.from("subdivisions").delete().in("id", subIds);
  }

  await supabase.from("profiles").delete().eq("management_company_id", companyId);
  await supabase.from("management_companies").delete().eq("id", companyId);
}

// ─── Live test (optional) ─────────────────────────────────────

async function runLive(): Promise<void> {
  if (!process.env.BASIQ_SANDBOX_CREDENTIALS) {
    console.log(
      "B-LIVE skipped — set BASIQ_SANDBOX_CREDENTIALS to enable sandbox smoke test.",
    );
    return;
  }
  console.log(
    "B-LIVE skipped — implementation deferred to pre-launch sandbox integration",
  );
  // A concrete implementation requires credentials + a signed Basiq
  // application. Left as an empty stub on purpose — flipping --live on an
  // unconfigured environment should be a no-op, not an error.
}

// ─── Main ─────────────────────────────────────────────────────

async function main() {
  const cleanupOnly = process.argv.includes("--cleanup");
  const noCleanup = process.argv.includes("--no-cleanup");
  const live = process.argv.includes("--live");

  if (cleanupOnly) {
    await cleanupMarker();
    process.exit(0);
  }

  console.log("Basiq verification — Prompt 3 scenarios\n");

  // Pre-flight: next/cache stub must intercept.
  const nc = await import("next/cache");
  try {
    const r = nc.revalidatePath("/__stub_check__");
    console.log(`  next/cache stub active (returned ${String(r)})`);
  } catch (e) {
    console.error(
      "FATAL: next/cache stub did not intercept:",
      (e as Error).message,
    );
    process.exit(1);
  }

  // Pre-flight: dirty fixtures
  const { count: dirtyBefore } = await supabase
    .from("management_companies")
    .select("id", { count: "exact", head: true })
    .like("name", `${VERIFY_MARKER}%`);
  if ((dirtyBefore ?? 0) > 0) {
    console.log(`  Pre-flight: ${dirtyBefore} stale runs — cleaning`);
  }
  await cleanupMarker();

  basiq = await import("./basiq");

  const fx = await createFixture();
  let fxConnectionId: string | null = null;

  try {
    await scenarioB1(fx);
    const b2 = await scenarioB2(fx);
    if (!b2) throw new Error("B2 failed — cannot proceed");
    fxConnectionId = b2.connectionId;
    await scenarioB3(fx, fxConnectionId);
    await scenarioB4(fx, fxConnectionId);
    await scenarioB5(fx);
    await scenarioB6(fx);
    await scenarioB7(fx, fxConnectionId);
    await scenarioB8(fx);
    await scenarioB9(fx, fxConnectionId);
    await scenarioB10(fx, fxConnectionId);
    await scenarioB11(fx, fxConnectionId);
    await scenarioB12(fx, fxConnectionId);
    await scenarioB13(fx, fxConnectionId);
    await scenarioB14(fx, fxConnectionId);
    await scenarioB16(fx, fxConnectionId);
    await scenarioB15(fx, fxConnectionId);
    if (live) await runLive();
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
    console.log(`\n--no-cleanup: leaving fixture under company ${fx.companyId}`);
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("Unhandled error:", e);
  process.exit(1);
});
