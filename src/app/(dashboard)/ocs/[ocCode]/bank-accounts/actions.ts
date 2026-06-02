"use server";

import { requireCompanyRole, requireOCAccess } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";
import { revalidatePath } from "next/cache";
import { autoMatchBankTransactions } from "@/lib/banking/auto-match";

/**
 * Persist a batch of parsed CSV rows as bank_transactions, then run the
 * two-strategy auto-matcher (DRN → owner reference) on every newly-inserted
 * credit-direction row. Imports themselves stay append-only (no dedup) —
 * managers re-upload whenever they want a fresh snapshot. Auto-matched rows
 * land at match_status='auto_matched'; everything else stays 'unmatched' and
 * surfaces on the reconciliation queue.
 */
export async function importBankTransactions(
  ocId: string,
  accountId: string,
  rows: Array<{
    date: string | null;
    description: string;
    amount: number | null;
    balance: number | null;
    reference: string | null;
  }>,
): Promise<{ inserted?: number; auto_matched?: number; error?: string }> {
  const profile = await requireCompanyRole();
  await requireOCAccess(ocId);
  const supabase = createServerClient();

  const { data: account } = await supabase
    .from("bank_accounts")
    .select("id")
    .eq("id", accountId)
    .eq("oc_id", ocId)
    .maybeSingle();
  if (!account) return { error: "Bank account not found." };

  const inserts = rows.map((r) => ({
    oc_id: ocId,
    bank_account_id: accountId,
    source: "csv_import" as const,
    transaction_date: r.date,
    description: (r.description ?? "").slice(0, 1000),
    amount: r.amount,
    balance: r.balance,
    deft_reference_number: r.reference ? r.reference.slice(0, 64) : null,
    imported_by: profile.id,
  }));

  let insertedIds: string[] = [];
  if (inserts.length > 0) {
    const { data, error } = await supabase
      .from("bank_transactions")
      .insert(inserts)
      .select("id");
    if (error) return { error: error.message };
    insertedIds = (data ?? []).map((r) => r.id as string);
  }

  let autoMatched = 0;
  if (insertedIds.length > 0) {
    // Auto-match is best-effort: the underlying RPC depends on tables
    // (reconciliation_matches, lot_ledger_entries) that may not exist yet
    // in this environment. Don't let a matcher failure break the import.
    try {
      const result = await autoMatchBankTransactions(
        ocId,
        insertedIds,
        profile.id,
      );
      autoMatched = result.matched;
    } catch (err) {
      console.error("auto-match orchestrator failed", err);
    }
  }

  await supabase.from("audit_log").insert({
    profile_id: profile.id,
    oc_id: ocId,
    action: "import",
    entity_type: "bank_account",
    entity_id: accountId,
    after_state: {
      transactions_imported: inserts.length,
      auto_matched: autoMatched,
    },
  });

  revalidatePath("/ocs/[ocCode]/bank-accounts", "page");
  revalidatePath("/ocs/[ocCode]/reconciliation", "page");
  return { inserted: inserts.length, auto_matched: autoMatched };
}

/**
 * Create a new bank account for an OC. Triggered from the "+" tab on the
 * bank accounts page. The new row is unlinked , no fund_type / fund_id
 * gets set here. A separate step on the funds page links it to a fund.
 */
export async function createBankAccount(
  ocId: string,
  data: {
    account_name: string;
    bsb: string;
    account_number: string;
    bank_name: string | null;
  },
): Promise<{ id?: string; error?: string }> {
  const profile = await requireCompanyRole();
  await requireOCAccess(ocId);

  const accountName = data.account_name.trim();
  const bsb = data.bsb.trim();
  const accountNumber = data.account_number.trim();
  if (!accountName) return { error: "Account name is required." };
  if (!/^\d{3}-?\d{3}$/.test(bsb)) return { error: "BSB must be 6 digits." };
  if (!/^\d{6,9}$/.test(accountNumber)) return { error: "Account number must be 6-9 digits." };

  const supabase = createServerClient();

  const { data: row, error } = await supabase
    .from("bank_accounts")
    .insert({
      oc_id: ocId,
      fund_type: "operating",
      account_name: accountName,
      bsb,
      account_number: accountNumber,
      bank_name: data.bank_name || null,
    })
    .select("id")
    .single();

  if (error || !row) return { error: error?.message ?? "Could not create bank account." };

  await supabase.from("audit_log").insert({
    profile_id: profile.id,
    oc_id: ocId,
    action: "create",
    entity_type: "bank_account",
    entity_id: row.id,
    after_state: {
      account_name: accountName,
      bsb,
      account_number: accountNumber,
      bank_name: data.bank_name,
    },
  });

  revalidatePath("/ocs/[ocCode]/bank-accounts", "page");
  return { id: row.id };
}
