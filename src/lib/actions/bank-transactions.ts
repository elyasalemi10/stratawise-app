"use server";

import { requireCompanyRole, requireSubdivisionAccess } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";
import { revalidatePath } from "next/cache";
import {
  importTransactionsSchema,
  type BankAccountSummary,
  type BankTransactionRecord,
  type ImportSummary,
  type ImportTransactionsInput,
} from "@/lib/validations/bank-transactions";

const REF_REGEX = /\bLEV-\d{4}-\d{6}\b/i;

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
    const matchedRef = t.description ? t.description.match(REF_REGEX)?.[0] ?? null : null;
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
    (existing ?? []).map((t) =>
      `${t.transaction_date}|${Number(t.amount).toFixed(2)}|${(t.description ?? "").trim()}`
    )
  );

  const toInsert: Array<{
    bank_account_id: string;
    source: "csv";
    transaction_date: string;
    amount: number;
    description: string;
    balance: number | null;
    match_status: "unmatched" | "auto_matched";
    matched_payment_id: string | null;
  }> = [];

  const summary: ImportSummary = {
    imported: 0,
    duplicates: 0,
    matched: 0,
    errors: [],
  };

  const candidateReferences = new Set<string>();
  for (const row of parsed.data.rows) {
    const ref = row.description.match(REF_REGEX)?.[0];
    if (ref) candidateReferences.add(ref.toUpperCase());
  }

  const refToLevy = new Map<string, { id: string; amount: number }>();
  if (candidateReferences.size > 0) {
    const { data: levies } = await supabase
      .from("levy_notices")
      .select("id, reference_number, amount, subdivision_id")
      .eq("subdivision_id", subdivisionId)
      .in("reference_number", Array.from(candidateReferences));
    for (const l of levies ?? []) {
      refToLevy.set(l.reference_number.toUpperCase(), { id: l.id, amount: Number(l.amount) });
    }
  }

  for (const row of parsed.data.rows) {
    const key = `${row.transaction_date}|${row.amount.toFixed(2)}|${row.description.trim()}`;
    if (existingKeys.has(key)) {
      summary.duplicates += 1;
      continue;
    }
    existingKeys.add(key);

    const ref = row.description.match(REF_REGEX)?.[0]?.toUpperCase();
    const levy = ref ? refToLevy.get(ref) : undefined;
    const matches = !!(levy && row.amount > 0 && Math.abs(row.amount - levy.amount) < 0.01);

    toInsert.push({
      bank_account_id: account.id,
      source: "csv",
      transaction_date: row.transaction_date,
      amount: row.amount,
      description: row.description,
      balance: row.balance ?? null,
      match_status: matches ? "auto_matched" : "unmatched",
      matched_payment_id: null,
    });
    if (matches) summary.matched += 1;
  }

  if (toInsert.length === 0) {
    return { summary };
  }

  const { error, data: inserted } = await supabase
    .from("bank_transactions")
    .insert(toInsert)
    .select("id");

  if (error) return { error: error.message };

  summary.imported = inserted?.length ?? 0;

  await supabase.from("audit_log").insert({
    profile_id: profile.id,
    subdivision_id: subdivisionId,
    action: "import",
    entity_type: "bank_transaction",
    after_state: {
      bank_account_id: account.id,
      fund_type: account.fund_type,
      imported: summary.imported,
      duplicates: summary.duplicates,
      matched: summary.matched,
    },
  });

  revalidatePath(`/subdivisions/${subdivisionId}/finance/bank-account`);
  return { summary };
}

