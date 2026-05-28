"use server";

import { requireCompanyRole, requireOCAccess } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";
import { revalidatePath } from "next/cache";

/**
 * Persist a batch of parsed CSV rows as bank_transactions. Imports are
 * append-only (no dedup) , managers re-upload whenever they want a
 * fresh snapshot, and may end up with duplicates if they import the
 * same file twice. Acceptable trade for the simplest UX. No balance
 * tracking , the import is for transaction history visibility only.
 */
export async function importBankTransactions(
  ocId: string,
  accountId: string,
  rows: Array<{
    date: string | null;
    description: string;
    amount: number | null;
    balance: number | null;
  }>,
): Promise<{ inserted?: number; error?: string }> {
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
    transaction_date: r.date,
    description: (r.description ?? "").slice(0, 1000),
    amount: r.amount,
    balance: r.balance,
    imported_by: profile.id,
  }));

  if (inserts.length > 0) {
    const { error } = await supabase.from("bank_transactions").insert(inserts);
    if (error) return { error: error.message };
  }

  await supabase.from("audit_log").insert({
    profile_id: profile.id,
    oc_id: ocId,
    action: "import",
    entity_type: "bank_account",
    entity_id: accountId,
    after_state: { transactions_imported: inserts.length },
  });

  revalidatePath("/ocs/[ocCode]/bank-accounts", "page");
  return { inserted: inserts.length };
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
