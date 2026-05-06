"use server";

// ============================================================================
// Owner self-report payment claim — server actions (PP5-C)
// ----------------------------------------------------------------------------
// Owner-side: submit + list-my-claims.
// Manager-side: list-pending + confirmAndMatchClaim* (two paths) + reject.
//
// Auth boundaries (per PP5-C scope):
// - Owner actions: requireRole(['lot_owner']) + subdivision_members
//   ownership check + claimed_by_profile_id server-enforced (input value
//   is ignored; profile.id from auth wins).
// - Manager actions: requireCompanyRole() + requireSubdivisionAccess
//   (claim.subdivision_id) for cross-company isolation.
//
// Manager-confirm hybrid (PP5-C Gap C ratification):
// - Path (iii) PRIMARY: link to existing bank tx; calls
//   reconcileTransaction internally (PP5-B ledger detector runs).
// - Path (ii) FALLBACK: create new manual bank tx; calls
//   addManualBankTransaction (PP5-A bank detector runs) +
//   reconcileTransaction. LIKELY_DUPLICATE pre-check lookup runs
//   first; override_likely_duplicate=true bypasses.
// ============================================================================

import { revalidatePath } from "next/cache";
import { createServerClient } from "@/lib/supabase";
import {
  requireCompanyRole,
  requireRole,
  requireSubdivisionAccess,
} from "@/lib/auth";
import {
  submitOwnerPaymentClaimSchema,
  confirmAndMatchClaimViaExistingBankTxSchema,
  confirmAndMatchClaimViaNewBankTxSchema,
  rejectPaymentClaimSchema,
  type SubmitOwnerPaymentClaimInput,
  type ConfirmAndMatchClaimViaExistingBankTxInput,
  type ConfirmAndMatchClaimViaNewBankTxInput,
  type RejectPaymentClaimInput,
  type OwnerPaymentClaimErrorCode,
  type OwnerClaimPaymentMethod,
  type ClaimStatus,
  type MyPaymentClaimRow,
  type ManagerClaimQueueRow,
} from "@/lib/validations/owner-payment-claims";
import { addManualBankTransaction, reconcileTransaction } from "./reconciliation";
import {
  emitClaimMatchedEmail,
  emitClaimRejectedEmail,
} from "@/lib/notifications";
import type { MatchStatus } from "@/lib/validations/reconciliation";

function formatIssues(issues: { message: string }[]): string {
  return issues.map((i) => i.message).join("; ");
}

// ─── Result types ─────────────────────────────────────────────────────────

export type SubmitOwnerPaymentClaimResult = {
  success?: { claim_id: string };
  error?: string;
  errorCode?: OwnerPaymentClaimErrorCode;
};

export type ListMyPaymentClaimsResult = {
  rows: MyPaymentClaimRow[];
};

export type ListPendingPaymentClaimsResult = {
  rows: ManagerClaimQueueRow[];
};

/** PP5-D-C-A: alias of {@link ListPendingPaymentClaimsResult} for the
 *  renamed `listManagerPaymentClaims` (which optionally returns orphaned
 *  claims via { orphan: true } per Gap Q ratification). The row shape is
 *  identical — only the query branch differs. */
export type ListManagerPaymentClaimsResult = ListPendingPaymentClaimsResult;

export interface ListManagerPaymentClaimsOptions {
  /** When true: return MATCHED claims that are orphaned — bank tx voided
   *  or ledger entry voided, OR FK SET NULL fired. Mutually exclusive with
   *  the default (returns pending claims).
   *  See CONTEXT.md PP5 §4.10 (orphan filter). */
  orphan?: boolean;
}

export type ConfirmClaimResult = {
  success?: {
    claim_id: string;
    bank_transaction_id: string;
    ledger_entry_id: string;
  };
  error?: string;
  errorCode?: OwnerPaymentClaimErrorCode;
  /** PP5-C Gap C: when path (ii) hits LIKELY_DUPLICATE, the candidate
   *  bank tx ids are surfaced so the manager can switch to path (iii)
   *  or pass override_likely_duplicate=true. */
  likely_duplicate_bank_tx_ids?: string[];
};

export type RejectPaymentClaimResult = {
  success?: { claim_id: string };
  error?: string;
  errorCode?: OwnerPaymentClaimErrorCode;
};

// ─── Lot-label resolver ───────────────────────────────────────────────────

function lotLabel(lot: { lot_number: number | null; unit_number: string | null }): string {
  const base = lot.lot_number !== null ? `Lot ${lot.lot_number}` : "Lot ?";
  return lot.unit_number ? `${base} (Unit ${lot.unit_number})` : base;
}

// ============================================================================
// OWNER-SIDE ACTIONS
// ============================================================================

