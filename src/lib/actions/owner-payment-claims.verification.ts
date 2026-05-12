/**
 * Owner self-report payment claim verification (PP5-C).
 *
 * Exercises the 6 server actions end-to-end against the live Supabase
 * dev DB. Multi-tenant fixture: companies A and B, each with a
 * manager profile and a lot_owner profile. Cross-tenant isolation
 * scenarios swap the active user via the auth-resolver shim.
 *
 * Usage:
 *   npx tsx src/lib/actions/owner-payment-claims.verification.ts
 *   npx tsx src/lib/actions/owner-payment-claims.verification.ts --no-cleanup
 *   npx tsx src/lib/actions/owner-payment-claims.verification.ts --cleanup
 */

import { config } from "dotenv";
config({ path: ".env.local" });

// PP6-C-2: every submitOwnerPaymentClaim call now fans out via
// emitNewClaimSubmitted. Force EMAIL_DRY_RUN=true so existing PP5-C
// scenarios + new M-* scenarios don't issue real Resend sends. Set
// BEFORE @/lib/email is imported (transitively via the action).
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

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const VERIFY_MARKER = "__VERIFY_OPC__";

// ─── User-swap injection seam ─────────────────────────────────────────────
// One __set call total (per the auth-resolver.ts pre-launch grep convention).
// Active user is mutable so scenarios can swap identity per assertion.

let activeClerkId: string | null = null;
__setUserIdResolverForVerification(async () => activeClerkId);
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

function asUser(clerkId: string) {
  activeClerkId = clerkId;
}

// ─── Fixture ──────────────────────────────────────────────────────────────

interface CompanyFixture {
  companyId: string;
  managerProfileId: string;
  managerClerkId: string;
  ownerProfileId: string;
  ownerClerkId: string;
  subdivisionId: string;
  budgetId: string;
  bankAccountId: string;
  /** Lot the owner owns (active membership). */
  lotOwnedId: string;
  /** Lot the owner does NOT own (no membership). */
  lotUnownedId: string;
  noticeId: string; // outstanding $500 levy on lotOwned
}

interface Fixture {
  runId: string;
  companyA: CompanyFixture;
  companyB: CompanyFixture;
}

