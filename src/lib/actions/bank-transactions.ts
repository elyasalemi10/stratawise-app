"use server";

import { requireCompanyRole, requireSubdivisionAccess } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";
import { revalidatePath } from "next/cache";
import { revalidateSidebarForSubdivision } from "./subdivision";
import {
  bankAccountUpdateSchema,
  importTransactionsSchema,
  type BankAccountSummary,
  type BankAccountUpdateInput,
  type BankTransactionRecord,
  type ImportSummary,
  type ImportTransactionsInput,
} from "@/lib/validations/bank-transactions";
import { detectSingleLevyReference } from "@/lib/reconciliation/reference";
import { tryAutoMatch } from "@/lib/reconciliation/orchestrator";

export async function getBankAccountsForSubdivision(
  subdivisionId: string
): Promise<BankAccountSummary[]> {
  await requireSubdivisionAccess(subdivisionId);
  const supabase = createServerClient();

  const { data: accounts } = await supabase
    .from("bank_accounts")
    .select(
      "id, subdivision_id, fund_type, account_name, bsb, account_number, bank_name, opening_balance, opening_balance_date, bpay_biller_code, bpay_crn_prefix",
    )
    .eq("subdivision_id", subdivisionId)
    .order("fund_type");

  if (!accounts || accounts.length === 0) return [];

  const ids = accounts.map((a) => a.id);
  const { data: txSums } = await supabase
    .from("bank_transactions")
    .select("bank_account_id, amount, transaction_date")
    .in("bank_account_id", ids);

  const byAccount = new Map<string, { sum: number; count: number; latest: string | null }>();
  for (const t of txSums ?? []) {
    const entry = byAccount.get(t.bank_account_id) ?? { sum: 0, count: 0, latest: null };
    entry.sum += Number(t.amount);
    entry.count += 1;
    if (!entry.latest || t.transaction_date > entry.latest) entry.latest = t.transaction_date;
    byAccount.set(t.bank_account_id, entry);
  }

  return accounts.map((a) => {
    const agg = byAccount.get(a.id) ?? { sum: 0, count: 0, latest: null };
    return {
      id: a.id,
      subdivision_id: a.subdivision_id,
      fund_type: a.fund_type,
      account_name: a.account_name,
      bsb: a.bsb,
      account_number: a.account_number,
      bank_name: a.bank_name,
      opening_balance: Number(a.opening_balance ?? 0),
      opening_balance_date: a.opening_balance_date,
      current_balance: Number(a.opening_balance ?? 0) + agg.sum,
      last_transaction_date: agg.latest,
      transaction_count: agg.count,
      bpay_biller_code: a.bpay_biller_code ?? null,
      bpay_crn_prefix: a.bpay_crn_prefix ?? null,
    };
  });
}

export async function getBankTransactions(
  subdivisionId: string,
  bankAccountId: string,
  limit = 100
): Promise<BankTransactionRecord[]> {
  await requireSubdivisionAccess(subdivisionId);
  const supabase = createServerClient();

  // Verify the bank account belongs to this subdivision
  const { data: account } = await supabase
    .from("bank_accounts")
    .select("subdivision_id")
    .eq("id", bankAccountId)
    .single();

  if (!account || account.subdivision_id !== subdivisionId) {
    throw new Error("Bank account not found");
  }

  const { data } = await supabase
    .from("bank_transactions")
    .select("id, bank_account_id, source, transaction_date, amount, description, balance, match_status, matched_payment_id, imported_at")
    .eq("bank_account_id", bankAccountId)
    .order("transaction_date", { ascending: false })
    .order("imported_at", { ascending: false })
    .limit(limit);

  return (data ?? []).map((t) => {
    const matchedRef = detectSingleLevyReference(t.description);
    return {
      id: t.id,
      bank_account_id: t.bank_account_id,
      source: t.source,
      transaction_date: t.transaction_date,
      amount: Number(t.amount),
      description: t.description,
      balance: t.balance !== null ? Number(t.balance) : null,
      match_status: t.match_status,
      matched_payment_id: t.matched_payment_id,
      matched_levy_id: null,
      matched_reference: matchedRef ? matchedRef.toUpperCase() : null,
      imported_at: t.imported_at,
    };
  });
}

