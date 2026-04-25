"use server";

import { requireCompanyRole, requireSubdivisionAccess } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";
import { revalidatePath } from "next/cache";
import { revalidateSidebarForSubdivision } from "./subdivision";
import {
  importTransactionsSchema,
  type BankAccountSummary,
  type BankTransactionRecord,
  type ImportSummary,
  type ImportTransactionsInput,
} from "@/lib/validations/bank-transactions";
import { detectSingleLevyReference } from "@/lib/reconciliation/reference";

export async function getBankAccountsForSubdivision(
  subdivisionId: string
): Promise<BankAccountSummary[]> {
  await requireSubdivisionAccess(subdivisionId);
  const supabase = createServerClient();

  const { data: accounts } = await supabase
    .from("bank_accounts")
    .select("id, subdivision_id, fund_type, account_name, bsb, account_number, bank_name, opening_balance, opening_balance_date")
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

  // Pre-fetch candidate levy notices by reference for the whole batch.
  // Outstanding balance is recomputed per-row inside the loop so we only need
  // the id/lot/fund mapping up-front.
  const candidateReferences = new Set<string>();
  for (const row of parsed.data.rows) {
    const ref = detectSingleLevyReference(row.description);
    if (ref) candidateReferences.add(ref);
  }

  const refToLevy = new Map<
    string,
    { id: string; lot_id: string; fund_type: "administrative" | "capital_works"; amount: number }
  >();
  if (candidateReferences.size > 0) {
    const { data: levies } = await supabase
      .from("levy_notices")
      .select("id, lot_id, reference_number, fund_type, amount, subdivision_id")
      .eq("subdivision_id", subdivisionId)
      .in("reference_number", Array.from(candidateReferences));
    for (const l of levies ?? []) {
      refToLevy.set(l.reference_number.toUpperCase(), {
        id: l.id,
        lot_id: l.lot_id,
        fund_type: l.fund_type as "administrative" | "capital_works",
        amount: Number(l.amount),
      });
    }
  }

  // Per-row: insert the bank_transaction; then try a minimal auto-match
  // against the exact reference. Auto-match failures are tolerated — the row
  // still imports as 'unmatched', with a warning audit entry.
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

    // Auto-match eligibility: credit (amount > 0), single levy reference in
    // description, notice exists in this subdivision, outstanding > 0.
    if (row.amount <= 0) continue;
    const ref = detectSingleLevyReference(row.description);
    if (!ref) continue;
    const notice = refToLevy.get(ref);
    if (!notice) continue;

    const { data: priorCredits } = await supabase
      .from("lot_ledger_entries")
      .select("amount, entry_type, status")
      .eq("levy_notice_id", notice.id)
      .eq("status", "active")
      .eq("entry_type", "credit");
    const paidSoFar = (priorCredits ?? []).reduce((s, c) => s + Number(c.amount), 0);
    const outstanding = Math.round((notice.amount - paidSoFar) * 100) / 100;
    if (outstanding <= 0) continue;

    const allocated = Math.min(row.amount, outstanding);

    const { error: matchErr } = await supabase.rpc("rpc_reconcile_bank_transaction", {
      p_bank_transaction_id: inserted.id,
      p_allocations: [
        {
          lot_id: notice.lot_id,
          fund_type: notice.fund_type,
          amount: allocated,
          levy_notice_id: notice.id,
          reference: ref,
        },
      ],
      p_match_method: "auto_reference",
      p_match_confidence: "exact_reference",
      p_notes: `CSV auto-match on reference ${ref}`,
      p_performed_by: profile.id,
    });

    if (matchErr) {
      await supabase.from("audit_log").insert({
        profile_id: profile.id,
        subdivision_id: subdivisionId,
        action: "reconciliation.auto_match_failed",
        entity_type: "bank_transaction",
        entity_id: inserted.id,
        metadata: { reason: matchErr.message, reference: ref, severity: "warning" },
      });
      continue;
    }

    summary.matched += 1;

    if (row.amount > outstanding) {
      await supabase
        .from("bank_transactions")
        .update({
          notes: `Auto-matched $${allocated.toFixed(2)} against ${ref}; $${(row.amount - outstanding).toFixed(2)} remaining — review manually.`,
        })
        .eq("id", inserted.id);
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

