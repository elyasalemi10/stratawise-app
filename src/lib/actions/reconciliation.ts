"use server";

import { requireCompanyRole, requireSubdivisionAccess } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";
import { revalidatePath } from "next/cache";
import { revalidateSidebarForSubdivision } from "./subdivision";
import { tryAutoMatch } from "@/lib/reconciliation/orchestrator";
import { detectSingleLevyReference } from "@/lib/reconciliation/reference";
import {
  addManualBankTransactionSchema,
  depositUndepositedFundsSchema,
  excludeTransactionSchema,
  recordCashReceiptSchema,
  reconcileTransactionSchema,
  unexcludeTransactionSchema,
  unmatchTransactionSchema,
  voidBankTransactionSchema,
  voidUndepositedReceiptSchema,
  LEVY_REFERENCE_REGEX,
  type AddManualBankTransactionInput,
  type BankTransactionDetail,
  type DepositUndepositedFundsInput,
  type ExcludeTransactionInput,
  type MatchStatus,
  type ReconcileTransactionInput,
  type ReconciliationQueueResult,
  type ReconciliationQueueRow,
  type RecordCashReceiptInput,
  type UndepositedFundsEntry,
  type UnexcludeTransactionInput,
  type UnmatchTransactionInput,
  type VoidBankTransactionInput,
  type VoidCascadePreview,
  type VoidUndepositedReceiptInput,
  type TransactionSource,
} from "@/lib/validations/reconciliation";
import type { FundType } from "@/lib/validations/ledger";

// Zod expects the optional-reference field to be an empty string OR a regex-matching string.
// Helper to normalise CSV/manual input.
function normaliseReference(v: string | null | undefined): string | null {
  if (!v) return null;
  const s = v.trim().toUpperCase();
  return LEVY_REFERENCE_REGEX.test(s) ? s : null;
}

function formatIssues(issues: { message: string }[]): string {
  return issues.map((i) => i.message).join("; ");
}


// ============================================================================
// READS
// ============================================================================

interface QueueOptions {
  bankAccountId?: string | null;
  status?: MatchStatus | "all" | null;
  source?: TransactionSource | "all" | null;
  includeVoided?: boolean;
  page?: number;
  pageSize?: number;
}