async function createCompanyFixture(suffix: string): Promise<CompanyFixture> {
  const runId = `${Date.now()}_${randomUUID().slice(0, 8)}_${suffix}`;
  const companyName = `${VERIFY_MARKER}${runId}`;
  const managerEmail = `${VERIFY_MARKER.toLowerCase()}${runId}_mgr@opc.test`;
  const ownerEmail = `${VERIFY_MARKER.toLowerCase()}${runId}_owner@opc.test`;
  const managerClerkId = `${VERIFY_MARKER}_MGR_${runId}`;
  const ownerClerkId = `${VERIFY_MARKER}_OWNER_${runId}`;

  const { data: company } = await supabase
    .from("management_companies")
    .insert({ name: companyName })
    .select("id")
    .single();
  assert(company, `fixture: company ${suffix} insert failed`);

  const { data: manager } = await supabase
    .from("profiles")
    .insert({
      auth_user_id: managerClerkId,
      email: managerEmail,
      first_name: "OPC",
      last_name: `Mgr${suffix}`,
      role: "strata_manager",
      company_role: "admin",
      management_company_id: company.id,
    })
    .select("id")
    .single();
  assert(manager, "fixture: manager profile insert failed");

  const { data: owner } = await supabase
    .from("profiles")
    .insert({
      auth_user_id: ownerClerkId,
      email: ownerEmail,
      first_name: "OPC",
      last_name: `Owner${suffix}`,
      role: "lot_owner",
    })
    .select("id")
    .single();
  assert(owner, "fixture: owner profile insert failed");

  const { data: subdivision } = await supabase
    .from("subdivisions")
    .insert({
      management_company_id: company.id,
      name: companyName,
      plan_number: `PLAN-${runId}`,
      short_code: generateSubdivisionCode(),
      address: `1 OPC Verify ${suffix} St, Melbourne VIC 3000`,
      total_lots: 2,
      created_by: manager.id,
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
      approved_by: manager.id,
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
  const lotOwnedId = lots[0].id;
  const lotUnownedId = lots[1].id;

  // Owner owns lot 1 only.
  await supabase.from("subdivision_members").insert({
    subdivision_id: subdivision.id,
    profile_id: owner.id,
    lot_id: lotOwnedId,
    role: "lot_owner",
    is_primary_contact: true,
    is_financial: true,
  });

  // PP6-C-2: emitNewClaimSubmitted resolves manager recipients via
  // subdivision_members WHERE role='strata_manager'. Manager-of-company
  // is the access-control path elsewhere; subdivision_members is the
  // notification-recipient path. Add an explicit manager membership row
  // so the manager fan-out scenarios resolve them as recipients.
  await supabase.from("subdivision_members").insert({
    subdivision_id: subdivision.id,
    profile_id: manager.id,
    role: "strata_manager",
    is_primary_contact: false,
    is_financial: false,
  });

  const { data: bankAccount } = await supabase
    .from("bank_accounts")
    .insert({
      subdivision_id: subdivision.id,
      account_name: `OPC Admin ${suffix}`,
      bsb: "012-345",
      account_number: `${suffix === "A" ? "10001000" : "20002000"}`,
      fund_type: "administrative",
    })
    .select("id")
    .single();
  assert(bankAccount, "fixture: bank account insert failed");

  // $500 outstanding levy notice + debit on the owned lot, so manager-confirm
  // paths can allocate against it.
  const { data: notice } = await supabase
    .from("levy_notices")
    .insert({
      subdivision_id: subdivision.id,
      lot_id: lotOwnedId,
      budget_id: budget.id,
      reference_number: `LEV-${suffix === "A" ? "5001" : "6001"}`,
      bpay_crn: suffix === "A" ? "00050019" : "00060019",
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
  assert(notice, "fixture: notice insert failed");

  await supabase.from("lot_ledger_entries").insert({
    subdivision_id: subdivision.id,
    lot_id: lotOwnedId,
    fund_type: "administrative",
    entry_type: "debit",
    category: "levy",
    amount: 500,
    entry_date: "2026-01-01",
    reference: `LEV-${suffix === "A" ? "5001" : "6001"}`,
    levy_notice_id: notice.id,
    status: "active",
    created_by: manager.id,
  });

  return {
    companyId: company.id,
    managerProfileId: manager.id,
    managerClerkId,
    ownerProfileId: owner.id,
    ownerClerkId,
    subdivisionId: subdivision.id,
    budgetId: budget.id,
    bankAccountId: bankAccount.id,
    lotOwnedId,
    lotUnownedId,
    noticeId: notice.id,
  };
}

async function createFixture(): Promise<Fixture> {
  const runId = `${Date.now()}_${randomUUID().slice(0, 8)}`;
  console.log(`Creating multi-tenant fixture (runId=${runId})`);
  const companyA = await createCompanyFixture("A");
  const companyB = await createCompanyFixture("B");
  return { runId, companyA, companyB };
}

// ─── Scenarios ────────────────────────────────────────────────────────────

async function opc1_submitSucceeds(
  fx: Fixture,
  opc: typeof import("./owner-payment-claims"),
) {
  asUser(fx.companyA.ownerClerkId);
  const result = await opc.submitOwnerPaymentClaim({
    subdivision_id: fx.companyA.subdivisionId,
    lot_id: fx.companyA.lotOwnedId,
    amount: 250,
    claim_date: "2026-04-15",
    payment_method: "eft",
    reference: "LEV-5001",
    notes: "Bank transfer this morning",
  });
  assert(result.success, `OPC-1: ${result.error}`);

  const { data: row } = await supabase
    .from("owner_payment_claims")
    .select("claim_status, claimed_by_profile_id")
    .eq("id", result.success!.claim_id)
    .single();
  const r = row as { claim_status: string; claimed_by_profile_id: string };
  const { data: audit } = await supabase
    .from("audit_log")
    .select("action")
    .eq("entity_id", result.success!.claim_id)
    .eq("action", "owner_payment_claim.submitted")
    .maybeSingle();
  record(
    "OPC-1: submitOwnerPaymentClaim succeeds with claim_status='pending' and audit",
    r?.claim_status === "pending" && r.claimed_by_profile_id === fx.companyA.ownerProfileId && !!audit,
    `claim_status=${r?.claim_status}, audit=${audit ? "yes" : "no"}`,
  );
}

async function opc2_membershipRequired(
  fx: Fixture,
  opc: typeof import("./owner-payment-claims"),
) {
  // Owner B is a lot_owner but has no membership in subdivision A.
  asUser(fx.companyB.ownerClerkId);
  const result = await opc.submitOwnerPaymentClaim({
    subdivision_id: fx.companyA.subdivisionId,
    lot_id: fx.companyA.lotOwnedId,
    amount: 100,
    claim_date: "2026-04-15",
    payment_method: "eft",
  });
  record(
    "OPC-2: submitOwnerPaymentClaim returns LOT_OWNERSHIP_INVALID when membership missing",
    result.errorCode === "LOT_OWNERSHIP_INVALID",
    `errorCode=${result.errorCode}`,
  );
}

async function opc3_claimedByServerEnforced(
  fx: Fixture,
  opc: typeof import("./owner-payment-claims"),
) {
  // Owner A submits — claimed_by is server-enforced from auth, not from the
  // input. Action input has no claimed_by field at all (server takes it
  // from profile.id). This test re-confirms that point: the row's
  // claimed_by matches the active owner regardless.
  asUser(fx.companyA.ownerClerkId);
  const result = await opc.submitOwnerPaymentClaim({
    subdivision_id: fx.companyA.subdivisionId,
    lot_id: fx.companyA.lotOwnedId,
    amount: 75,
    claim_date: "2026-04-16",
    payment_method: "bpay",
  });
  assert(result.success, `OPC-3 setup: ${result.error}`);
  const { data: row } = await supabase
    .from("owner_payment_claims")
    .select("claimed_by_profile_id")
    .eq("id", result.success!.claim_id)
    .single();
  const r = row as { claimed_by_profile_id: string };
  record(
    "OPC-3: submitOwnerPaymentClaim enforces claimed_by_profile_id from auth (no spoofing)",
    r.claimed_by_profile_id === fx.companyA.ownerProfileId,
    `claimed_by=${r.claimed_by_profile_id}`,
  );
}

async function opc4_lotNotOwned(
  fx: Fixture,
  opc: typeof import("./owner-payment-claims"),
) {
  // Owner A tries to claim against lotUnownedId (no membership for that lot).
  asUser(fx.companyA.ownerClerkId);
  const result = await opc.submitOwnerPaymentClaim({
    subdivision_id: fx.companyA.subdivisionId,
    lot_id: fx.companyA.lotUnownedId,
    amount: 50,
    claim_date: "2026-04-16",
    payment_method: "cash",
  });
  record(
    "OPC-4: submitOwnerPaymentClaim returns LOT_OWNERSHIP_INVALID when owner doesn't own the lot",
    result.errorCode === "LOT_OWNERSHIP_INVALID",
    `errorCode=${result.errorCode}`,
  );
}

async function opc5_listMyClaims(
  fx: Fixture,
  opc: typeof import("./owner-payment-claims"),
) {
  asUser(fx.companyA.ownerClerkId);
  const result = await opc.listMyPaymentClaims();
  // OPC-1 + OPC-3 both submitted as owner A → at least 2 claims expected.
  const allOwned = result.rows.every((r) => r.subdivision_id === fx.companyA.subdivisionId);
  record(
    "OPC-5: listMyPaymentClaims returns the owner's own claims",
    result.rows.length >= 2 && allOwned,
    `count=${result.rows.length}, all in subdivisionA=${allOwned}`,
  );
}

async function opc6_crossOwnerIsolation(
  fx: Fixture,
  opc: typeof import("./owner-payment-claims"),
) {
  asUser(fx.companyB.ownerClerkId);
  const result = await opc.listMyPaymentClaims();
  record(
    "OPC-6: listMyPaymentClaims for owner B doesn't return owner A's claims",
    result.rows.length === 0,
    `owner B sees ${result.rows.length} claim(s)`,
  );
}

async function opc7_listPendingClaims(
  fx: Fixture,
  opc: typeof import("./owner-payment-claims"),
) {
  asUser(fx.companyA.managerClerkId);
  // PP5-D-C-A: action renamed to listManagerPaymentClaims with optional
  // { orphan?: boolean }. Default behaviour (no opts) returns pending —
  // OPC-7 covers that branch; PD-2 covers the orphan branch.
  const result = await opc.listManagerPaymentClaims(fx.companyA.subdivisionId);
  record(
    "OPC-7: listManagerPaymentClaims (default) returns pending claims for the manager's subdivision",
    result.rows.length >= 2 && result.rows.every((r) => r.claim_status === "pending"),
    `count=${result.rows.length}, all pending=${result.rows.every((r) => r.claim_status === "pending")}`,
  );
}

async function opc8_confirmViaExisting(
  fx: Fixture,
  opc: typeof import("./owner-payment-claims"),
) {
  // Owner submits a fresh claim for $200.
  asUser(fx.companyA.ownerClerkId);
  const submit = await opc.submitOwnerPaymentClaim({
    subdivision_id: fx.companyA.subdivisionId,
    lot_id: fx.companyA.lotOwnedId,
    amount: 200,
    claim_date: "2026-04-20",
    payment_method: "eft",
  });
  assert(submit.success, `OPC-8 setup submit: ${submit.error}`);

  // Manager creates a bank tx that the claim corresponds to.
  asUser(fx.companyA.managerClerkId);
  const { data: bankTx } = await supabase
    .from("bank_transactions")
    .insert({
      bank_account_id: fx.companyA.bankAccountId,
      source: "manual",
      transaction_date: "2026-04-20",
      amount: 200,
      description: "Claim test path-iii bank tx",
      match_status: "unmatched",
    })
    .select("id")
    .single();
  assert(bankTx, "OPC-8 setup bankTx insert failed");

  // Manager confirms-and-matches via the existing bank tx.
  const result = await opc.confirmAndMatchClaimViaExistingBankTx({
    claim_id: submit.success!.claim_id,
    bank_transaction_id: bankTx.id,
    allocations: [
      {
        lot_id: fx.companyA.lotOwnedId,
        fund_type: "administrative",
        amount: 200,
        levy_notice_id: fx.companyA.noticeId,
      },
    ],
  });
  if (!result.success) {
    record("OPC-8: confirmAndMatchClaimViaExistingBankTx", false, result.error ?? "no error");
    return;
  }

  const { data: claim } = await supabase
    .from("owner_payment_claims")
    .select("claim_status, bank_transaction_id, ledger_entry_id, reviewed_by_profile_id")
    .eq("id", submit.success!.claim_id)
    .single();
  const c = claim as {
    claim_status: string;
    bank_transaction_id: string | null;
    ledger_entry_id: string | null;
    reviewed_by_profile_id: string | null;
  };
  const { data: audit } = await supabase
    .from("audit_log")
    .select("action")
    .eq("entity_id", submit.success!.claim_id)
    .eq("action", "owner_payment_claim.matched")
    .maybeSingle();
  record(
    "OPC-8: confirmAndMatchClaimViaExistingBankTx — full state transition + audit",
    c.claim_status === "matched" &&
      c.bank_transaction_id === bankTx.id &&
      c.ledger_entry_id === result.success.ledger_entry_id &&
      c.reviewed_by_profile_id === fx.companyA.managerProfileId &&
      !!audit,
    `status=${c.claim_status}, bank_tx_set=${!!c.bank_transaction_id}, ledger_set=${!!c.ledger_entry_id}, audit=${audit ? "yes" : "no"}`,
  );
}

async function opc9_confirmViaNewBankTx(
  fx: Fixture,
  opc: typeof import("./owner-payment-claims"),
) {
  // Setup: pre-existing candidate bank tx (same account, +/-2 days, same
  // amount). The claim is submitted with the same shape; manager uses
  // path (ii) with override_likely_duplicate=true. The PP5-A bank-side
  // detector should fire on the new manual bank tx and mark
  // duplicate_status='suspected' / duplicate_of=candidate. This proves
  // the post-insert detector hook actually ran inside path (ii) — not
  // just that the chain executed.
  // Both bank txs share the same description so PP5-A's hash-equality
  // detector flags the new one. (PP5-A normalises + hashes; identical
  // descriptions hash-match. See CONTEXT.md PP5 §4.7.)
  const SHARED_DESCRIPTION = "OPC-9 BPAY transfer JANE BROWN";
  const { data: candidate } = await supabase
    .from("bank_transactions")
    .insert({
      bank_account_id: fx.companyA.bankAccountId,
      source: "basiq",
      transaction_date: "2026-04-25",
      amount: 90,
      description: SHARED_DESCRIPTION,
      match_status: "unmatched",
    })
    .select("id")
    .single();
  assert(candidate, "OPC-9 setup: candidate bank tx insert failed");

  asUser(fx.companyA.ownerClerkId);
  const submit = await opc.submitOwnerPaymentClaim({
    subdivision_id: fx.companyA.subdivisionId,
    lot_id: fx.companyA.lotOwnedId,
    amount: 90,
    claim_date: "2026-04-25",
    payment_method: "bpay",
  });
  assert(submit.success, `OPC-9 setup submit: ${submit.error}`);

  asUser(fx.companyA.managerClerkId);
  const result = await opc.confirmAndMatchClaimViaNewBankTx({
    claim_id: submit.success!.claim_id,
    bank_account_id: fx.companyA.bankAccountId,
    transaction_date: "2026-04-25",
    description: SHARED_DESCRIPTION,
    override_likely_duplicate: true,
    allocations: [
      {
        lot_id: fx.companyA.lotOwnedId,
        fund_type: "administrative",
        amount: 90,
        levy_notice_id: fx.companyA.noticeId,
      },
    ],
  });
  if (!result.success) {
    record("OPC-9: confirmAndMatchClaimViaNewBankTx + PP5-A detector", false, result.error ?? "no error");
    return;
  }

  const { data: claim } = await supabase
    .from("owner_payment_claims")
    .select("claim_status, bank_transaction_id, ledger_entry_id")
    .eq("id", submit.success!.claim_id)
    .single();
  const c = claim as {
    claim_status: string;
    bank_transaction_id: string | null;
    ledger_entry_id: string | null;
  };
  const { data: newBankTx } = await supabase
    .from("bank_transactions")
    .select("source, duplicate_status, duplicate_of")
    .eq("id", result.success.bank_transaction_id)
    .single();
  const ntx = newBankTx as {
    source: string;
    duplicate_status: string | null;
    duplicate_of: string | null;
  };
  const ok =
    c.claim_status === "matched" &&
    c.bank_transaction_id === result.success.bank_transaction_id &&
    c.ledger_entry_id !== null &&
    ntx.source === "manual" &&
    ntx.duplicate_status === "suspected" &&
    ntx.duplicate_of === candidate.id;
  record(
    "OPC-9: confirmAndMatchClaimViaNewBankTx — claim matched + PP5-A detector fired (duplicate_status=suspected, duplicate_of=candidate)",
    ok,
    `status=${c.claim_status}, new_tx.source=${ntx.source}, new_tx.dup_status=${ntx.duplicate_status}, dup_of_matches=${ntx.duplicate_of === candidate.id}`,
  );
}

async function opc10_rejectClaim(
  fx: Fixture,
  opc: typeof import("./owner-payment-claims"),
) {
  asUser(fx.companyA.ownerClerkId);
  const submit = await opc.submitOwnerPaymentClaim({
    subdivision_id: fx.companyA.subdivisionId,
    lot_id: fx.companyA.lotOwnedId,
    amount: 33,
    claim_date: "2026-04-26",
    payment_method: "cash",
  });
  assert(submit.success, `OPC-10 setup: ${submit.error}`);

  asUser(fx.companyA.managerClerkId);
  const result = await opc.rejectPaymentClaim({
    claim_id: submit.success!.claim_id,
    rejection_reason: "Could not verify in bank feed within 30 days",
  });
  assert(result.success, `OPC-10: ${result.error}`);

  const { data: claim } = await supabase
    .from("owner_payment_claims")
    .select("claim_status, rejection_reason, reviewed_by_profile_id, reviewed_at")
    .eq("id", submit.success!.claim_id)
    .single();
  const c = claim as {
    claim_status: string;
    rejection_reason: string | null;
    reviewed_by_profile_id: string | null;
    reviewed_at: string | null;
  };
  record(
    "OPC-10: rejectPaymentClaim — state transition rejected + rejection_reason set",
    c.claim_status === "rejected" &&
      c.rejection_reason === "Could not verify in bank feed within 30 days" &&
      c.reviewed_by_profile_id === fx.companyA.managerProfileId &&
      !!c.reviewed_at,
    `status=${c.claim_status}, reviewed=${!!c.reviewed_at}`,
  );
}

async function opc11_confirmAlreadyMatched(
  fx: Fixture,
  opc: typeof import("./owner-payment-claims"),
) {
  // Reuse the OPC-8 already-matched claim by re-fetching it.
  const { data: matched } = await supabase
    .from("owner_payment_claims")
    .select("id")
    .eq("subdivision_id", fx.companyA.subdivisionId)
    .eq("claim_status", "matched")
    .limit(1)
    .single();
  assert(matched, "OPC-11 setup: no matched claim found");

  asUser(fx.companyA.managerClerkId);
  // Try confirming via existing bank tx — should fail with NOT_PENDING.
  const { data: someBankTx } = await supabase
    .from("bank_transactions")
    .select("id")
    .eq("bank_account_id", fx.companyA.bankAccountId)
    .limit(1)
    .single();
  const result = await opc.confirmAndMatchClaimViaExistingBankTx({
    claim_id: (matched as { id: string }).id,
    bank_transaction_id: (someBankTx as { id: string }).id,
    allocations: [
      {
        lot_id: fx.companyA.lotOwnedId,
        fund_type: "administrative",
        amount: 1,
        levy_notice_id: fx.companyA.noticeId,
      },
    ],
  });
  record(
    "OPC-11: confirmAndMatchClaim* returns NOT_PENDING on already-matched claim",
    result.errorCode === "NOT_PENDING",
    `errorCode=${result.errorCode}`,
  );
}

async function opc12_rejectAlreadyMatched(
  fx: Fixture,
  opc: typeof import("./owner-payment-claims"),
) {
  const { data: matched } = await supabase
    .from("owner_payment_claims")
    .select("id")
    .eq("subdivision_id", fx.companyA.subdivisionId)
    .eq("claim_status", "matched")
    .limit(1)
    .single();
  assert(matched, "OPC-12 setup: no matched claim found");

  asUser(fx.companyA.managerClerkId);
  const result = await opc.rejectPaymentClaim({
    claim_id: (matched as { id: string }).id,
    rejection_reason: "Should be blocked — already matched",
  });
  record(
    "OPC-12: rejectPaymentClaim returns NOT_PENDING on already-matched claim",
    result.errorCode === "NOT_PENDING",
    `errorCode=${result.errorCode}`,
  );
}

async function opc13_crossCompanyIsolation(
  fx: Fixture,
  opc: typeof import("./owner-payment-claims"),
) {
  // Submit a claim in company B, then try to review it as company A's manager.
  asUser(fx.companyB.ownerClerkId);
  const submit = await opc.submitOwnerPaymentClaim({
    subdivision_id: fx.companyB.subdivisionId,
    lot_id: fx.companyB.lotOwnedId,
    amount: 60,
    claim_date: "2026-04-27",
    payment_method: "eft",
  });
  assert(submit.success, `OPC-13 setup: ${submit.error}`);

  asUser(fx.companyA.managerClerkId);
  const result = await opc.rejectPaymentClaim({
    claim_id: submit.success!.claim_id,
    rejection_reason: "Cross-company spoof attempt for OPC-13",
  });
  record(
    "OPC-13: cross-company isolation — manager A cannot review company B's claim",
    result.errorCode === "FORBIDDEN",
    `errorCode=${result.errorCode}`,
  );
}

async function opc14_rejectIsReadOnlyOnFinancials(
  fx: Fixture,
  opc: typeof import("./owner-payment-claims"),
) {
  asUser(fx.companyA.ownerClerkId);
  const submit = await opc.submitOwnerPaymentClaim({
    subdivision_id: fx.companyA.subdivisionId,
    lot_id: fx.companyA.lotOwnedId,
    amount: 22,
    claim_date: "2026-04-28",
    payment_method: "cash",
  });
  assert(submit.success, `OPC-14 setup: ${submit.error}`);

  // Snapshot bank_transactions and lot_ledger_entries counts.
  const { count: bankBefore } = await supabase
    .from("bank_transactions")
    .select("id", { count: "exact", head: true })
    .eq("bank_account_id", fx.companyA.bankAccountId);
  const { count: ledgerBefore } = await supabase
    .from("lot_ledger_entries")
    .select("id", { count: "exact", head: true })
    .eq("lot_id", fx.companyA.lotOwnedId);

  asUser(fx.companyA.managerClerkId);
  await opc.rejectPaymentClaim({
    claim_id: submit.success!.claim_id,
    rejection_reason: "Reject test — should not touch bank or ledger",
  });

  const { count: bankAfter } = await supabase
    .from("bank_transactions")
    .select("id", { count: "exact", head: true })
    .eq("bank_account_id", fx.companyA.bankAccountId);
  const { count: ledgerAfter } = await supabase
    .from("lot_ledger_entries")
    .select("id", { count: "exact", head: true })
    .eq("lot_id", fx.companyA.lotOwnedId);

  record(
    "OPC-14: rejectPaymentClaim leaves bank_transactions and lot_ledger_entries unchanged",
    bankAfter === bankBefore && ledgerAfter === ledgerBefore,
    `bank delta=${(bankAfter ?? 0) - (bankBefore ?? 0)}, ledger delta=${(ledgerAfter ?? 0) - (ledgerBefore ?? 0)}`,
  );
}

async function opc15_likelyDuplicateThenOverride(
  fx: Fixture,
  opc: typeof import("./owner-payment-claims"),
) {
  // Pre-existing bank tx that the manual entry would duplicate.
  await supabase.from("bank_transactions").insert({
    bank_account_id: fx.companyA.bankAccountId,
    source: "basiq",
    transaction_date: "2026-05-01",
    amount: 44,
    description: "Pre-existing tx for OPC-15",
    match_status: "unmatched",
  });

  asUser(fx.companyA.ownerClerkId);
  const submit = await opc.submitOwnerPaymentClaim({
    subdivision_id: fx.companyA.subdivisionId,
    lot_id: fx.companyA.lotOwnedId,
    amount: 44,
    claim_date: "2026-05-01",
    payment_method: "bpay",
  });
  assert(submit.success, `OPC-15 setup submit: ${submit.error}`);

  asUser(fx.companyA.managerClerkId);
  // First call without override → LIKELY_DUPLICATE.
  const blocked = await opc.confirmAndMatchClaimViaNewBankTx({
    claim_id: submit.success!.claim_id,
    bank_account_id: fx.companyA.bankAccountId,
    transaction_date: "2026-05-01",
    description: "Manual tx — should be blocked",
    allocations: [
      {
        lot_id: fx.companyA.lotOwnedId,
        fund_type: "administrative",
        amount: 44,
        levy_notice_id: fx.companyA.noticeId,
      },
    ],
  });
  const blockedOk =
    blocked.errorCode === "LIKELY_DUPLICATE" &&
    (blocked.likely_duplicate_bank_tx_ids ?? []).length >= 1;

  // Second call WITH override → proceeds.
  const proceeded = await opc.confirmAndMatchClaimViaNewBankTx({
    claim_id: submit.success!.claim_id,
    bank_account_id: fx.companyA.bankAccountId,
    transaction_date: "2026-05-01",
    description: "Manual tx — override OPC-15",
    override_likely_duplicate: true,
    allocations: [
      {
        lot_id: fx.companyA.lotOwnedId,
        fund_type: "administrative",
        amount: 44,
        levy_notice_id: fx.companyA.noticeId,
      },
    ],
  });

  record(
    "OPC-15: LIKELY_DUPLICATE blocks first call; override_likely_duplicate=true proceeds",
    blockedOk && proceeded.success?.claim_id === submit.success!.claim_id,
    `blocked errorCode=${blocked.errorCode}, candidates=${(blocked.likely_duplicate_bank_tx_ids ?? []).length}, override_succeeded=${!!proceeded.success}`,
  );
}

async function opc16_voidCascadeOrphan(
  fx: Fixture,
  opc: typeof import("./owner-payment-claims"),
  recon: typeof import("./reconciliation"),
) {
  // Submit + confirm-via-existing → claim_status='matched',
  // bank_transaction_id set. Then void the bank tx via the production
  // path (voidBankTransaction → UPDATE is_voided=true; reconciliation_matches
  // deleted via cascade; ledger credit voided via rpc_unmatch_bank_transaction).
  // The bank_transactions row itself is NEVER deleted (financial-data
  // invariant). FK ON DELETE SET NULL doesn't fire on UPDATE, so:
  //   - claim.bank_transaction_id STAYS SET (links to the now-voided tx)
  //   - claim.ledger_entry_id STAYS SET (links to the now-voided credit)
  //   - claim.claim_status STAYS 'matched' (no auto-update)
  // Documents PP5-C void-cascade orphan: matched claim points to voided
  // bank tx + voided ledger credit, all links present but stale.
  // Manager queue should surface "matched but underlying records voided"
  // in PP5-D as a filter. Real fix: trigger to flip claim_status, or
  // queue filter, or DB view that flags orphans. Decision deferred to
  // PP5-D or post-launch (see PRE_LAUNCH_CLEANUP).
  asUser(fx.companyA.ownerClerkId);
  const submit = await opc.submitOwnerPaymentClaim({
    subdivision_id: fx.companyA.subdivisionId,
    lot_id: fx.companyA.lotOwnedId,
    amount: 66,
    claim_date: "2026-05-05",
    payment_method: "eft",
  });
  assert(submit.success, `OPC-16 setup submit: ${submit.error}`);

  asUser(fx.companyA.managerClerkId);
  const { data: bankTx } = await supabase
    .from("bank_transactions")
    .insert({
      bank_account_id: fx.companyA.bankAccountId,
      source: "manual",
      transaction_date: "2026-05-05",
      amount: 66,
      description: "OPC-16 bank tx (will be voided)",
      match_status: "unmatched",
    })
    .select("id")
    .single();
  assert(bankTx, "OPC-16 setup bankTx insert failed");

  const matchResult = await opc.confirmAndMatchClaimViaExistingBankTx({
    claim_id: submit.success!.claim_id,
    bank_transaction_id: bankTx.id,
    allocations: [
      {
        lot_id: fx.companyA.lotOwnedId,
        fund_type: "administrative",
        amount: 66,
        levy_notice_id: fx.companyA.noticeId,
      },
    ],
  });
  assert(matchResult.success, `OPC-16 setup match: ${matchResult.error}`);
  const matchedLedgerId = matchResult.success!.ledger_entry_id;

  // Void via the PRODUCTION path — UPDATE is_voided=true, no DELETE.
  const voidResult = await recon.voidBankTransaction({
    subdivision_id: fx.companyA.subdivisionId,
    bank_transaction_id: bankTx.id,
    reason: "OPC-16: voided after match to test orphan documentation",
  });
  assert(voidResult.success, `OPC-16 void: ${voidResult.error}`);

  const { data: claim } = await supabase
    .from("owner_payment_claims")
    .select("claim_status, bank_transaction_id, ledger_entry_id")
    .eq("id", submit.success!.claim_id)
    .single();
  const c = claim as {
    claim_status: string;
    bank_transaction_id: string | null;
    ledger_entry_id: string | null;
  };
  const { data: btx } = await supabase
    .from("bank_transactions")
    .select("is_voided")
    .eq("id", bankTx.id)
    .single();
  const btxRow = btx as { is_voided: boolean } | null;

  // Stale state assertions:
  //   - bank tx is_voided=true (production void happened)
  //   - claim.bank_transaction_id stays SET (FK doesn't null on UPDATE)
  //   - claim.ledger_entry_id stays SET (ledger entry was voided not deleted)
  //   - claim.claim_status stays 'matched' (no auto-update)
  const ok =
    btxRow?.is_voided === true &&
    c.bank_transaction_id === bankTx.id &&
    c.ledger_entry_id === matchedLedgerId &&
    c.claim_status === "matched";
  record(
    "OPC-16: void-cascade orphan — bank tx voided via UPDATE; claim links STAY SET, claim_status STAYS 'matched' (PP5-D filter required)",
    ok,
    `bank_is_voided=${btxRow?.is_voided}, claim_bank_tx_id_set=${c.bank_transaction_id === bankTx.id}, claim_ledger_id_set=${c.ledger_entry_id === matchedLedgerId}, claim_status=${c.claim_status}`,
  );
}

// ─── PD-2: orphan filter on listManagerPaymentClaims (PP5-D-C-A) ─────────
// Sets up matched claims in each of the four orphan triggers + a healthy
// matched control row. Asserts:
//   - listManagerPaymentClaims (default) returns NEITHER (all are matched
//     not pending). Sanity check.
//   - listManagerPaymentClaims with orphan=true returns ONLY the four
//     orphans, excluding the healthy control.

async function pd2_orphanFilter(
  fx: Fixture,
  opc: typeof import("./owner-payment-claims"),
) {
  const header =
    "PD-2: listManagerPaymentClaims orphan filter — returns matched claims with any of 4 orphan triggers; default returns pending only";
  try {
    // Build a dedicated lot for PD-2 to avoid contamination from earlier
    // OPC scenarios (which used companyA.lotOwnedId for many setups).
    const { data: pd2Lot } = await supabase
      .from("lots")
      .insert({
        subdivision_id: fx.companyA.subdivisionId,
        lot_number: 99,
        lot_entitlement: 100,
        lot_liability: 100,
      })
      .select("id")
      .single();
    assert(pd2Lot, "PD-2 setup: lot insert failed");
    const pd2LotId = pd2Lot.id;
    await supabase.from("subdivision_members").insert({
      subdivision_id: fx.companyA.subdivisionId,
      profile_id: fx.companyA.ownerProfileId,
      lot_id: pd2LotId,
      role: "lot_owner",
      is_primary_contact: false,
      is_financial: true,
    });

    // Build a notice + outstanding $500 debit on the new lot so confirm
    // paths can allocate.
    const { data: pd2Notice } = await supabase
      .from("levy_notices")
      .insert({
        subdivision_id: fx.companyA.subdivisionId,
        lot_id: pd2LotId,
        budget_id: fx.companyA.budgetId,
        reference_number: "LEV-PD2",
        bpay_crn: "00000018",
        fund_type: "administrative",
        levy_type: "regular",
        period_start: "2026-04-01",
        period_end: "2026-06-30",
        amount: 500,
        due_date: "2026-07-28",
        status: "draft",
      })
      .select("id")
      .single();
    assert(pd2Notice, "PD-2 setup: notice insert failed");
    const pd2NoticeId = pd2Notice.id;
    await supabase.from("lot_ledger_entries").insert({
      subdivision_id: fx.companyA.subdivisionId,
      lot_id: pd2LotId,
      fund_type: "administrative",
      entry_type: "debit",
      category: "levy",
      amount: 500,
      entry_date: "2026-04-01",
      reference: "LEV-PD2",
      levy_notice_id: pd2NoticeId,
      status: "active",
      created_by: fx.companyA.managerProfileId,
    });

    // Helper: submit + confirm-via-existing for a $X claim. Returns the
    // claim_id and the matched bank_tx_id + ledger_entry_id.
    async function submitAndMatchExisting(amount: number, claimDate: string, txDate: string) {
      asUser(fx.companyA.ownerClerkId);
      const submit = await opc.submitOwnerPaymentClaim({
        subdivision_id: fx.companyA.subdivisionId,
        lot_id: pd2LotId,
        amount,
        claim_date: claimDate,
        payment_method: "eft",
      });
      assert(submit.success, `PD-2 submit failed: ${submit.error}`);
      asUser(fx.companyA.managerClerkId);
      const { data: bankTx } = await supabase
        .from("bank_transactions")
        .insert({
          bank_account_id: fx.companyA.bankAccountId,
          source: "manual",
          transaction_date: txDate,
          amount,
          description: `PD-2 setup ${amount}`,
          match_status: "unmatched",
        })
        .select("id")
        .single();
      assert(bankTx, "PD-2 bank_transaction insert failed");
      const matchRes = await opc.confirmAndMatchClaimViaExistingBankTx({
        claim_id: submit.success!.claim_id,
        bank_transaction_id: bankTx.id,
        allocations: [
          {
            lot_id: pd2LotId,
            fund_type: "administrative",
            amount,
            levy_notice_id: pd2NoticeId,
          },
        ],
      });
      assert(matchRes.success, `PD-2 match failed: ${matchRes.error}`);
      return {
        claim_id: submit.success!.claim_id,
        bank_tx_id: bankTx.id,
        ledger_entry_id: matchRes.success!.ledger_entry_id,
      };
    }

    // (a) bank_transaction_id IS NULL — hand-craft the FK SET NULL state.
    const a = await submitAndMatchExisting(11, "2026-05-01", "2026-05-01");
    await supabase
      .from("owner_payment_claims")
      .update({ bank_transaction_id: null })
      .eq("id", a.claim_id);

    // (b) bt.is_voided=true — production void via voidBankTransaction.
    const b = await submitAndMatchExisting(22, "2026-05-02", "2026-05-02");
    const recon = await import("./reconciliation");
    asUser(fx.companyA.managerClerkId);
    const voidRes = await recon.voidBankTransaction({
      subdivision_id: fx.companyA.subdivisionId,
      bank_transaction_id: b.bank_tx_id,
      reason: "PD-2 orphan trigger (b): production void path",
    });
    assert(voidRes.success, `PD-2 (b) void failed: ${voidRes.error}`);

    // (c) ledger_entry_id IS NULL — hand-craft the FK SET NULL state.
    const c = await submitAndMatchExisting(33, "2026-05-03", "2026-05-03");
    await supabase
      .from("owner_payment_claims")
      .update({ ledger_entry_id: null })
      .eq("id", c.claim_id);

    // (d) ledger_entry status='voided' — production rpc_ledger_void.
    // The match was via confirmAndMatchClaimViaExistingBankTx which created
    // a credit ledger entry. Void it via rpc_ledger_void directly.
    const d = await submitAndMatchExisting(44, "2026-05-04", "2026-05-04");
    await supabase.rpc("rpc_ledger_void", {
      p_entry_id: d.ledger_entry_id,
      p_reason: "PD-2 orphan trigger (d): direct ledger void",
      p_voided_by: fx.companyA.managerProfileId,
    });

    // (e) Healthy matched control — no orphan trigger.
    const e = await submitAndMatchExisting(55, "2026-05-05", "2026-05-05");

    // Default branch (orphan=undefined): pending claims only. None of our
    // 5 setups are pending — so they should NOT appear in the result.
    asUser(fx.companyA.managerClerkId);
    const pendingOnly = await opc.listManagerPaymentClaims(fx.companyA.subdivisionId);
    const pendingIds = new Set(pendingOnly.rows.map((r) => r.id));
    const allFiveExcludedFromPending =
      !pendingIds.has(a.claim_id) &&
      !pendingIds.has(b.claim_id) &&
      !pendingIds.has(c.claim_id) &&
      !pendingIds.has(d.claim_id) &&
      !pendingIds.has(e.claim_id);

    // Orphan branch: matched + any of (a,b,c,d) — but NOT (e).
    const orphans = await opc.listManagerPaymentClaims(fx.companyA.subdivisionId, {
      orphan: true,
    });
    const orphanIds = new Set(orphans.rows.map((r) => r.id));
    const fourOrphansIncluded =
      orphanIds.has(a.claim_id) &&
      orphanIds.has(b.claim_id) &&
      orphanIds.has(c.claim_id) &&
      orphanIds.has(d.claim_id);
    const healthyExcluded = !orphanIds.has(e.claim_id);

    const ok = allFiveExcludedFromPending && fourOrphansIncluded && healthyExcluded;
    record(
      header,
      ok,
      `pending excludes all 5: ${allFiveExcludedFromPending} (count=${pendingOnly.rows.length}); orphan includes 4: ${fourOrphansIncluded} (count=${orphans.rows.length}); healthy excluded: ${healthyExcluded}`,
    );
  } catch (e) {
    record(header, false, (e as Error).message);
  }
}

// ─── PP6-C-2: emitNewClaimSubmitted manager fan-out scenarios ────────────

// Add a second strata_manager profile to the given company so we can
// assert multi-manager fan-out + per-manager opt-out independence.
async function addSecondManager(
  fx: Fixture,
): Promise<{ profileId: string; clerkId: string }> {
  const tag = `${fx.runId}_2`;
  const clerkId = `${VERIFY_MARKER}_MGR2_${tag}`;
  const { data: manager } = await supabase
    .from("profiles")
    .insert({
      auth_user_id: clerkId,
      email: `${VERIFY_MARKER.toLowerCase()}${tag}_mgr2@opc.test`,
      first_name: "OPC",
      last_name: "Mgr2",
      role: "strata_manager",
      company_role: "admin",
      management_company_id: fx.companyA.companyId,
    })
    .select("id")
    .single();
  const profileId = (manager as { id: string }).id;

  await supabase.from("subdivision_members").insert({
    subdivision_id: fx.companyA.subdivisionId,
    profile_id: profileId,
    role: "strata_manager",
    is_primary_contact: false,
    is_financial: false,
  });

  return { profileId, clerkId };
}

async function m1_fanOutToAllManagers(
  fx: Fixture,
  opc: typeof import("./owner-payment-claims"),
  secondMgrId: string,
) {
  asUser(fx.companyA.ownerClerkId);
  const submitted = await opc.submitOwnerPaymentClaim({
    subdivision_id: fx.companyA.subdivisionId,
    lot_id: fx.companyA.lotOwnedId,
    amount: 175,
    claim_date: "2026-04-21",
    payment_method: "eft",
    notes: "M-1 fan-out test",
  });
  if (!submitted.success) {
    record("M-1: fan-out skipped", false, `submit failed: ${submitted.error}`);
    return;
  }
  const claimId = submitted.success.claim_id;

  // communication_log row per active manager (the existing manager + the
  // newly-added second manager) for type='new_claim_submitted'.
  const { data: rows } = await supabase
    .from("communication_log")
    .select("recipient_id, type, status, related_entity_id")
    .eq("related_entity_id", claimId)
    .eq("type", "new_claim_submitted");
  const list = (rows ?? []) as Array<{
    recipient_id: string;
    type: string;
    status: string;
    related_entity_id: string;
  }>;
  const recipientSet = new Set(list.map((r) => r.recipient_id));
  const ok =
    list.length === 2 &&
    recipientSet.has(fx.companyA.managerProfileId) &&
    recipientSet.has(secondMgrId);
  record(
    "M-1: submitOwnerPaymentClaim fans out new_claim_submitted to all active managers",
    ok,
    `count=${list.length} mgr1_in=${recipientSet.has(fx.companyA.managerProfileId)} mgr2_in=${recipientSet.has(secondMgrId)}`,
  );
}

async function m2_inAppNotificationsRow(
  fx: Fixture,
  opc: typeof import("./owner-payment-claims"),
  secondMgrId: string,
) {
  asUser(fx.companyA.ownerClerkId);
  const submitted = await opc.submitOwnerPaymentClaim({
    subdivision_id: fx.companyA.subdivisionId,
    lot_id: fx.companyA.lotOwnedId,
    amount: 185,
    claim_date: "2026-04-22",
    payment_method: "bpay",
  });
  if (!submitted.success) {
    record("M-2: notifications-row skipped", false, `submit failed: ${submitted.error}`);
    return;
  }
  const claimId = submitted.success.claim_id;

  const { data: rows } = await supabase
    .from("notifications")
    .select("profile_id, type, link")
    .eq("subdivision_id", fx.companyA.subdivisionId)
    .eq("type", "new_claim_submitted");
  const list = (rows ?? []) as Array<{ profile_id: string; type: string; link: string | null }>;
  // Should include rows for BOTH managers (this submission's fan-out)
  // plus possibly residual rows from M-1 (also for both managers).
  const recipientSet = new Set(list.map((r) => r.profile_id));
  const linkLooksRight = list.every((r) =>
    !!r.link && r.link.includes("/reconciliation/claims"),
  );
  const ok =
    recipientSet.has(fx.companyA.managerProfileId) &&
    recipientSet.has(secondMgrId) &&
    linkLooksRight;
  record(
    "M-2: emitNewClaimSubmitted writes notifications row per manager (link points to claims queue)",
    ok,
    `count=${list.length} mgr1=${recipientSet.has(fx.companyA.managerProfileId)} mgr2=${recipientSet.has(secondMgrId)} link_ok=${linkLooksRight} (claim=${claimId.slice(0, 8)})`,
  );
}

async function m3_perManagerOptOut(
  fx: Fixture,
  opc: typeof import("./owner-payment-claims"),
  secondMgrId: string,
) {
  // Mgr2 opts out of email channel for new_claim_submitted; Mgr1 stays opt-in.
  await supabase.from("notification_preferences").insert({
    profile_id: secondMgrId,
    notification_type: "new_claim_submitted",
    channel: "email",
    enabled: false,
  });

  asUser(fx.companyA.ownerClerkId);
  const submitted = await opc.submitOwnerPaymentClaim({
    subdivision_id: fx.companyA.subdivisionId,
    lot_id: fx.companyA.lotOwnedId,
    amount: 195,
    claim_date: "2026-04-23",
    payment_method: "eft",
  });
  if (!submitted.success) {
    record("M-3: opt-out skipped", false, `submit failed: ${submitted.error}`);
    await supabase
      .from("notification_preferences")
      .delete()
      .eq("profile_id", secondMgrId)
      .eq("notification_type", "new_claim_submitted");
    return;
  }
  const claimId = submitted.success.claim_id;

  const { data: rows } = await supabase
    .from("communication_log")
    .select("recipient_id")
    .eq("related_entity_id", claimId)
    .eq("type", "new_claim_submitted");
  const recipients = new Set(
    (rows ?? []).map((r) => (r as { recipient_id: string }).recipient_id),
  );

  // In-app notifications row STILL written for both managers (managerial
  // events bypass in-app opt-out per PP6-C-0 SG-2).
  const { data: notifRows } = await supabase
    .from("notifications")
    .select("profile_id")
    .eq("subdivision_id", fx.companyA.subdivisionId)
    .eq("type", "new_claim_submitted");
  const notifRecipients = new Set(
    (notifRows ?? []).map((r) => (r as { profile_id: string }).profile_id),
  );

  await supabase
    .from("notification_preferences")
    .delete()
    .eq("profile_id", secondMgrId)
    .eq("notification_type", "new_claim_submitted");

  const ok =
    recipients.has(fx.companyA.managerProfileId) &&
    !recipients.has(secondMgrId) &&
    notifRecipients.has(fx.companyA.managerProfileId) &&
    notifRecipients.has(secondMgrId);
  record(
    "M-3: per-manager email opt-out respected (mgr2 skipped); in-app row still written for both",
    ok,
    `email_recipients=${recipients.size} mgr2_email_skipped=${!recipients.has(secondMgrId)} mgr2_inapp_present=${notifRecipients.has(secondMgrId)}`,
  );
}

async function m4_dryRunBehavior(
  fx: Fixture,
  opc: typeof import("./owner-payment-claims"),
) {
  // The whole suite runs with EMAIL_DRY_RUN=true, so any submitOwnerPaymentClaim
  // here fans out via dry-run. Confirm: communication_log rows land in
  // 'queued' state (not 'sent'), audit log records the dry_run action,
  // and the in-app notifications row is unaffected.
  asUser(fx.companyA.ownerClerkId);
  const submitted = await opc.submitOwnerPaymentClaim({
    subdivision_id: fx.companyA.subdivisionId,
    lot_id: fx.companyA.lotOwnedId,
    amount: 205,
    claim_date: "2026-04-24",
    payment_method: "cash",
  });
  if (!submitted.success) {
    record("M-4: dry-run skipped", false, `submit failed: ${submitted.error}`);
    return;
  }
  const claimId = submitted.success.claim_id;

  const { data: log } = await supabase
    .from("communication_log")
    .select("status")
    .eq("related_entity_id", claimId)
    .eq("type", "new_claim_submitted")
    .limit(1)
    .maybeSingle();
  const l = log as { status: string } | null;

  const { data: audit } = await supabase
    .from("audit_log")
    .select("action")
    .eq("entity_id", claimId)
    .eq("action", "communication.new_claim_submitted.dry_run")
    .limit(1)
    .maybeSingle();

  const { count: notifCount } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("subdivision_id", fx.companyA.subdivisionId)
    .eq("type", "new_claim_submitted");

  const ok =
    !!l &&
    l.status === "queued" &&
    !!audit &&
    (notifCount ?? 0) > 0;
  record(
    "M-4: dry-run leaves comm_log queued + writes dry_run audit + in-app notifications unaffected",
    ok,
    `log_status=${l?.status} audit=${audit ? "yes" : "no"} notif_count=${notifCount}`,
  );
}

// ─── Cleanup ──────────────────────────────────────────────────────────────

async function cleanupMarker(): Promise<void> {
  const { data: companies } = await supabase
    .from("management_companies")
    .select("id")
    .like("name", `${VERIFY_MARKER}%`);
  for (const c of companies ?? []) {
    await cleanupCompany(c.id);
  }
  // Also clean up the orphan owner profiles tagged by marker email.
  await supabase.from("profiles").delete().like("email", `${VERIFY_MARKER.toLowerCase()}%`);
}

async function cleanupCompany(companyId: string): Promise<void> {
  const { data: subs } = await supabase
    .from("subdivisions")
    .select("id")
    .eq("management_company_id", companyId);
  const subIds = (subs ?? []).map((s) => s.id);
  if (subIds.length > 0) {
    // owner_payment_claims first (FKs into bank_transactions and ledger).
    await supabase.from("owner_payment_claims").delete().in("subdivision_id", subIds);

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
    // PP6-C-2: emitNewClaimSubmitted writes to communication_log + notifications.
    await supabase.from("communication_log").delete().in("subdivision_id", subIds);
    await supabase.from("notifications").delete().in("subdivision_id", subIds);
    await supabase.from("audit_log").delete().in("subdivision_id", subIds);
    await supabase.from("subdivision_members").delete().in("subdivision_id", subIds);
    await supabase.from("subdivisions").delete().in("id", subIds);
  }
  // PP6-C-2: notification_preferences rows for this company's profiles
  // (auto-opt-out from M-3 + Clerk-seeded rows for new test profiles).
  const { data: profileRows } = await supabase
    .from("profiles")
    .select("id")
    .eq("management_company_id", companyId);
  const profileIds = (profileRows ?? []).map((p) => (p as { id: string }).id);
  if (profileIds.length > 0) {
    await supabase.from("notification_preferences").delete().in("profile_id", profileIds);
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

  console.log("Owner self-report payment claim verification — PP5-C scenarios\n");
  console.log("[1/3] Cleaning up stale verification data");
  await cleanupMarker();

  console.log("[2/3] Creating fixture");
  const fx = await createFixture();

  console.log("[3/3] Running scenarios\n");

  const opc = await import("./owner-payment-claims");
  const recon = await import("./reconciliation");

  await opc1_submitSucceeds(fx, opc);
  await opc2_membershipRequired(fx, opc);
  await opc3_claimedByServerEnforced(fx, opc);
  await opc4_lotNotOwned(fx, opc);
  await opc5_listMyClaims(fx, opc);
  await opc6_crossOwnerIsolation(fx, opc);
  await opc7_listPendingClaims(fx, opc);
  await opc8_confirmViaExisting(fx, opc);
  await opc9_confirmViaNewBankTx(fx, opc);
  await opc10_rejectClaim(fx, opc);
  await opc11_confirmAlreadyMatched(fx, opc);
  await opc12_rejectAlreadyMatched(fx, opc);
  await opc13_crossCompanyIsolation(fx, opc);
  await opc14_rejectIsReadOnlyOnFinancials(fx, opc);
  await opc15_likelyDuplicateThenOverride(fx, opc);
  await opc16_voidCascadeOrphan(fx, opc, recon);
  await pd2_orphanFilter(fx, opc);

  // PP6-C-2 manager fan-out scenarios (M-1..M-4). Add a second strata
  // manager to companyA so multi-manager fan-out can be observed.
  const secondMgr = await addSecondManager(fx);
  await m1_fanOutToAllManagers(fx, opc, secondMgr.profileId);
  await m2_inAppNotificationsRow(fx, opc, secondMgr.profileId);
  await m3_perManagerOptOut(fx, opc, secondMgr.profileId);
  await m4_dryRunBehavior(fx, opc);

  if (!noCleanup) {
    console.log("\nCleaning up");
    await cleanupCompany(fx.companyA.companyId);
    await cleanupCompany(fx.companyB.companyId);
  }

  const failed = results.filter((r) => !r.passed).length;
  console.log(`\n${results.length - failed}/${results.length} scenarios passed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
