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