export async function submitOwnerPaymentClaim(
  input: SubmitOwnerPaymentClaimInput,
): Promise<SubmitOwnerPaymentClaimResult> {
  const parsed = submitOwnerPaymentClaimSchema.safeParse(input);
  if (!parsed.success) return { error: formatIssues(parsed.error.issues) };

  // Owner-only flow. requireRole resolves the authenticated profile.
  const profile = await requireRole(["lot_owner"]);
  const supabase = createServerClient();

  // Ownership check — active membership for (profile, subdivision, lot).
  // claimed_by_profile_id is taken from `profile.id` (server-enforced),
  // ignoring any client-sent value. PP5-C OPC-3 verifies this.
  const { data: membership } = await supabase
    .from("subdivision_members")
    .select("id")
    .eq("profile_id", profile.id)
    .eq("subdivision_id", parsed.data.subdivision_id)
    .eq("lot_id", parsed.data.lot_id)
    .eq("role", "lot_owner")
    .is("left_at", null)
    .maybeSingle();

  if (!membership) {
    return {
      error: "You are not registered as a lot_owner for the selected lot",
      errorCode: "LOT_OWNERSHIP_INVALID",
    };
  }

  const { data: inserted, error: insErr } = await supabase
    .from("owner_payment_claims")
    .insert({
      subdivision_id: parsed.data.subdivision_id,
      lot_id: parsed.data.lot_id,
      claimed_by_profile_id: profile.id,
      amount: parsed.data.amount,
      claim_date: parsed.data.claim_date,
      payment_method: parsed.data.payment_method,
      reference: parsed.data.reference ?? null,
      notes: parsed.data.notes ?? null,
      claim_status: "pending",
    })
    .select("id")
    .single();
  if (insErr || !inserted) return { error: insErr?.message ?? "Insert failed" };

  await supabase.from("audit_log").insert({
    profile_id: profile.id,
    subdivision_id: parsed.data.subdivision_id,
    action: "owner_payment_claim.submitted",
    entity_type: "owner_payment_claim",
    entity_id: inserted.id,
    after_state: {
      claim_status: "pending",
      lot_id: parsed.data.lot_id,
      amount: parsed.data.amount,
      claim_date: parsed.data.claim_date,
      payment_method: parsed.data.payment_method,
    },
  });

  revalidatePath("/subdivisions/[subdivisionCode]/my-payments", "page");
  return { success: { claim_id: inserted.id } };
}

export async function listMyPaymentClaims(
  subdivisionId?: string,
): Promise<ListMyPaymentClaimsResult> {
  const profile = await requireRole(["lot_owner"]);
  const supabase = createServerClient();

  let query = supabase
    .from("owner_payment_claims")
    .select(
      "id, subdivision_id, lot_id, amount, claim_date, payment_method, reference, notes, claim_status, rejection_reason, bank_transaction_id, ledger_entry_id, reviewed_at, created_at",
    )
    .eq("claimed_by_profile_id", profile.id)
    .order("created_at", { ascending: false });
  if (subdivisionId) query = query.eq("subdivision_id", subdivisionId);

  const { data: rows } = await query;
  if (!rows || rows.length === 0) return { rows: [] };

  // Resolve lot labels in one round-trip.
  const lotIds = Array.from(new Set(rows.map((r) => r.lot_id as string)));
  const { data: lots } = await supabase
    .from("lots")
    .select("id, lot_number, unit_number")
    .in("id", lotIds);
  const lotMap = new Map<string, { lot_number: number | null; unit_number: string | null }>();
  for (const l of lots ?? []) {
    lotMap.set((l as { id: string }).id, {
      lot_number: (l as { lot_number: number | null }).lot_number,
      unit_number: (l as { unit_number: string | null }).unit_number,
    });
  }

  return {
    rows: rows.map((r) => {
      const row = r as {
        id: string;
        subdivision_id: string;
        lot_id: string;
        amount: number | string;
        claim_date: string;
        payment_method: OwnerClaimPaymentMethod;
        reference: string | null;
        notes: string | null;
        claim_status: ClaimStatus;
        rejection_reason: string | null;
        bank_transaction_id: string | null;
        ledger_entry_id: string | null;
        reviewed_at: string | null;
        created_at: string;
      };
      const lot = lotMap.get(row.lot_id);
      return {
        id: row.id,
        subdivision_id: row.subdivision_id,
        lot_id: row.lot_id,
        lot_label: lot ? lotLabel(lot) : "Lot ?",
        amount: Number(row.amount),
        claim_date: row.claim_date,
        payment_method: row.payment_method,
        reference: row.reference,
        notes: row.notes,
        claim_status: row.claim_status,
        rejection_reason: row.rejection_reason,
        bank_transaction_id: row.bank_transaction_id,
        ledger_entry_id: row.ledger_entry_id,
        reviewed_at: row.reviewed_at,
        created_at: row.created_at,
      };
    }),
  };
}

