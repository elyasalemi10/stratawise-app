"use server";

import { requireCompanyRole } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";
import { revalidatePath } from "next/cache";
import type { CoaAccount, CoaAccountType, CoaGstTreatment } from "@/lib/chart-of-accounts";

const ACCOUNT_TYPES = ["asset", "liability", "equity", "income", "expense"] as const;
const GST_TREATMENTS = ["gst_on_income", "gst_on_expenses", "gst_free", "bas_excluded"] as const;

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
    .select("id, code, name, account_type, gst_treatment, system_role, is_system, archived_at")
    .eq("management_company_id", companyId)
    .order("code", { ascending: true });
  if (error) throw new Error(`Failed to load chart of accounts: ${error.message}`);
  return (data ?? []) as CoaAccount[];
}

export async function createCoaAccount(input: {
  code: string;
  name: string;
  account_type: CoaAccountType;
  gst_treatment: CoaGstTreatment;
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
  if (!ACCOUNT_TYPES.includes(input.account_type)) {
    return { error: "Pick an account type." };
  }
  if (!GST_TREATMENTS.includes(input.gst_treatment)) {
    return { error: "Pick a GST treatment." };
  }

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("chart_of_accounts")
    .insert({
      management_company_id: companyId,
      code,
      name,
      account_type: input.account_type,
      gst_treatment: input.gst_treatment,
      is_system: false,
    })
    .select("id, code, name, account_type, gst_treatment, system_role, is_system, archived_at")
    .single();

  if (error) {
    if (error.code === "23505") {
      // Only `code` is unique now. Names can repeat across accounts.
      if (error.message.includes("chart_of_accounts_code_unique")) {
        return { error: `Code ${code} is already used by another account.` };
      }
      return { error: "An account with that code already exists." };
    }
    console.error("Failed to create CoA account", error);
    return { error: "Failed to create account. Please try again." };
  }

  revalidatePath("/chart-of-accounts");
  return { account: data as CoaAccount };
}

export async function updateCoaAccount(input: {
  id: string;
  code: string;
  name: string;
  account_type: CoaAccountType;
  gst_treatment: CoaGstTreatment;
}): Promise<{ account?: CoaAccount; error?: string }> {
  const companyId = await companyIdFromContext();

  const code = input.code.trim();
  const name = input.name.trim();
  if (!/^[0-9]{4}$/.test(code)) return { error: "Code must be exactly 4 digits." };
  if (!name || name.length > 120) return { error: "Name is required and must be under 120 characters." };
  if (!ACCOUNT_TYPES.includes(input.account_type)) return { error: "Pick an account type." };
  if (!GST_TREATMENTS.includes(input.gst_treatment)) return { error: "Pick a GST treatment." };

  const supabase = createServerClient();

  // Built-in accounts can be edited (rename / re-type / re-GST) BUT keep
  // their system_role and code intact so the app's references keep resolving.
  const { data: existing, error: fetchErr } = await supabase
    .from("chart_of_accounts")
    .select("id, is_system, system_role, code")
    .eq("id", input.id)
    .eq("management_company_id", companyId)
    .maybeSingle();
  if (fetchErr || !existing) return { error: "Account not found." };

  const codeIsLocked = existing.is_system && existing.system_role;
  if (codeIsLocked && code !== existing.code) {
    return { error: "Built-in accounts can't have their code changed." };
  }

  const { data, error } = await supabase
    .from("chart_of_accounts")
    .update({
      code,
      name,
      account_type: input.account_type,
      gst_treatment: input.gst_treatment,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.id)
    .eq("management_company_id", companyId)
    .select("id, code, name, account_type, gst_treatment, system_role, is_system, archived_at")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { error: `Code ${code} is already used by another account.` };
    }
    console.error("Failed to update CoA account", error);
    return { error: "Failed to update account. Please try again." };
  }
  revalidatePath("/chart-of-accounts");
  return { account: data as CoaAccount };
}

export async function setCoaAccountActive(
  id: string,
  active: boolean,
): Promise<{ error?: string }> {
  const companyId = await companyIdFromContext();
  const supabase = createServerClient();

  const { data: existing, error: fetchErr } = await supabase
    .from("chart_of_accounts")
    .select("id, is_system, system_role")
    .eq("id", id)
    .eq("management_company_id", companyId)
    .maybeSingle();
  if (fetchErr || !existing) return { error: "Account not found." };

  // Protected accounts (built-ins the app references by role) can't be
  // deactivated. Renames are blocked elsewhere; here we just guard the toggle.
  if (!active && existing.is_system && existing.system_role) {
    return { error: "This built-in account is required by the platform and can't be deactivated." };
  }

  const { error } = await supabase
    .from("chart_of_accounts")
    .update({ archived_at: active ? null : new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: "Failed to update account." };

  revalidatePath("/chart-of-accounts");
  return {};
}
