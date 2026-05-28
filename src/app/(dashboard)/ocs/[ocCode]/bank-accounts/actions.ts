"use server";

import { requireCompanyRole, requireOCAccess } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";
import { revalidatePath } from "next/cache";

/**
 * Update a bank account's running balance + statement date. Called from
 * the CSV import dialog after the client has parsed the file and we
 * have a single number to persist. The CSV rows themselves are NOT
 * stored yet (no transactions table in the new banking stack); only
 * the resulting balance is saved. The original CSV file isn't kept
 * either , managers re-upload when they need a fresh snapshot.
 */
export async function updateBankAccountBalance(
  ocId: string,
  accountId: string,
  balance: number,
  asOfDate: string | null,
): Promise<{ error?: string }> {
  const profile = await requireCompanyRole();
  await requireOCAccess(ocId);

  if (!Number.isFinite(balance)) {
    return { error: "Balance must be a number." };
  }

  const supabase = createServerClient();
  const { data: before } = await supabase
    .from("bank_accounts")
    .select("current_balance, current_balance_as_of")
    .eq("id", accountId)
    .eq("oc_id", ocId)
    .maybeSingle();
  if (!before) return { error: "Bank account not found." };

  const { error } = await supabase
    .from("bank_accounts")
    .update({
      current_balance: Math.round(balance * 100) / 100,
      current_balance_as_of: asOfDate,
      updated_at: new Date().toISOString(),
    })
    .eq("id", accountId)
    .eq("oc_id", ocId);
  if (error) return { error: error.message };

  await supabase.from("audit_log").insert({
    profile_id: profile.id,
    oc_id: ocId,
    action: "update",
    entity_type: "bank_account",
    entity_id: accountId,
    before_state: before,
    after_state: { current_balance: balance, current_balance_as_of: asOfDate },
  });

  revalidatePath("/ocs/[ocCode]/bank-accounts", "page");
  return {};
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
    opening_balance?: number;
    opening_balance_date?: string;
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
      opening_balance: data.opening_balance ?? 0,
      opening_balance_date: data.opening_balance_date ?? null,
      current_balance: data.opening_balance ?? 0,
      current_balance_as_of: data.opening_balance_date ?? null,
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