// ============================================================================
// MANAGER-SIDE ACTIONS
// ============================================================================

/**
 * PP5-D-C-A: renamed from listPendingPaymentClaims. Default behaviour
 * returns pending claims (preserves PP5-C semantics). With { orphan: true }
 * returns MATCHED claims that are orphaned per the four orphan triggers
 * (Gap D ratification):
 *   1. bank_transaction_id IS NULL (FK SET NULL fired post-match)
 *   2. linked bank tx is_voided = true (production void path)
 *   3. ledger_entry_id IS NULL
 *   4. linked ledger entry status = 'voided'
 *
 * Pending and orphaned are mutually exclusive lists. The page-level
 * `?orphan=1` chip pivots between them; header copy reflects which list
 * is active.
 */
export async function listManagerPaymentClaims(
  subdivisionId: string,
  opts: ListManagerPaymentClaimsOptions = {},
): Promise<ListManagerPaymentClaimsResult> {
  await requireCompanyRole();
  await requireSubdivisionAccess(subdivisionId);
  const supabase = createServerClient();

  if (opts.orphan === true) {
    // Orphan branch: matched claims with at least one orphan trigger.
    // PostgREST embedded relations expose nullable single-row joins for
    // FKs that are SET NULL on cascade — bt and le may come back as null
    // or as a single object. We do the orphan-condition test in TS after
    // the LEFT-joined fetch so the SQL stays simple + the filter logic
    // is expressible without OR-on-nested-fields.
    const { data: rawRows } = await supabase
      .from("owner_payment_claims")
      .select(
        "id, subdivision_id, lot_id, claimed_by_profile_id, amount, claim_date, payment_method, reference, notes, claim_status, created_at, bank_transaction_id, ledger_entry_id, bt:bank_transactions!bank_transaction_id(is_voided), le:lot_ledger_entries!ledger_entry_id(status)",
      )
      .eq("subdivision_id", subdivisionId)
      .eq("claim_status", "matched")
      .order("created_at", { ascending: false });

    const orphans = (rawRows ?? []).filter((r) => {
      const row = r as {
        bank_transaction_id: string | null;
        ledger_entry_id: string | null;
        bt: { is_voided: boolean } | Array<{ is_voided: boolean }> | null;
        le: { status: string } | Array<{ status: string }> | null;
      };
      const btShape = Array.isArray(row.bt) ? row.bt[0] ?? null : row.bt;
      const leShape = Array.isArray(row.le) ? row.le[0] ?? null : row.le;
      return (
        row.bank_transaction_id === null ||
        row.ledger_entry_id === null ||
        btShape?.is_voided === true ||
        leShape?.status === "voided"
      );
    });
    if (orphans.length === 0) return { rows: [] };

    return await hydrateManagerClaimRows(supabase, orphans);
  }

  // Default branch: pending claims (PP5-C behaviour preserved).
  const { data: rows } = await supabase
    .from("owner_payment_claims")
    .select(
      "id, subdivision_id, lot_id, claimed_by_profile_id, amount, claim_date, payment_method, reference, notes, claim_status, created_at",
    )
    .eq("subdivision_id", subdivisionId)
    .eq("claim_status", "pending")
    .order("created_at", { ascending: false });

  if (!rows || rows.length === 0) return { rows: [] };
  return await hydrateManagerClaimRows(supabase, rows);
}

// ─── hydrateManagerClaimRows shared helper ────────────────────────────────
//
// Resolves lot labels + owner names via two batched queries; returns the
// full ManagerClaimQueueRow[] shape. Used by both branches of
// listManagerPaymentClaims (pending + orphan) so the row-display
// resolution is single-sourced.

