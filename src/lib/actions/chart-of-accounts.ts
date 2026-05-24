"use server";

import { requireCompanyRole } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";
import { revalidatePath } from "next/cache";

export type CoaAccountType = "asset" | "liability" | "equity" | "income" | "expense";

export interface CoaAccount {
  id: string;
  code: string;
  name: string;
  account_type: CoaAccountType;
  is_system: boolean;
  archived_at: string | null;
}

export const ACCOUNT_TYPE_LABEL: Record<CoaAccountType, string> = {
  asset: "Asset",
  liability: "Liability",
  equity: "Equity",
  income: "Income",
  expense: "Expense",
};

// Maps the leading digit of a code to its conventional account type so we can
// flag (not block) when a manager picks a type that doesn't match the range.
// See `expectedTypeForCode` / `mismatchMessage`.
const CODE_RANGE_TO_TYPE: Record<string, CoaAccountType> = {
  "1": "asset",
  "2": "liability",
  "3": "equity",
  "4": "income",
  "5": "expense",
  "6": "expense",
};

export function expectedTypeForCode(code: string): CoaAccountType | null {
  if (!/^[0-9]{4}$/.test(code)) return null;
  return CODE_RANGE_TO_TYPE[code[0]] ?? null;
}

const RANGE_LABELS: Record<CoaAccountType, string> = {
  asset: "1000s",
  liability: "2000s",
  equity: "3000s",
  income: "4000s",
  expense: "5000s/6000s",
};

/** Returns the inline warning copy if (type, code) sit in different bands. */
export function mismatchMessage(type: CoaAccountType, code: string): string | null {
  const expected = expectedTypeForCode(code);
  if (!expected || expected === type) return null;
  return `${ACCOUNT_TYPE_LABEL[type]} accounts usually sit in the ${RANGE_LABELS[type]} — using ${code} may put it in the wrong section of your reports.`;
}

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
      // Unique constraint — check which one to give the right copy.
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
