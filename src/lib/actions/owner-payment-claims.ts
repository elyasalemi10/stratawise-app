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

export async function listPendingPaymentClaims(
  subdivisionId: string,
): Promise<ListPendingPaymentClaimsResult> {
  await requireCompanyRole();
  await requireSubdivisionAccess(subdivisionId);
  const supabase = createServerClient();

  const { data: rows } = await supabase
    .from("owner_payment_claims")
    .select(
      "id, subdivision_id, lot_id, claimed_by_profile_id, amount, claim_date, payment_method, reference, notes, claim_status, created_at",
    )
    .eq("subdivision_id", subdivisionId)
    .eq("claim_status", "pending")
    .order("created_at", { ascending: false });

  if (!rows || rows.length === 0) return { rows: [] };

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