async function hydrateManagerClaimRows(
  supabase: ReturnType<typeof createServerClient>,
  rows: Array<Record<string, unknown>>,
): Promise<ListManagerPaymentClaimsResult> {
  // Resolve lot labels + owner names in two batched queries.
  const lotIds = Array.from(new Set(rows.map((r) => r.lot_id as string)));
  const profileIds = Array.from(new Set(rows.map((r) => r.claimed_by_profile_id as string)));

  const [{ data: lots }, { data: profiles }] = await Promise.all([
    supabase.from("lots").select("id, lot_number, unit_number").in("id", lotIds),
    supabase.from("profiles").select("id, first_name, last_name, email").in("id", profileIds),
  ]);

  const lotMap = new Map<string, { lot_number: number | null; unit_number: string | null }>();
  for (const l of lots ?? []) {
    lotMap.set((l as { id: string }).id, {
      lot_number: (l as { lot_number: number | null }).lot_number,
      unit_number: (l as { unit_number: string | null }).unit_number,
    });
  }
  const profileMap = new Map<string, { first_name: string | null; last_name: string | null; email: string }>();
  for (const p of profiles ?? []) {
    profileMap.set((p as { id: string }).id, {
      first_name: (p as { first_name: string | null }).first_name,
      last_name: (p as { last_name: string | null }).last_name,
      email: (p as { email: string }).email,
    });
  }

  return {
    rows: rows.map((r) => {
      const row = r as {
        id: string;
        subdivision_id: string;
        lot_id: string;
        claimed_by_profile_id: string;
        amount: number | string;
        claim_date: string;
        payment_method: OwnerClaimPaymentMethod;
        reference: string | null;
        notes: string | null;
        claim_status: ClaimStatus;
        created_at: string;
      };
      const lot = lotMap.get(row.lot_id);
      const owner = profileMap.get(row.claimed_by_profile_id);
      const ownerDisplayName = owner
        ? [owner.first_name, owner.last_name].filter(Boolean).join(" ").trim() || owner.email
        : "Unknown";
      return {
        id: row.id,
        subdivision_id: row.subdivision_id,
        lot_id: row.lot_id,
        lot_label: lot ? lotLabel(lot) : "Lot ?",
        owner_display_name: ownerDisplayName,
        amount: Number(row.amount),
        claim_date: row.claim_date,
        payment_method: row.payment_method,
        reference: row.reference,
        notes: row.notes,
        claim_status: row.claim_status,
        created_at: row.created_at,
      };
    }),
  };
}

// ─── Nearby bank tx lookups (PP5-D-C-A) ───────────────────────────────────
//
// Two distinct entry points, two distinct semantics. Don't unify.
//
// 1. getNearbyBankTxsForClaim — BROAD lookup for SHOWING candidates in the
//    manager-claim-review dialog's match-existing stage. Subdivision-wide,
//    +/-7 days from claim_date, +/-$0.01 amount tolerance. Returns sorted:
//    exact-amount first, then date-proximity. UI consumer is a candidate
//    list with "Use this one" CTAs per row.
//
// 2. getBankTxSnapshotsByIds — NARROW lookup for HYDRATING the IDs that
//    PP5-C's LIKELY_DUPLICATE pre-check returned. Atomic-snapshot semantic
//    (Q5.6 ratification) — the IDs returned by the action ARE the
//    snapshot; we just need their display fields. Subdivision check
//    enforced via sample bank tx → bank_account.subdivision_id chain;
//    cross-subdivision IDs cause a FORBIDDEN-style error.
//
// CONTEXT.md PP5 §4.10 documents the two-query distinction.

export interface NearbyBankTxRow {
  id: string;
  bank_account_id: string;
  bank_account_name: string;
  fund_type: "administrative" | "capital_works";
  source: "manual" | "csv" | "basiq";
  transaction_date: string;
  amount: number;
  description: string | null;
  match_status: MatchStatus;
  /** Signed day delta (positive = bank tx is AFTER claim date). */
  day_delta_from_claim_date: number;
  /** True when bt.amount === claim.amount exactly. Helps the UI sort
   *  and visually distinguish exact-match candidates. */
  is_amount_exact_match: boolean;
}

export type GetNearbyBankTxsForClaimResult =
  | { ok: true; rows: NearbyBankTxRow[]; claim_amount: number; claim_date: string }
  | { ok: false; error: string; errorCode: OwnerPaymentClaimErrorCode };