export async function importBankTransactions(
  subdivisionId: string,
  input: ImportTransactionsInput
): Promise<{ error?: string; summary?: ImportSummary }> {
  const profile = await requireCompanyRole();
  await requireSubdivisionAccess(subdivisionId);

  const parsed = importTransactionsSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const supabase = createServerClient();

  const { data: account } = await supabase
    .from("bank_accounts")
    .select("id, subdivision_id, fund_type")
    .eq("id", parsed.data.bank_account_id)
    .single();

  if (!account || account.subdivision_id !== subdivisionId) {
    return { error: "Bank account not found" };
  }

  const { data: existing } = await supabase
    .from("bank_transactions")
    .select("transaction_date, amount, description")
    .eq("bank_account_id", account.id);

  const existingKeys = new Set(
    (existing ?? []).map(
      (t) => `${t.transaction_date}|${Number(t.amount).toFixed(2)}|${(t.description ?? "").trim()}`
    )
  );

  const summary: ImportSummary = {
    imported: 0,
    duplicates: 0,
    matched: 0,
    errors: [],
  };

  // Per-row: insert the bank_transaction; then run the auto-match orchestrator
  // (Strategies 1-6 + fuzzy hint surfacing). Auto-match failures are absorbed —
  // the row still imports as 'unmatched'; the orchestrator records the attempt
  // and any diagnostic audits (stale_reference_detected etc.) internally.
  //
  // PP4-C: bulk import does not propose payer mappings — passing
  // remember_payer=true would create dozens of mappings per import without
  // manager review. tryAutoMatch is called without remember_payer (defaults
  // to false via Zod). Manual entry is the only path that surfaces the
  // "remember this payer" checkbox.
  //
  // PP4-C: the previous inline implementation pre-fetched candidate levy
  // notices in one batch query for performance. The orchestrator does its
  // own per-row lookups (~10-15 queries each vs ~3 inline), which is fine
  // for typical CSV sizes (10-500 rows). PRE_LAUNCH_CLEANUP records the
  // re-introduction-of-batch-pre-fetch idea if real-world imports exceed
  // ~1,000 rows.
  for (const row of parsed.data.rows) {
    const key = `${row.transaction_date}|${row.amount.toFixed(2)}|${row.description.trim()}`;
    if (existingKeys.has(key)) {
      summary.duplicates += 1;
      continue;
    }
    existingKeys.add(key);

    const { data: inserted, error: insertErr } = await supabase
      .from("bank_transactions")
      .insert({
        bank_account_id: account.id,
        source: "csv",
        transaction_date: row.transaction_date,
        amount: row.amount,
        description: row.description,
        balance: row.balance ?? null,
        match_status: "unmatched",
      })
      .select("id")
      .single();

    if (insertErr || !inserted) {
      summary.errors.push(`${row.transaction_date} ${row.description}: ${insertErr?.message ?? "insert failed"}`);
      continue;
    }
    summary.imported += 1;

    // Orchestrator runs on credit-direction rows only; debits never match.
    if (row.amount <= 0) continue;

    const result = await tryAutoMatch({
      bankTransactionId: inserted.id,
      subdivisionId,
      bankAccountId: account.id,
      description: row.description,
      amount: row.amount,
      transactionDate: row.transaction_date,
      performedBy: profile.id,
    });

    // summary.matched counts rows where the orchestrator allocated something —
    // covers full and partial matches. Strategies that surface a fuzzy hint
    // (Strategy 6, never matches) are not counted here; the hint is persisted
    // on the bank_transaction's fuzzy_hint_metadata for the queue UI.
    if (result.allocatedAmount > 0) {
      summary.matched += 1;
    }
  }

  await supabase.from("audit_log").insert({
    profile_id: profile.id,
    subdivision_id: subdivisionId,
    action: "bank_transaction.csv_imported",
    entity_type: "bank_account",
    entity_id: account.id,
    after_state: {
      bank_account_id: account.id,
      fund_type: account.fund_type,
      imported: summary.imported,
      duplicates: summary.duplicates,
      matched: summary.matched,
      errors: summary.errors.length,
    },
  });

  await revalidateSidebarForSubdivision(subdivisionId);
  revalidatePath(`/subdivisions/${subdivisionId}/finance/bank-account`);
  revalidatePath(`/subdivisions/${subdivisionId}/finance/reconciliation`);
  return { summary };
}

// ─── updateBankAccount ────────────────────────────────────────
//
// Generic mutable-field updater for bank_accounts. Currently exposes
// bpay_biller_code + bpay_crn_prefix. Extending to additional fields is a
// schema-only change (add field to bankAccountUpdateSchema) — no action
// signature changes required.
//
// Auth: requireCompanyRole gates on (super_admin | manager-with-role); we
// then look up the bank account, derive its subdivision, and run
// requireSubdivisionAccess to enforce the manager's company owns it. The
// bank_accounts table has subdivision_id NOT NULL FK so the lookup is
// always definitive.
export async function updateBankAccount(
  input: BankAccountUpdateInput,
): Promise<{ success?: { id: string }; error?: string }> {
  const parsed = bankAccountUpdateSchema.safeParse(input);
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }
  const { id, ...fields } = parsed.data;

  const profile = await requireCompanyRole();
  const supabase = createServerClient();

  const { data: existing, error: lookupErr } = await supabase
    .from("bank_accounts")
    .select(
      "id, subdivision_id, bpay_biller_code, bpay_crn_prefix",
    )
    .eq("id", id)
    .maybeSingle();
  if (lookupErr) return { error: lookupErr.message };
  if (!existing) return { error: "Bank account not found" };

  await requireSubdivisionAccess(existing.subdivision_id);

  // Build the update payload with only the keys the caller actually sent.
  // `null` is a meaningful clear value, distinct from `undefined` (no-op).
  const payload: Record<string, unknown> = {};
  if (fields.bpay_biller_code !== undefined) {
    payload.bpay_biller_code = fields.bpay_biller_code;
  }
  if (fields.bpay_crn_prefix !== undefined) {
    payload.bpay_crn_prefix = fields.bpay_crn_prefix;
  }

  if (Object.keys(payload).length === 0) {
    // Defensive: schema's `.refine` already catches this; left as a safety net.
    return { error: "No fields to update" };
  }

  const { error: updateErr } = await supabase
    .from("bank_accounts")
    .update(payload)
    .eq("id", id);
  if (updateErr) return { error: updateErr.message };

  await supabase.from("audit_log").insert({
    profile_id: profile.id,
    subdivision_id: existing.subdivision_id,
    action: "bank_account.updated",
    entity_type: "bank_account",
    entity_id: id,
    before_state: {
      bpay_biller_code: existing.bpay_biller_code,
      bpay_crn_prefix: existing.bpay_crn_prefix,
    },
    after_state: payload,
  });

  revalidatePath(`/subdivisions/${existing.subdivision_id}/finance/bank-account`);
  return { success: { id } };
}