export async function getReconciliationQueue(
  subdivisionId: string,
  opts: QueueOptions = {},
): Promise<ReconciliationQueueResult> {
  await requireSubdivisionAccess(subdivisionId);
  const supabase = createServerClient();

  const page = Math.max(opts.page ?? 1, 1);
  const pageSize = Math.min(Math.max(opts.pageSize ?? 50, 1), 200);
  const includeVoided = opts.includeVoided ?? false;

  const { data: accounts } = await supabase
    .from("bank_accounts")
    .select("id, account_name, fund_type")
    .eq("subdivision_id", subdivisionId)
    .order("fund_type");

  const accountIds = (accounts ?? []).map((a) => a.id);
  const accountMap = new Map(
    (accounts ?? []).map((a) => [a.id, { name: a.account_name, fund_type: a.fund_type as FundType }]),
  );
  const bankAccountOptions = (accounts ?? []).map((a) => ({
    id: a.id,
    name: a.account_name,
    fund_type: a.fund_type as FundType,
  }));

  if (accountIds.length === 0) {
    return {
      rows: [],
      total: 0,
      page,
      pageSize,
      unmatchedCount: 0,
      unmatchedValue: 0,
      oldestUnmatchedDays: null,
      matchedThisMonthValue: 0,
      availableSources: [],
      bankAccounts: [],
    };
  }

  // Distinct sources across all (non-voided) transactions in this subdivision.
  // Filter-agnostic so the dropdown shows every source ever seen, regardless
  // of the currently-applied filters.
  const { data: sourceRows } = await supabase
    .from("bank_transactions")
    .select("source")
    .in("bank_account_id", accountIds)
    .eq("is_voided", false);
  const availableSources = Array.from(
    new Set((sourceRows ?? []).map((r) => r.source as TransactionSource)),
  ).sort();

  let q = supabase
    .from("bank_transactions")
    .select(
      "id, bank_account_id, source, transaction_date, amount, description, matched_total, match_status, is_voided, excluded_reason, imported_at",
      { count: "exact" },
    )
    .in("bank_account_id", accountIds);

  if (!includeVoided) q = q.eq("is_voided", false);
  if (opts.bankAccountId) q = q.eq("bank_account_id", opts.bankAccountId);
  if (opts.source && opts.source !== "all") q = q.eq("source", opts.source);

  const statusFilter = opts.status ?? "unmatched";
  if (statusFilter !== "all") q = q.eq("match_status", statusFilter);

  q = q
    .order("transaction_date", { ascending: false })
    .order("imported_at", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  const { data, error, count } = await q;
  if (error) throw new Error(`getReconciliationQueue: ${error.message}`);

  const rows: ReconciliationQueueRow[] = (data ?? []).map((r) => {
    const acct = accountMap.get(r.bank_account_id);
    const amount = Number(r.amount);
    const matched = Number(r.matched_total);
    const detectedReference = detectSingleLevyReference(r.description);
    return {
      id: r.id,
      bank_account_id: r.bank_account_id,
      bank_account_name: acct?.name ?? "",
      bank_account_fund_type: (acct?.fund_type ?? "administrative") as FundType,
      source: r.source as TransactionSource,
      transaction_date: r.transaction_date,
      amount,
      description: r.description,
      matched_total: matched,
      remaining: round2(amount - matched),
      match_status: r.match_status as MatchStatus,
      is_voided: !!r.is_voided,
      excluded_reason: r.excluded_reason,
      detected_reference: detectedReference,
      imported_at: r.imported_at,
    };
  });

  // KPIs via separate, targeted aggregate queries so they're consistent even when the page is filtered.
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

  const [unmatchedAgg, matchedAgg] = await Promise.all([
    supabase
      .from("bank_transactions")
      .select("amount, matched_total, transaction_date")
      .in("bank_account_id", accountIds)
      .eq("is_voided", false)
      .eq("match_status", "unmatched"),
    supabase
      .from("bank_transactions")
      .select("matched_total")
      .in("bank_account_id", accountIds)
      .eq("is_voided", false)
      .in("match_status", ["manually_matched", "auto_matched"])
      .gte("transaction_date", monthStart),
  ]);

  let unmatchedCount = 0;
  let unmatchedValue = 0;
  let oldest: string | null = null;
  for (const row of unmatchedAgg.data ?? []) {
    const remaining = round2(Number(row.amount) - Number(row.matched_total));
    if (remaining > 0) {
      unmatchedCount += 1;
      unmatchedValue += remaining;
      if (!oldest || row.transaction_date < oldest) oldest = row.transaction_date;
    }
  }
  const oldestUnmatchedDays = oldest ? daysBetween(oldest, new Date().toISOString().slice(0, 10)) : null;

  let matchedThisMonthValue = 0;
  for (const row of matchedAgg.data ?? []) {
    matchedThisMonthValue += Number(row.matched_total);
  }

  return {
    rows,
    total: count ?? rows.length,
    page,
    pageSize,
    unmatchedCount,
    unmatchedValue: round2(unmatchedValue),
    oldestUnmatchedDays,
    matchedThisMonthValue: round2(matchedThisMonthValue),
    availableSources,
    bankAccounts: bankAccountOptions,
  };
}

export async function getUnmatchedCount(subdivisionId: string): Promise<number> {
  await requireSubdivisionAccess(subdivisionId);
  const supabase = createServerClient();

  const { data: accounts } = await supabase
    .from("bank_accounts")
    .select("id")
    .eq("subdivision_id", subdivisionId);

  const accountIds = (accounts ?? []).map((a) => a.id);
  if (accountIds.length === 0) return 0;

  const { count } = await supabase
    .from("bank_transactions")
    .select("id", { count: "exact", head: true })
    .in("bank_account_id", accountIds)
    .eq("is_voided", false)
    .eq("match_status", "unmatched");

  return count ?? 0;
}

export async function getBankTransactionDetail(
  bankTransactionId: string,
): Promise<BankTransactionDetail> {
  const supabase = createServerClient();

  const { data: bt, error: btErr } = await supabase
    .from("bank_transactions")
    .select(
      "id, bank_account_id, source, transaction_date, amount, description, balance, matched_total, match_status, is_voided, voided_at, voided_by, void_reason, excluded_reason, imported_at",
    )
    .eq("id", bankTransactionId)
    .single();
  if (btErr || !bt) throw new Error("Bank transaction not found");

  const { data: account } = await supabase
    .from("bank_accounts")
    .select("id, account_name, fund_type, subdivision_id")
    .eq("id", bt.bank_account_id)
    .single();
  if (!account) throw new Error("Bank account not found");

  await requireSubdivisionAccess(account.subdivision_id);

  const [{ data: matches }, { data: undeposited }] = await Promise.all([
    supabase
      .from("reconciliation_matches")
      .select(
        "id, ledger_entry_id, amount_matched, match_method, match_confidence, matched_at, matched_by, notes",
      )
      .eq("bank_transaction_id", bankTransactionId)
      .order("matched_at", { ascending: true }),
    supabase
      .from("undeposited_funds_entries")
      .select(
        "id, receipt_number, lot_id, amount, received_date, payment_method, cheque_number",
      )
      .eq("bank_account_id", bt.bank_account_id)
      .eq("status", "pending_deposit"),
  ]);

  const matchRows = matches ?? [];
  const ledgerIds = matchRows.map((m) => m.ledger_entry_id);

  let ledgerMap = new Map<
    string,
    { lot_id: string; fund_type: FundType; levy_notice_id: string | null }
  >();
  if (ledgerIds.length > 0) {
    const { data: ledgerRows } = await supabase
      .from("lot_ledger_entries")
      .select("id, lot_id, fund_type, levy_notice_id")
      .in("id", ledgerIds);
    ledgerMap = new Map(
      (ledgerRows ?? []).map((l) => [
        l.id,
        { lot_id: l.lot_id, fund_type: l.fund_type as FundType, levy_notice_id: l.levy_notice_id },
      ]),
    );
  }

  const lotIds = Array.from(
    new Set([
      ...Array.from(ledgerMap.values()).map((v) => v.lot_id),
      ...(undeposited ?? []).map((u) => u.lot_id),
    ]),
  );

  let lotMap = new Map<string, { lot_number: string; unit_number: string | null }>();
  if (lotIds.length > 0) {
    const { data: lotRows } = await supabase
      .from("lots")
      .select("id, lot_number, unit_number")
      .in("id", lotIds);
    lotMap = new Map(
      (lotRows ?? []).map((l) => [
        l.id,
        { lot_number: String(l.lot_number), unit_number: l.unit_number ?? null },
      ]),
    );
  }

  const noticeIds = Array.from(
    new Set(
      Array.from(ledgerMap.values())
        .map((v) => v.levy_notice_id)
        .filter((x): x is string => !!x),
    ),
  );
  let noticeMap = new Map<string, string>();
  if (noticeIds.length > 0) {
    const { data: noticeRows } = await supabase
      .from("levy_notices")
      .select("id, reference_number")
      .in("id", noticeIds);
    noticeMap = new Map((noticeRows ?? []).map((n) => [n.id, n.reference_number]));
  }

  const amount = Number(bt.amount);
  const matchedTotal = Number(bt.matched_total);
  const detectedReference = detectSingleLevyReference(bt.description);

  return {
    id: bt.id,
    bank_account_id: bt.bank_account_id,
    bank_account_name: account.account_name,
    bank_account_fund_type: account.fund_type as FundType,
    subdivision_id: account.subdivision_id,
    source: bt.source as TransactionSource,
    transaction_date: bt.transaction_date,
    amount,
    description: bt.description,
    balance: bt.balance !== null ? Number(bt.balance) : null,
    match_status: bt.match_status as MatchStatus,
    matched_total: matchedTotal,
    remaining: round2(amount - matchedTotal),
    is_voided: !!bt.is_voided,
    voided_at: bt.voided_at,
    voided_by: bt.voided_by,
    void_reason: bt.void_reason,
    excluded_reason: bt.excluded_reason,
    detected_reference: detectedReference,
    imported_at: bt.imported_at,
    matches: matchRows.map((m) => {
      const led = ledgerMap.get(m.ledger_entry_id);
      const lot = led ? lotMap.get(led.lot_id) : undefined;
      return {
        id: m.id,
        ledger_entry_id: m.ledger_entry_id,
        lot_id: led?.lot_id ?? "",
        lot_number: lot?.lot_number ?? "",
        unit_number: lot?.unit_number ?? null,
        fund_type: led?.fund_type ?? "administrative",
        amount_matched: Number(m.amount_matched),
        match_method: m.match_method,
        match_confidence: m.match_confidence,
        matched_at: m.matched_at,
        matched_by: m.matched_by,
        notes: m.notes,
        levy_notice_id: led?.levy_notice_id ?? null,
        levy_reference: led?.levy_notice_id ? noticeMap.get(led.levy_notice_id) ?? null : null,
      };
    }),
    undeposited_candidates: (undeposited ?? []).map((u) => ({
      id: u.id,
      receipt_number: u.receipt_number,
      lot_id: u.lot_id,
      lot_number: lotMap.get(u.lot_id)?.lot_number ?? "",
      amount: Number(u.amount),
      received_date: u.received_date,
      payment_method: u.payment_method as "cash" | "cheque",
      cheque_number: u.cheque_number,
    })),
  };
}

export async function getUndepositedEntries(
  subdivisionId: string,
  bankAccountId?: string | null,
): Promise<UndepositedFundsEntry[]> {
  await requireSubdivisionAccess(subdivisionId);
  const supabase = createServerClient();

  let q = supabase
    .from("undeposited_funds_entries")
    .select(
      "id, subdivision_id, lot_id, bank_account_id, fund_type, amount, received_date, payment_method, cheque_number, receipt_number, description, status, deposited_at, deposited_by_bank_transaction_id, linked_ledger_credit_id, created_at",
    )
    .eq("subdivision_id", subdivisionId)
    .eq("status", "pending_deposit")
    .order("received_date", { ascending: true });

  if (bankAccountId) q = q.eq("bank_account_id", bankAccountId);

  const { data, error } = await q;
  if (error) throw new Error(error.message);

  const rows = data ?? [];
  const lotIds = Array.from(new Set(rows.map((r) => r.lot_id)));
  let lotMap = new Map<string, { lot_number: string; unit_number: string | null }>();
  if (lotIds.length > 0) {
    const { data: lots } = await supabase
      .from("lots")
      .select("id, lot_number, unit_number")
      .in("id", lotIds);
    lotMap = new Map(
      (lots ?? []).map((l) => [
        l.id,
        { lot_number: String(l.lot_number), unit_number: l.unit_number ?? null },
      ]),
    );
  }

  return rows.map((r) => ({
    id: r.id,
    subdivision_id: r.subdivision_id,
    lot_id: r.lot_id,
    lot_number: lotMap.get(r.lot_id)?.lot_number ?? "",
    unit_number: lotMap.get(r.lot_id)?.unit_number ?? null,
    bank_account_id: r.bank_account_id,
    fund_type: r.fund_type as FundType,
    amount: Number(r.amount),
    received_date: r.received_date,
    payment_method: r.payment_method as "cash" | "cheque",
    cheque_number: r.cheque_number,
    receipt_number: r.receipt_number,
    description: r.description,
    status: r.status as "pending_deposit" | "deposited" | "voided",
    deposited_at: r.deposited_at,
    deposited_by_bank_transaction_id: r.deposited_by_bank_transaction_id,
    linked_ledger_credit_id: r.linked_ledger_credit_id,
    created_at: r.created_at,
  }));
}

export async function getSubdivisionLotsForAllocation(
  subdivisionId: string,
): Promise<
  Array<{
    id: string;
    lot_number: string;
    unit_number: string | null;
    owner_display_name: string | null;
    owner_status: "member" | "pending_invitation" | "unowned";
    outstanding_levies: Array<{
      id: string;
      reference_number: string;
      amount_outstanding: number;
    }>;
  }>
> {
  await requireSubdivisionAccess(subdivisionId);
  const supabase = createServerClient();

  // Get all lots in the subdivision
  const { data: lots, error: lotsErr } = await supabase
    .from("lots")
    .select("id, lot_number, unit_number, subdivision_id")
    .eq("subdivision_id", subdivisionId)
    .order("lot_number", { ascending: true });

  if (lotsErr || !lots) throw new Error("Failed to fetch lots");

  const lotIds = lots.map((l) => l.id);

  // Get lot owners (members + pending invitations)
  const { data: members } = await supabase
    .from("subdivision_members")
    .select("lot_id, profile_id, profiles!inner(id, first_name, last_name)")
    .in("lot_id", lotIds)
    .eq("role", "lot_owner")
    .is("left_at", null);

  const memberMap = new Map<
    string,
    { owner_display_name: string | null; owner_status: "member" }
  >();
  for (const m of members ?? []) {
    if (!m.lot_id) continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const profile = (m as any).profiles;
    const name = [profile?.first_name, profile?.last_name]
      .filter(Boolean)
      .join(" ")
      .trim();
    memberMap.set(m.lot_id, {
      owner_display_name: name || null,
      owner_status: "member",
    });
  }

  const lotsStillUnowned = lotIds.filter((id) => !memberMap.has(id));
  const inviteMap = new Map<
    string,
    { owner_display_name: string | null; owner_status: "pending_invitation" }
  >();
  if (lotsStillUnowned.length > 0) {
    const { data: invites } = await supabase
      .from("invitations")
      .select("id, lot_id, name, created_at")
      .in("lot_id", lotsStillUnowned)
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    for (const inv of invites ?? []) {
      if (!inviteMap.has(inv.lot_id)) {
        inviteMap.set(inv.lot_id, {
          owner_display_name: inv.name ?? null,
          owner_status: "pending_invitation",
        });
      }
    }
  }

  // Get outstanding levy notices per lot
  const { data: notices } = await supabase
    .from("levy_notices")
    .select(
      "id, lot_id, reference_number, amount_due, amount_paid, levy_batch_id, status"
    )
    .in("lot_id", lotIds)
    .in("status", ["issued", "overdue", "partially_paid"]);

  const ledgerMap = new Map<
    string,
    { paid: number; due: number }
  >();
  for (const notice of notices ?? []) {
    if (!ledgerMap.has(notice.lot_id)) {
      ledgerMap.set(notice.lot_id, { paid: 0, due: 0 });
    }
    const stats = ledgerMap.get(notice.lot_id)!;
    stats.due += Number(notice.amount_due);
    stats.paid += Number(notice.amount_paid);
  }

  const noticeIds = (notices ?? []).map((n) => n.id);
  const noticeAmountMap = new Map<string, number>();
  if (noticeIds.length > 0) {
    const { data: ledgerCredits } = await supabase
      .from("lot_ledger_entries")
      .select("levy_notice_id, amount")
      .in("levy_notice_id", noticeIds)
      .eq("entry_type", "credit");

    for (const credit of ledgerCredits ?? []) {
      if (!credit.levy_notice_id) continue;
      const current = noticeAmountMap.get(credit.levy_notice_id) ?? 0;
      noticeAmountMap.set(credit.levy_notice_id, current + Number(credit.amount));
    }
  }

  return lots.map((lot) => {
    const owner = memberMap.get(lot.id) || inviteMap.get(lot.id) || {
      owner_display_name: null,
      owner_status: "unowned" as const,
    };

    const lotNotices = (notices ?? []).filter((n) => n.lot_id === lot.id);
    const outstanding_levies = lotNotices
      .map((notice) => {
        const amountPaid = noticeAmountMap.get(notice.id) ?? 0;
        const amountOutstanding = round2(
          Number(notice.amount_due) - amountPaid
        );
        return {
          id: notice.id,
          reference_number: notice.reference_number,
          amount_outstanding: amountOutstanding,
        };
      })
      .filter((l) => l.amount_outstanding > 0)
      .sort((a, b) => a.reference_number.localeCompare(b.reference_number));

    return {
      id: lot.id,
      lot_number: String(lot.lot_number),
      unit_number: lot.unit_number ?? null,
      owner_display_name: owner.owner_display_name,
      owner_status: owner.owner_status,
      outstanding_levies,
    };
  });
}

// ============================================================================
// MUTATIONS
// ============================================================================

export async function addManualBankTransaction(
  input: AddManualBankTransactionInput,
): Promise<{ success?: { bankTransactionId: string; autoMatched: boolean; matchedRef: string | null }; error?: string }> {
  const parsed = addManualBankTransactionSchema.safeParse(input);
  if (!parsed.success) return { error: formatIssues(parsed.error.issues) };

  const profile = await requireCompanyRole();
  await requireSubdivisionAccess(parsed.data.subdivision_id);
  const supabase = createServerClient();

  const { data: account } = await supabase
    .from("bank_accounts")
    .select("id, subdivision_id")
    .eq("id", parsed.data.bank_account_id)
    .single();
  if (!account || account.subdivision_id !== parsed.data.subdivision_id) {
    return { error: "Bank account not found" };
  }

  const signedAmount =
    parsed.data.direction === "credit" ? Math.abs(parsed.data.amount) : -Math.abs(parsed.data.amount);

  const explicitReference = normaliseReference(parsed.data.reference);
  const baseDescription = parsed.data.description?.trim() ?? "";
  const descriptionWithRef =
    explicitReference && !baseDescription.toUpperCase().includes(explicitReference)
      ? [baseDescription, explicitReference].filter(Boolean).join(" ").trim()
      : baseDescription;

  const { data: inserted, error: insErr } = await supabase
    .from("bank_transactions")
    .insert({
      bank_account_id: account.id,
      source: "manual",
      transaction_date: parsed.data.transaction_date,
      amount: signedAmount,
      description: descriptionWithRef,
      match_status: "unmatched",
    })
    .select("id")
    .single();
  if (insErr || !inserted) return { error: insErr?.message ?? "Insert failed" };

  await supabase.from("audit_log").insert({
    profile_id: profile.id,
    subdivision_id: parsed.data.subdivision_id,
    action: "bank_transaction.added_manually",
    entity_type: "bank_transaction",
    entity_id: inserted.id,
    after_state: {
      bank_account_id: account.id,
      transaction_date: parsed.data.transaction_date,
      amount: signedAmount,
      description: descriptionWithRef,
    },
  });

  let autoMatched = false;
  let matchedRef: string | null = null;
  if (signedAmount > 0) {
    const result = await tryAutoMatch({
      bankTransactionId: inserted.id,
      subdivisionId: parsed.data.subdivision_id,
      bankAccountId: account.id,
      description: descriptionWithRef,
      amount: signedAmount,
      transactionDate: parsed.data.transaction_date,
      performedBy: profile.id,
    });
    autoMatched = result.matched;
    matchedRef = result.reference;
  }

  await revalidateSidebarForSubdivision(parsed.data.subdivision_id);
  revalidatePath(`/subdivisions/${parsed.data.subdivision_id}/finance/reconciliation`);
  revalidatePath(`/subdivisions/${parsed.data.subdivision_id}/finance/bank-account`);
  return { success: { bankTransactionId: inserted.id, autoMatched, matchedRef } };
}

export async function reconcileTransaction(
  input: ReconcileTransactionInput,
): Promise<{ success?: { createdCreditIds: string[]; matchIds: string[]; remaining: number; flags: string[] }; error?: string }> {
  const parsed = reconcileTransactionSchema.safeParse(input);
  if (!parsed.success) return { error: formatIssues(parsed.error.issues) };

  const profile = await requireCompanyRole();
  await requireSubdivisionAccess(parsed.data.subdivision_id);
  const supabase = createServerClient();

  const allocations = parsed.data.allocations.map((a) => ({
    lot_id: a.lot_id,
    fund_type: a.fund_type,
    amount: a.amount,
    levy_notice_id: a.levy_notice_id ?? null,
    reference: a.reference ?? null,
  }));

  const { data, error } = await supabase.rpc("rpc_reconcile_bank_transaction", {
    p_bank_transaction_id: parsed.data.bank_transaction_id,
    p_allocations: allocations,
    p_match_method: parsed.data.match_method,
    p_match_confidence: parsed.data.match_confidence,
    p_notes: parsed.data.notes ?? null,
    p_performed_by: profile.id,
  });

  if (error) return { error: error.message };

  const payload = (data ?? {}) as {
    created_credit_ids?: string[];
    match_ids?: string[];
    remaining_unmatched?: number | string;
    flags?: string[];
  };

  await revalidateSidebarForSubdivision(parsed.data.subdivision_id);
  revalidatePath(`/subdivisions/${parsed.data.subdivision_id}/finance/reconciliation`);
  return {
    success: {
      createdCreditIds: payload.created_credit_ids ?? [],
      matchIds: payload.match_ids ?? [],
      remaining: Number(payload.remaining_unmatched ?? 0),
      flags: payload.flags ?? [],
    },
  };
}

export async function unmatchTransaction(
  input: UnmatchTransactionInput,
): Promise<{ success?: { voidedCreditIds: string[]; deletedMatchIds: string[]; reopenedReceiptIds: string[]; newMatchedTotal: number }; error?: string }> {
  const parsed = unmatchTransactionSchema.safeParse(input);
  if (!parsed.success) return { error: formatIssues(parsed.error.issues) };

  const profile = await requireCompanyRole();
  await requireSubdivisionAccess(parsed.data.subdivision_id);
  const supabase = createServerClient();

  const { data, error } = await supabase.rpc("rpc_unmatch_bank_transaction", {
    p_bank_transaction_id: parsed.data.bank_transaction_id,
    p_match_ids: parsed.data.match_ids ?? null,
    p_reason: parsed.data.reason,
    p_performed_by: profile.id,
  });

  if (error) return { error: error.message };

  const payload = (data ?? {}) as {
    voided_credit_ids?: string[];
    deleted_match_ids?: string[];
    reopened_receipt_ids?: string[];
    new_matched_total?: number | string;
  };

  await revalidateSidebarForSubdivision(parsed.data.subdivision_id);
  revalidatePath(`/subdivisions/${parsed.data.subdivision_id}/finance/reconciliation`);
  return {
    success: {
      voidedCreditIds: payload.voided_credit_ids ?? [],
      deletedMatchIds: payload.deleted_match_ids ?? [],
      reopenedReceiptIds: payload.reopened_receipt_ids ?? [],
      newMatchedTotal: Number(payload.new_matched_total ?? 0),
    },
  };
}

export async function recordCashReceipt(
  input: RecordCashReceiptInput,
): Promise<{ success?: { receiptId: string; receiptNumber: string; ledgerEntryId: string }; error?: string }> {
  const parsed = recordCashReceiptSchema.safeParse(input);
  if (!parsed.success) return { error: formatIssues(parsed.error.issues) };

  const profile = await requireCompanyRole();
  await requireSubdivisionAccess(parsed.data.subdivision_id);
  const supabase = createServerClient();

  const { data, error } = await supabase.rpc("rpc_record_cash_receipt", {
    p_subdivision_id: parsed.data.subdivision_id,
    p_lot_id: parsed.data.lot_id,
    p_bank_account_id: parsed.data.bank_account_id,
    p_fund_type: parsed.data.fund_type,
    p_amount: parsed.data.amount,
    p_received_date: parsed.data.received_date,
    p_payment_method: parsed.data.payment_method,
    p_cheque_number: parsed.data.cheque_number ?? null,
    p_description: parsed.data.description ?? null,
    p_performed_by: profile.id,
  });

  if (error) return { error: error.message };
  const payload = (data ?? {}) as { receipt_id?: string; receipt_number?: string; ledger_entry_id?: string };

  await revalidateSidebarForSubdivision(parsed.data.subdivision_id);
  revalidatePath(`/subdivisions/${parsed.data.subdivision_id}/finance/reconciliation`);
  revalidatePath(`/subdivisions/${parsed.data.subdivision_id}/finance/bank-account`);
  revalidatePath(`/subdivisions/${parsed.data.subdivision_id}/lots/${parsed.data.lot_id}`);
  return {
    success: {
      receiptId: payload.receipt_id ?? "",
      receiptNumber: payload.receipt_number ?? "",
      ledgerEntryId: payload.ledger_entry_id ?? "",
    },
  };
}

export async function depositUndepositedFunds(
  input: DepositUndepositedFundsInput,
): Promise<{ success?: { clearedReceiptNumbers: string[]; matchIds: string[] }; error?: string }> {
  const parsed = depositUndepositedFundsSchema.safeParse(input);
  if (!parsed.success) return { error: formatIssues(parsed.error.issues) };

  const profile = await requireCompanyRole();
  await requireSubdivisionAccess(parsed.data.subdivision_id);
  const supabase = createServerClient();

  const { data, error } = await supabase.rpc("rpc_deposit_undeposited_funds", {
    p_bank_transaction_id: parsed.data.bank_transaction_id,
    p_undeposited_entry_ids: parsed.data.undeposited_entry_ids,
    p_performed_by: profile.id,
  });

  if (error) return { error: error.message };
  const payload = (data ?? {}) as { cleared_receipt_numbers?: string[]; match_ids?: string[] };

  await revalidateSidebarForSubdivision(parsed.data.subdivision_id);
  revalidatePath(`/subdivisions/${parsed.data.subdivision_id}/finance/reconciliation`);
  revalidatePath(`/subdivisions/${parsed.data.subdivision_id}/finance/bank-account`);
  return {
    success: {
      clearedReceiptNumbers: payload.cleared_receipt_numbers ?? [],
      matchIds: payload.match_ids ?? [],
    },
  };
}

export async function excludeTransaction(
  input: ExcludeTransactionInput,
): Promise<{ success?: true; error?: string }> {
  const parsed = excludeTransactionSchema.safeParse(input);
  if (!parsed.success) return { error: formatIssues(parsed.error.issues) };

  const profile = await requireCompanyRole();
  await requireSubdivisionAccess(parsed.data.subdivision_id);
  const supabase = createServerClient();

  const { error } = await supabase.rpc("rpc_exclude_bank_transaction", {
    p_bank_transaction_id: parsed.data.bank_transaction_id,
    p_reason: parsed.data.reason,
    p_performed_by: profile.id,
  });

  if (error) return { error: error.message };

  await revalidateSidebarForSubdivision(parsed.data.subdivision_id);
  revalidatePath(`/subdivisions/${parsed.data.subdivision_id}/finance/reconciliation`);
  return { success: true };
}

export async function unexcludeTransaction(
  input: UnexcludeTransactionInput,
): Promise<{ success?: true; error?: string }> {
  const parsed = unexcludeTransactionSchema.safeParse(input);
  if (!parsed.success) return { error: formatIssues(parsed.error.issues) };

  const profile = await requireCompanyRole();
  await requireSubdivisionAccess(parsed.data.subdivision_id);
  const supabase = createServerClient();

  const { error } = await supabase.rpc("rpc_unexclude_bank_transaction", {
    p_bank_transaction_id: parsed.data.bank_transaction_id,
    p_performed_by: profile.id,
  });

  if (error) return { error: error.message };

  await revalidateSidebarForSubdivision(parsed.data.subdivision_id);
  revalidatePath(`/subdivisions/${parsed.data.subdivision_id}/finance/reconciliation`);
  return { success: true };
}

export async function voidBankTransaction(
  input: VoidBankTransactionInput,
): Promise<{ success?: { voidedCreditIds: string[]; reopenedReceiptIds: string[] }; error?: string }> {
  const parsed = voidBankTransactionSchema.safeParse(input);
  if (!parsed.success) return { error: formatIssues(parsed.error.issues) };

  const profile = await requireCompanyRole();
  await requireSubdivisionAccess(parsed.data.subdivision_id);
  const supabase = createServerClient();

  const { data: bt, error: btErr } = await supabase
    .from("bank_transactions")
    .select("id, bank_account_id, matched_total, match_status, is_voided")
    .eq("id", parsed.data.bank_transaction_id)
    .single();
  if (btErr || !bt) return { error: "Bank transaction not found" };
  if (bt.is_voided) return { error: "Bank transaction is already voided" };

  // Q4 guard: if the txn has both deposited-receipt matches AND non-receipt
  // matches, reject with explicit non-receipt match_ids so the manager knows
  // exactly what to unmatch first.
  const { data: matches } = await supabase
    .from("reconciliation_matches")
    .select("id, ledger_entry_id")
    .eq("bank_transaction_id", parsed.data.bank_transaction_id);

  const matchRows = matches ?? [];
  const creditIds = matchRows.map((m) => m.ledger_entry_id);
  let receiptLinkedCreditIds = new Set<string>();
  if (creditIds.length > 0) {
    const { data: ufRows } = await supabase
      .from("undeposited_funds_entries")
      .select("linked_ledger_credit_id")
      .eq("deposited_by_bank_transaction_id", parsed.data.bank_transaction_id)
      .in("linked_ledger_credit_id", creditIds);
    receiptLinkedCreditIds = new Set((ufRows ?? []).map((r) => r.linked_ledger_credit_id));
  }
  const nonReceiptMatchIds = matchRows
    .filter((m) => !receiptLinkedCreditIds.has(m.ledger_entry_id))
    .map((m) => m.id);
  const hasReceiptMatches = receiptLinkedCreditIds.size > 0;
  const hasNonReceiptMatches = nonReceiptMatchIds.length > 0;
  if (hasReceiptMatches && hasNonReceiptMatches) {
    return {
      error:
        `This bank transaction cleared undeposited receipts AND has additional matches beyond those receipts. ` +
        `Voiding would leave the books in an ambiguous state. Unmatch the non-receipt allocations first ` +
        `(match_ids: [${nonReceiptMatchIds.join(", ")}]) via the reconciliation queue, then void the transaction to reopen the receipts.`,
    };
  }

  let voidedCreditIds: string[] = [];
  let reopenedReceiptIds: string[] = [];

  if (matchRows.length > 0) {
    const { data: unmatchData, error: unmatchErr } = await supabase.rpc("rpc_unmatch_bank_transaction", {
      p_bank_transaction_id: parsed.data.bank_transaction_id,
      p_match_ids: null,
      p_reason: `Cascaded from bank transaction void: ${parsed.data.reason}`,
      p_performed_by: profile.id,
    });
    if (unmatchErr) return { error: unmatchErr.message };
    const payload = (unmatchData ?? {}) as {
      voided_credit_ids?: string[];
      reopened_receipt_ids?: string[];
    };
    voidedCreditIds = payload.voided_credit_ids ?? [];
    reopenedReceiptIds = payload.reopened_receipt_ids ?? [];
  }

  const { error: updErr } = await supabase
    .from("bank_transactions")
    .update({
      is_voided: true,
      voided_at: new Date().toISOString(),
      voided_by: profile.id,
      void_reason: parsed.data.reason,
    })
    .eq("id", parsed.data.bank_transaction_id);
  if (updErr) return { error: updErr.message };

  await supabase.from("audit_log").insert({
    profile_id: profile.id,
    subdivision_id: parsed.data.subdivision_id,
    action: "bank_transaction.voided",
    entity_type: "bank_transaction",
    entity_id: parsed.data.bank_transaction_id,
    metadata: {
      reason: parsed.data.reason,
      voided_credit_ids: voidedCreditIds,
      reopened_receipt_ids: reopenedReceiptIds,
    },
  });

  await revalidateSidebarForSubdivision(parsed.data.subdivision_id);
  revalidatePath(`/subdivisions/${parsed.data.subdivision_id}/finance/reconciliation`);
  revalidatePath(`/subdivisions/${parsed.data.subdivision_id}/finance/bank-account`);
  return { success: { voidedCreditIds, reopenedReceiptIds } };
}

export async function voidUndepositedReceipt(
  input: VoidUndepositedReceiptInput,
): Promise<{ success?: { voidedCreditId: string }; error?: string }> {
  const parsed = voidUndepositedReceiptSchema.safeParse(input);
  if (!parsed.success) return { error: formatIssues(parsed.error.issues) };

  const profile = await requireCompanyRole();
  await requireSubdivisionAccess(parsed.data.subdivision_id);
  const supabase = createServerClient();

  const { data: uf, error: ufErr } = await supabase
    .from("undeposited_funds_entries")
    .select("id, status, linked_ledger_credit_id, subdivision_id")
    .eq("id", parsed.data.receipt_id)
    .single();
  if (ufErr || !uf) return { error: "Receipt not found" };
  if (uf.subdivision_id !== parsed.data.subdivision_id) return { error: "Receipt does not belong to this subdivision" };
  if (uf.status === "voided") return { error: "Receipt is already voided" };
  if (uf.status === "deposited") {
    return {
      error:
        "This receipt has been deposited. Void the clearing bank transaction first (which will reopen the receipt), then void the receipt.",
    };
  }

  // Void the linked credit.
  const { error: voidErr } = await supabase.rpc("rpc_ledger_void", {
    p_entry_id: uf.linked_ledger_credit_id,
    p_reason: `Receipt void: ${parsed.data.reason}`,
    p_voided_by: profile.id,
  });
  if (voidErr) return { error: voidErr.message };

  const { error: updErr } = await supabase
    .from("undeposited_funds_entries")
    .update({
      status: "voided",
      voided_at: new Date().toISOString(),
      voided_by: profile.id,
      void_reason: parsed.data.reason,
    })
    .eq("id", parsed.data.receipt_id);
  if (updErr) return { error: updErr.message };

  await supabase.from("audit_log").insert({
    profile_id: profile.id,
    subdivision_id: parsed.data.subdivision_id,
    action: "receipt.voided",
    entity_type: "undeposited_funds_entry",
    entity_id: parsed.data.receipt_id,
    metadata: { reason: parsed.data.reason, voided_credit_id: uf.linked_ledger_credit_id },
  });

  revalidatePath(`/subdivisions/${parsed.data.subdivision_id}/finance/bank-account`);
  await revalidateSidebarForSubdivision(parsed.data.subdivision_id);
  revalidatePath(`/subdivisions/${parsed.data.subdivision_id}/finance/reconciliation`);
  return { success: { voidedCreditId: uf.linked_ledger_credit_id } };
}

// ============================================================================
// VOID PREVIEWS (read-only; for the destructive-confirm dialog)
// ============================================================================

export async function previewVoidBankTransaction(
  subdivisionId: string,
  bankTransactionId: string,
): Promise<VoidCascadePreview> {
  await requireSubdivisionAccess(subdivisionId);
  const supabase = createServerClient();

  const { data: bt } = await supabase
    .from("bank_transactions")
    .select("id, amount, description, transaction_date, is_voided, bank_account_id")
    .eq("id", bankTransactionId)
    .single();
  if (!bt) throw new Error("Bank transaction not found");

  const blocker = bt.is_voided ? "Bank transaction is already voided." : null;

  const { data: matches } = await supabase
    .from("reconciliation_matches")
    .select("id, ledger_entry_id, amount_matched")
    .eq("bank_transaction_id", bankTransactionId);

  const matchRows = matches ?? [];
  const ledgerIds = matchRows.map((m) => m.ledger_entry_id);

  let ledgerMap = new Map<
    string,
    { lot_id: string; category: string; amount: number; levy_notice_id: string | null }
  >();
  if (ledgerIds.length > 0) {
    const { data: ledgerRows } = await supabase
      .from("lot_ledger_entries")
      .select("id, lot_id, category, amount, levy_notice_id")
      .in("id", ledgerIds);
    ledgerMap = new Map(
      (ledgerRows ?? []).map((l) => [
        l.id,
        { lot_id: l.lot_id, category: l.category, amount: Number(l.amount), levy_notice_id: l.levy_notice_id },
      ]),
    );
  }

  const { data: receipts } = await supabase
    .from("undeposited_funds_entries")
    .select("id, receipt_number, lot_id, amount, linked_ledger_credit_id")
    .eq("deposited_by_bank_transaction_id", bankTransactionId);

  const receiptByCreditId = new Map(
    (receipts ?? []).map((r) => [r.linked_ledger_credit_id, r]),
  );

  const lotIds = Array.from(
    new Set([
      ...Array.from(ledgerMap.values()).map((v) => v.lot_id),
      ...(receipts ?? []).map((r) => r.lot_id),
    ]),
  );
  let lotMap = new Map<string, string>();
  if (lotIds.length > 0) {
    const { data: lots } = await supabase.from("lots").select("id, lot_number").in("id", lotIds);
    lotMap = new Map((lots ?? []).map((l) => [l.id, String(l.lot_number)]));
  }

  const noticeIds = Array.from(
    new Set(
      Array.from(ledgerMap.values())
        .map((v) => v.levy_notice_id)
        .filter((x): x is string => !!x),
    ),
  );
  let noticeMap = new Map<string, string>();
  if (noticeIds.length > 0) {
    const { data: notices } = await supabase
      .from("levy_notices")
      .select("id, reference_number")
      .in("id", noticeIds);
    noticeMap = new Map((notices ?? []).map((n) => [n.id, n.reference_number]));
  }

  const matchesToUnlink = matchRows.map((m) => {
    const led = ledgerMap.get(m.ledger_entry_id);
    return {
      match_id: m.id,
      lot_number: led ? lotMap.get(led.lot_id) ?? "" : "",
      amount: Number(m.amount_matched),
      levy_reference: led?.levy_notice_id ? noticeMap.get(led.levy_notice_id) ?? null : null,
    };
  });

  const creditsToVoid = matchRows
    .filter((m) => !receiptByCreditId.has(m.ledger_entry_id))
    .map((m) => {
      const led = ledgerMap.get(m.ledger_entry_id)!;
      return {
        ledger_entry_id: m.ledger_entry_id,
        lot_number: lotMap.get(led.lot_id) ?? "",
        amount: Number(m.amount_matched),
        category: led.category,
      };
    });

  const undepositedReceiptsToReopen = (receipts ?? []).map((r) => ({
    receipt_id: r.id,
    receipt_number: r.receipt_number,
    lot_number: lotMap.get(r.lot_id) ?? "",
    amount: Number(r.amount),
  }));

  const distinctLots = new Set<string>();
  for (const v of ledgerMap.values()) distinctLots.add(v.lot_id);
  for (const r of receipts ?? []) distinctLots.add(r.lot_id);

  const cascadeTotal = matchRows.reduce((s, m) => s + Number(m.amount_matched), 0);

  return {
    kind: "bank_transaction",
    target_summary: `Bank transaction ${bt.transaction_date} · ${Number(bt.amount).toFixed(2)} — ${bt.description ?? ""}`.trim(),
    matches_to_unlink: matchesToUnlink,
    credits_to_void: creditsToVoid,
    undeposited_receipts_to_reopen: undepositedReceiptsToReopen,
    distinct_lot_count: distinctLots.size,
    cascade_amount_total: round2(cascadeTotal),
    blocker,
  };
}

export async function previewVoidLedgerEntry(
  subdivisionId: string,
  entryId: string,
): Promise<VoidCascadePreview> {
  await requireSubdivisionAccess(subdivisionId);
  const supabase = createServerClient();

  const { data: entry } = await supabase
    .from("lot_ledger_entries")
    .select("id, lot_id, subdivision_id, amount, category, status, entry_type, description")
    .eq("id", entryId)
    .single();
  if (!entry || entry.subdivision_id !== subdivisionId) throw new Error("Ledger entry not found");

  let blocker: string | null = null;
  if (entry.status === "voided") blocker = "Entry is already voided.";
  if (!blocker && entry.category === "void_offset") blocker = "Offset entries cannot be voided directly.";
  if (!blocker && entry.category === "payment") {
    // Check if linked via reconciliation_matches or undeposited_funds_entries.
    const [{ data: hasMatch }, { data: hasReceipt }] = await Promise.all([
      supabase
        .from("reconciliation_matches")
        .select("id")
        .eq("ledger_entry_id", entryId)
        .limit(1)
        .maybeSingle(),
      supabase
        .from("undeposited_funds_entries")
        .select("id")
        .eq("linked_ledger_credit_id", entryId)
        .limit(1)
        .maybeSingle(),
    ]);
    if (hasMatch)
      blocker =
        "This payment is linked to a bank transaction. Void or unmatch the bank transaction to reverse it.";
    if (!blocker && hasReceipt)
      blocker =
        "This payment is linked to an undeposited receipt. Void the receipt from the undeposited panel.";
  }

  const { data: lot } = await supabase
    .from("lots")
    .select("lot_number")
    .eq("id", entry.lot_id)
    .single();

  const lotLabel = lot ? `Lot ${lot.lot_number}` : "";

  return {
    kind: "ledger_entry",
    target_summary: `${lotLabel} · ${entry.entry_type} ${Number(entry.amount).toFixed(2)} (${entry.category}) — ${entry.description ?? ""}`.trim(),
    matches_to_unlink: [],
    credits_to_void: [],
    undeposited_receipts_to_reopen: [],
    distinct_lot_count: 1,
    cascade_amount_total: Number(entry.amount),
    blocker,
  };
}

export async function previewVoidUndepositedReceipt(
  subdivisionId: string,
  receiptId: string,
): Promise<VoidCascadePreview> {
  await requireSubdivisionAccess(subdivisionId);
  const supabase = createServerClient();

  const { data: uf } = await supabase
    .from("undeposited_funds_entries")
    .select(
      "id, receipt_number, lot_id, amount, status, linked_ledger_credit_id, subdivision_id, payment_method, cheque_number",
    )
    .eq("id", receiptId)
    .single();
  if (!uf || uf.subdivision_id !== subdivisionId) throw new Error("Receipt not found");

  let blocker: string | null = null;
  if (uf.status === "voided") blocker = "Receipt is already voided.";
  if (!blocker && uf.status === "deposited")
    blocker =
      "Receipt has been deposited. Void the clearing bank transaction first (which will reopen the receipt), then void the receipt.";

  const { data: lot } = await supabase
    .from("lots")
    .select("lot_number")
    .eq("id", uf.lot_id)
    .single();

  return {
    kind: "undeposited_receipt",
    target_summary: `Receipt ${uf.receipt_number} — ${uf.payment_method}${uf.cheque_number ? ` #${uf.cheque_number}` : ""} — ${Number(uf.amount).toFixed(2)}`,
    matches_to_unlink: [],
    credits_to_void: [
      {
        ledger_entry_id: uf.linked_ledger_credit_id,
        lot_number: lot ? String(lot.lot_number) : "",
        amount: Number(uf.amount),
        category: "payment",
      },
    ],
    undeposited_receipts_to_reopen: [],
    distinct_lot_count: 1,
    cascade_amount_total: Number(uf.amount),
    blocker,
  };
}

// ============================================================================
// HELPERS
// ============================================================================

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function daysBetween(fromISO: string, toISO: string): number {
  const a = new Date(fromISO + "T00:00:00Z").getTime();
  const b = new Date(toISO + "T00:00:00Z").getTime();
  return Math.max(0, Math.round((b - a) / 86400000));
}