export async function getNearbyBankTxsForClaim(
  claimId: string,
): Promise<GetNearbyBankTxsForClaimResult> {
  await requireCompanyRole();
  const supabase = createServerClient();

  const { data: claim } = await supabase
    .from("owner_payment_claims")
    .select("id, subdivision_id, amount, claim_date")
    .eq("id", claimId)
    .maybeSingle();
  if (!claim) {
    return { ok: false, error: "Claim not found", errorCode: "NOT_FOUND" };
  }
  const c = claim as {
    id: string;
    subdivision_id: string;
    amount: number | string;
    claim_date: string;
  };

  try {
    await requireSubdivisionAccess(c.subdivision_id);
  } catch {
    return { ok: false, error: "Claim not found", errorCode: "FORBIDDEN" };
  }

  const claimAmount = Number(c.amount);
  const minAmount = claimAmount - 0.01;
  const maxAmount = claimAmount + 0.01;
  const minDate = shiftDate(c.claim_date, -7);
  const maxDate = shiftDate(c.claim_date, +7);

  // Find all bank accounts in this subdivision (scopes the query).
  const { data: accounts } = await supabase
    .from("bank_accounts")
    .select("id, account_name, fund_type")
    .eq("subdivision_id", c.subdivision_id);
  const accountIds = (accounts ?? []).map((a) => (a as { id: string }).id);
  if (accountIds.length === 0) {
    return { ok: true, rows: [], claim_amount: claimAmount, claim_date: c.claim_date };
  }
  const accountMap = new Map<string, { name: string; fund_type: "administrative" | "capital_works" }>();
  for (const a of accounts ?? []) {
    const row = a as { id: string; account_name: string; fund_type: "administrative" | "capital_works" };
    accountMap.set(row.id, { name: row.account_name, fund_type: row.fund_type });
  }

  const { data: candidates } = await supabase
    .from("bank_transactions")
    .select(
      "id, bank_account_id, source, transaction_date, amount, description, match_status",
    )
    .in("bank_account_id", accountIds)
    .eq("is_voided", false)
    .gte("transaction_date", minDate)
    .lte("transaction_date", maxDate)
    .gte("amount", minAmount)
    .lte("amount", maxAmount);

  const rows: NearbyBankTxRow[] = (candidates ?? []).map((r) => {
    const row = r as {
      id: string;
      bank_account_id: string;
      source: "manual" | "csv" | "basiq";
      transaction_date: string;
      amount: number | string;
      description: string | null;
      match_status: MatchStatus;
    };
    const acct = accountMap.get(row.bank_account_id);
    const amt = Number(row.amount);
    return {
      id: row.id,
      bank_account_id: row.bank_account_id,
      bank_account_name: acct?.name ?? "",
      fund_type: acct?.fund_type ?? "administrative",
      source: row.source,
      transaction_date: row.transaction_date,
      amount: amt,
      description: row.description,
      match_status: row.match_status,
      day_delta_from_claim_date: daysBetween(row.transaction_date, c.claim_date),
      is_amount_exact_match: amt === claimAmount,
    };
  });

  // Sort: exact-amount first; then date-proximity (|delta| asc); then date asc.
  rows.sort((a, b) => {
    if (a.is_amount_exact_match !== b.is_amount_exact_match) {
      return a.is_amount_exact_match ? -1 : 1;
    }
    const ad = Math.abs(a.day_delta_from_claim_date);
    const bd = Math.abs(b.day_delta_from_claim_date);
    if (ad !== bd) return ad - bd;
    return a.transaction_date.localeCompare(b.transaction_date);
  });

  return { ok: true, rows, claim_amount: claimAmount, claim_date: c.claim_date };
}

export type GetBankTxSnapshotsByIdsResult =
  | { ok: true; rows: NearbyBankTxRow[] }
  | { ok: false; error: string; errorCode: OwnerPaymentClaimErrorCode };

export async function getBankTxSnapshotsByIds(
  ids: string[],
  /** Anchor claim id — provides the claim_date for day_delta computation
   *  and the subdivision for the access check. The IDs must all belong
   *  to that subdivision (cross-subdivision leakage = FORBIDDEN). */
  anchorClaimId: string,
): Promise<GetBankTxSnapshotsByIdsResult> {
  await requireCompanyRole();
  const supabase = createServerClient();

  if (ids.length === 0) return { ok: true, rows: [] };

  const { data: claim } = await supabase
    .from("owner_payment_claims")
    .select("subdivision_id, amount, claim_date")
    .eq("id", anchorClaimId)
    .maybeSingle();
  if (!claim) {
    return { ok: false, error: "Claim not found", errorCode: "NOT_FOUND" };
  }
  const c = claim as { subdivision_id: string; amount: number | string; claim_date: string };

  try {
    await requireSubdivisionAccess(c.subdivision_id);
  } catch {
    return { ok: false, error: "Claim not found", errorCode: "FORBIDDEN" };
  }

  // Fetch bank txs joined with their bank_account so we can verify each
  // is in the claim's subdivision (no cross-subdivision leakage).
  const { data: rows } = await supabase
    .from("bank_transactions")
    .select(
      "id, bank_account_id, source, transaction_date, amount, description, match_status, bank_accounts!inner(subdivision_id, account_name, fund_type)",
    )
    .in("id", ids);

  const claimAmount = Number(c.amount);
  const out: NearbyBankTxRow[] = [];
  for (const r of rows ?? []) {
    const row = r as unknown as {
      id: string;
      bank_account_id: string;
      source: "manual" | "csv" | "basiq";
      transaction_date: string;
      amount: number | string;
      description: string | null;
      match_status: MatchStatus;
      bank_accounts: { subdivision_id: string; account_name: string; fund_type: "administrative" | "capital_works" };
    };
    if (row.bank_accounts.subdivision_id !== c.subdivision_id) {
      // Refuse to leak any out-of-subdivision rows. Whole call returns FORBIDDEN.
      return { ok: false, error: "Cross-subdivision id supplied", errorCode: "FORBIDDEN" };
    }
    const amt = Number(row.amount);
    out.push({
      id: row.id,
      bank_account_id: row.bank_account_id,
      bank_account_name: row.bank_accounts.account_name,
      fund_type: row.bank_accounts.fund_type,
      source: row.source,
      transaction_date: row.transaction_date,
      amount: amt,
      description: row.description,
      match_status: row.match_status,
      day_delta_from_claim_date: daysBetween(row.transaction_date, c.claim_date),
      is_amount_exact_match: amt === claimAmount,
    });
  }
  return { ok: true, rows: out };
}

