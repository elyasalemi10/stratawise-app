"use server";

import { requireCompanyRole } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";
import { revalidatePath } from "next/cache";
import type { CoaAccount, CoaAccountType } from "@/lib/chart-of-accounts";

async function companyIdFromContext(): Promise<string> {
  const profile = await requireCompanyRole();
  if (!profile.management_company_id) {
    throw new Error("No management company in context");
  }
  return profile.management_company_id;
}

export async function listChartOfAccounts(): Promise<CoaAccount[]> {
  const companyId = await companyIdFromContext();
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("chart_of_accounts")
    .select("id, code, name, account_type, is_system, archived_at")
    .eq("management_company_id", companyId)
    .order("code", { ascending: true });
  if (error) throw new Error(`Failed to load chart of accounts: ${error.message}`);
  return (data ?? []) as CoaAccount[];
}

export async function createCoaAccount(input: {
  code: string;
  name: string;
  account_type: CoaAccountType;
}): Promise<{ account?: CoaAccount; error?: string }> {
  const companyId = await companyIdFromContext();

  const code = input.code.trim();
  const name = input.name.trim();
  if (!/^[0-9]{4}$/.test(code)) {
    return { error: "Code must be exactly 4 digits." };
  }
  if (!name || name.length > 120) {
    return { error: "Name is required and must be under 120 characters." };
  }
  if (!(["asset", "liability", "equity", "income", "expense"] as const).includes(input.account_type)) {
    return { error: "Pick an account type." };
  }

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("chart_of_accounts")
    .insert({
      management_company_id: companyId,
      code,
      name,
      account_type: input.account_type,
      is_system: false,
    })
    .select("id, code, name, account_type, is_system, archived_at")
    .single();

  if (error) {
    if (error.code === "23505") {
      if (error.message.includes("chart_of_accounts_code_unique")) {
        return { error: `Code ${code} is already used by another account.` };
      }
      if (error.message.includes("chart_of_accounts_name_unique")) {
        return { error: `An account named "${name}" already exists.` };
      }
      return { error: "An account with that code or name already exists." };
    }
    console.error("Failed to create CoA account", error);
    return { error: "Failed to create account. Please try again." };
  }

  revalidatePath("/chart-of-accounts");
  return { account: data as CoaAccount };
}

export async function archiveCoaAccount(id: string): Promise<{ error?: string }> {
  const companyId = await companyIdFromContext();
  const supabase = createServerClient();

  const { data: existing, error: fetchErr } = await supabase
    .from("chart_of_accounts")
    .select("id, is_system, archived_at")
    .eq("id", id)
    .eq("management_company_id", companyId)
    .maybeSingle();
  if (fetchErr || !existing) return { error: "Account not found." };
  if (existing.is_system) return { error: "Built-in accounts can't be archived." };

  const { error } = await supabase
    .from("chart_of_accounts")
    .update({ archived_at: existing.archived_at ? null : new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: "Failed to update account." };

  revalidatePath("/chart-of-accounts");
  return {};
}