// ─── Manager-confirm shared loader ────────────────────────────────────────

interface ClaimRowForReview {
  id: string;
  subdivision_id: string;
  lot_id: string;
  amount: number;
  claim_date: string;
  claim_status: ClaimStatus;
}

async function loadClaimForReview(
  claimId: string,
): Promise<
  | { ok: true; claim: ClaimRowForReview; profileId: string }
  | { ok: false; error: string; errorCode: OwnerPaymentClaimErrorCode }
> {
  const profile = await requireCompanyRole();
  const supabase = createServerClient();

  const { data: claim } = await supabase
    .from("owner_payment_claims")
    .select("id, subdivision_id, lot_id, amount, claim_date, claim_status")
    .eq("id", claimId)
    .maybeSingle();
  if (!claim) {
    return { ok: false, error: "Claim not found", errorCode: "NOT_FOUND" };
  }
  const c = claim as {
    id: string;
    subdivision_id: string;
    lot_id: string;
    amount: number | string;
    claim_date: string;
    claim_status: ClaimStatus;
  };

  // Cross-company isolation: requireSubdivisionAccess returns truthy for
  // managers whose company owns this subdivision. Wrap in try/catch since
  // the helper throws.
  try {
    await requireSubdivisionAccess(c.subdivision_id);
  } catch {
    return { ok: false, error: "Claim not found", errorCode: "FORBIDDEN" };
  }

  if (c.claim_status !== "pending") {
    return {
      ok: false,
      error: "Claim is not pending review (already matched or rejected)",
      errorCode: "NOT_PENDING",
    };
  }

  return {
    ok: true,
    claim: { ...c, amount: Number(c.amount) },
    profileId: profile.id,
  };
}

// ─── confirmAndMatchClaimViaExistingBankTx (path iii — PRIMARY) ──────────

export async function confirmAndMatchClaimViaExistingBankTx(
  input: ConfirmAndMatchClaimViaExistingBankTxInput,
): Promise<ConfirmClaimResult> {
  const parsed = confirmAndMatchClaimViaExistingBankTxSchema.safeParse(input);
  if (!parsed.success) return { error: formatIssues(parsed.error.issues) };

  const loaded = await loadClaimForReview(parsed.data.claim_id);
  if (!loaded.ok) return { error: loaded.error, errorCode: loaded.errorCode };
  const { claim, profileId } = loaded;
  const supabase = createServerClient();

  // PP6-C-1 spec gap 2: STAMP payment_received_email_sent_at BEFORE
  // delegating to reconcileTransaction. The action's internal
  // emitPaymentReceivedEmail call sees the non-null sentinel and
  // short-circuits — owner gets the claim_matched email instead of
  // the generic payment_received email (avoids double-emailing the
  // same event). Ordering invariant: stamp must precede the delegate.
  await supabase
    .from("bank_transactions")
    .update({ payment_received_email_sent_at: new Date().toISOString() })
    .eq("id", parsed.data.bank_transaction_id);

  // Delegate the match to the existing reconcileTransaction action — it
  // runs PP5-B's ledger detector hook on the credits it creates and
  // writes the reconciliation.matched audit chain.
  const matchResult = await reconcileTransaction({
    subdivision_id: claim.subdivision_id,
    bank_transaction_id: parsed.data.bank_transaction_id,
    allocations: parsed.data.allocations,
    match_method: "manual",
    match_confidence: "manual",
    notes: parsed.data.notes ?? null,
  });
  if (!matchResult.success) {
    return { error: matchResult.error ?? "Match failed" };
  }
  const ledgerEntryId = matchResult.success.createdCreditIds[0];
  if (!ledgerEntryId) {
    return { error: "Match returned no ledger entries" };
  }

  // UPDATE claim → matched terminal state.
  const reviewedAt = new Date().toISOString();
  const { error: updErr } = await supabase
    .from("owner_payment_claims")
    .update({
      claim_status: "matched",
      bank_transaction_id: parsed.data.bank_transaction_id,
      ledger_entry_id: ledgerEntryId,
      reviewed_by_profile_id: profileId,
      reviewed_at: reviewedAt,
    })
    .eq("id", claim.id);
  if (updErr) return { error: updErr.message };

  await supabase.from("audit_log").insert({
    profile_id: profileId,
    subdivision_id: claim.subdivision_id,
    action: "owner_payment_claim.matched",
    entity_type: "owner_payment_claim",
    entity_id: claim.id,
    before_state: { claim_status: "pending" },
    after_state: {
      claim_status: "matched",
      bank_transaction_id: parsed.data.bank_transaction_id,
      ledger_entry_id: ledgerEntryId,
    },
    metadata: {
      path: "existing_bank_tx",
      ...(parsed.data.notes ? { notes: parsed.data.notes } : {}),
    },
  });

  // PP6-C-1: claim-matched email to the owner.
  await emitClaimMatchedEmail(supabase, {
    claimId: claim.id,
    performedBy: profileId,
  });

  revalidatePath("/subdivisions/[subdivisionCode]/reconciliation", "page");
  revalidatePath("/subdivisions/[subdivisionCode]/reconciliation/claims", "page");
  revalidatePath("/subdivisions/[subdivisionCode]/my-payments", "page");
  return {
    success: {
      claim_id: claim.id,
      bank_transaction_id: parsed.data.bank_transaction_id,
      ledger_entry_id: ledgerEntryId,
    },
  };
}

// ─── confirmAndMatchClaimViaNewBankTx (path ii — FALLBACK) ────────────────

export async function confirmAndMatchClaimViaNewBankTx(
  input: ConfirmAndMatchClaimViaNewBankTxInput,
): Promise<ConfirmClaimResult> {
  const parsed = confirmAndMatchClaimViaNewBankTxSchema.safeParse(input);
  if (!parsed.success) return { error: formatIssues(parsed.error.issues) };

  const loaded = await loadClaimForReview(parsed.data.claim_id);
  if (!loaded.ok) return { error: loaded.error, errorCode: loaded.errorCode };
  const { claim, profileId } = loaded;
  const supabase = createServerClient();

  // Verify the chosen bank account belongs to the claim's subdivision.
  const { data: bankAccount } = await supabase
    .from("bank_accounts")
    .select("id, subdivision_id")
    .eq("id", parsed.data.bank_account_id)
    .maybeSingle();
  if (!bankAccount || (bankAccount as { subdivision_id: string }).subdivision_id !== claim.subdivision_id) {
    return { error: "Bank account not found", errorCode: "FORBIDDEN" };
  }

  // PP5-C HIGH-risk mitigation: LIKELY_DUPLICATE pre-check.
  // Look for existing bank txs on the same account, +/-2 days from
  // claim_date, same amount. If candidates exist and override is false,
  // return the candidates so the UI can prompt switching to path (iii).
  if (!parsed.data.override_likely_duplicate) {
    const minDate = shiftDate(claim.claim_date, -2);
    const maxDate = shiftDate(claim.claim_date, +2);
    const { data: candidates } = await supabase
      .from("bank_transactions")
      .select("id")
      .eq("bank_account_id", parsed.data.bank_account_id)
      .eq("amount", claim.amount)
      .gte("transaction_date", minDate)
      .lte("transaction_date", maxDate);
    const ids = (candidates ?? []).map((c) => (c as { id: string }).id);
    if (ids.length > 0) {
      return {
        error:
          "One or more existing bank transactions look like the new manual entry. Switch to confirmAndMatchClaimViaExistingBankTx or pass override_likely_duplicate=true.",
        errorCode: "LIKELY_DUPLICATE",
        likely_duplicate_bank_tx_ids: ids,
      };
    }
  }

  // Step 1 — create the manual bank tx via the existing action (PP5-A
  // detector runs internally; if PP5-A flags it, the tx still inserts but
  // duplicateSuspected=true and the orchestrator doesn't auto-allocate.
  // We're about to manually allocate via reconcileTransaction in step 2,
  // which bypasses the orchestrator's early-out — manager has chosen to
  // proceed despite the override).
  const addResult = await addManualBankTransaction({
    subdivision_id: claim.subdivision_id,
    bank_account_id: parsed.data.bank_account_id,
    transaction_date: parsed.data.transaction_date,
    amount: claim.amount,
    direction: "credit",
    description: parsed.data.description ?? "",
  });
  if (!addResult.success) {
    return { error: addResult.error ?? "Manual bank tx insert failed" };
  }
  const bankTransactionId = addResult.success.bankTransactionId;

  // PP6-C-1 spec gap 2: STAMP payment_received_email_sent_at BEFORE
  // delegating to reconcileTransaction. Same invariant as the
  // existing-bank-tx path; the just-created bank tx's column is NULL
  // by default, so this stamp is the suppression mechanism for the
  // generic payment_received email.
  await supabase
    .from("bank_transactions")
    .update({ payment_received_email_sent_at: new Date().toISOString() })
    .eq("id", bankTransactionId);

  // Step 2 — allocate via reconcileTransaction (PP5-B detector runs).
  const matchResult = await reconcileTransaction({
    subdivision_id: claim.subdivision_id,
    bank_transaction_id: bankTransactionId,
    allocations: parsed.data.allocations,
    match_method: "manual",
    match_confidence: "manual",
    notes: parsed.data.notes ?? null,
  });
  if (!matchResult.success) {
    return { error: matchResult.error ?? "Match failed" };
  }
  const ledgerEntryId = matchResult.success.createdCreditIds[0];
  if (!ledgerEntryId) {
    return { error: "Match returned no ledger entries" };
  }

  // UPDATE claim → matched terminal state.
  const reviewedAt = new Date().toISOString();
  const { error: updErr } = await supabase
    .from("owner_payment_claims")
    .update({
      claim_status: "matched",
      bank_transaction_id: bankTransactionId,
      ledger_entry_id: ledgerEntryId,
      reviewed_by_profile_id: profileId,
      reviewed_at: reviewedAt,
    })
    .eq("id", claim.id);
  if (updErr) return { error: updErr.message };

  await supabase.from("audit_log").insert({
    profile_id: profileId,
    subdivision_id: claim.subdivision_id,
    action: "owner_payment_claim.matched",
    entity_type: "owner_payment_claim",
    entity_id: claim.id,
    before_state: { claim_status: "pending" },
    after_state: {
      claim_status: "matched",
      bank_transaction_id: bankTransactionId,
      ledger_entry_id: ledgerEntryId,
    },
    metadata: {
      path: "new_bank_tx",
      override_likely_duplicate: parsed.data.override_likely_duplicate ?? false,
      ...(parsed.data.notes ? { notes: parsed.data.notes } : {}),
    },
  });

  // PP6-C-1: claim-matched email to the owner.
  await emitClaimMatchedEmail(supabase, {
    claimId: claim.id,
    performedBy: profileId,
  });

  revalidatePath("/subdivisions/[subdivisionCode]/reconciliation", "page");
  revalidatePath("/subdivisions/[subdivisionCode]/reconciliation/claims", "page");
  revalidatePath("/subdivisions/[subdivisionCode]/bank-account", "page");
  revalidatePath("/subdivisions/[subdivisionCode]/my-payments", "page");
  return {
    success: {
      claim_id: claim.id,
      bank_transaction_id: bankTransactionId,
      ledger_entry_id: ledgerEntryId,
    },
  };
}

// ─── rejectPaymentClaim ───────────────────────────────────────────────────

export async function rejectPaymentClaim(
  input: RejectPaymentClaimInput,
): Promise<RejectPaymentClaimResult> {
  const parsed = rejectPaymentClaimSchema.safeParse(input);
  if (!parsed.success) return { error: formatIssues(parsed.error.issues) };

  const loaded = await loadClaimForReview(parsed.data.claim_id);
  if (!loaded.ok) return { error: loaded.error, errorCode: loaded.errorCode };
  const { claim, profileId } = loaded;
  const supabase = createServerClient();

  const reviewedAt = new Date().toISOString();
  const { error: updErr } = await supabase
    .from("owner_payment_claims")
    .update({
      claim_status: "rejected",
      rejection_reason: parsed.data.rejection_reason,
      reviewed_by_profile_id: profileId,
      reviewed_at: reviewedAt,
    })
    .eq("id", claim.id);
  if (updErr) return { error: updErr.message };

  await supabase.from("audit_log").insert({
    profile_id: profileId,
    subdivision_id: claim.subdivision_id,
    action: "owner_payment_claim.rejected",
    entity_type: "owner_payment_claim",
    entity_id: claim.id,
    before_state: { claim_status: "pending" },
    after_state: { claim_status: "rejected" },
    metadata: { rejection_reason: parsed.data.rejection_reason },
  });

  // PP6-C-1: claim-rejected email to the owner with rejection_reason in body.
  await emitClaimRejectedEmail(supabase, {
    claimId: claim.id,
    rejectionReason: parsed.data.rejection_reason,
    performedBy: profileId,
  });

  revalidatePath("/subdivisions/[subdivisionCode]/reconciliation/claims", "page");
  revalidatePath("/subdivisions/[subdivisionCode]/my-payments", "page");
  return { success: { claim_id: claim.id } };
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function shiftDate(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Signed day delta between two ISO YYYY-MM-DD dates. Positive when `a`
 *  is AFTER `b`. Used by getNearbyBankTxsForClaim + getBankTxSnapshotsByIds
 *  to compute day_delta_from_claim_date. */
function daysBetween(a: string, b: string): number {
  const da = new Date(`${a}T00:00:00Z`).getTime();
  const db = new Date(`${b}T00:00:00Z`).getTime();
  return Math.round((da - db) / (24 * 60 * 60 * 1000));
}
