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
    .select("id, code, name, account_type, gst_treatment, system_role, is_system, is_fundamental, archived_at")
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
    .select("id, code, name, account_type, gst_treatment, system_role, is_system, is_fundamental, archived_at")
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

  // Only TRULY FUNDAMENTAL accounts (small set wired into platform code paths
  // by role , trust bank, levy debtors, GST in/out, fund balances, levy
  // income lines) are locked from edits. Everything else, including most
  // seeded suggestions, can be freely renamed / re-typed / re-GST'd.
  const { data: existing, error: fetchErr } = await supabase
    .from("chart_of_accounts")
    .select("id, is_fundamental, code")
    .eq("id", input.id)
    .eq("management_company_id", companyId)
    .maybeSingle();
  if (fetchErr || !existing) return { error: "Account not found." };

  if (existing.is_fundamental) {
    return { error: "This account is required by the platform and can't be edited." };
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
    .select("id, code, name, account_type, gst_treatment, system_role, is_system, is_fundamental, archived_at")
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
    .select("id, is_fundamental")
    .eq("id", id)
    .eq("management_company_id", companyId)
    .maybeSingle();
  if (fetchErr || !existing) return { error: "Account not found." };

  if (!active && existing.is_fundamental) {
    return { error: "This account is required by the platform and can't be deactivated." };
  }

  const { error } = await supabase
    .from("chart_of_accounts")
    .update({ archived_at: active ? null : new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: "Failed to update account." };

  revalidatePath("/chart-of-accounts");
  return {};
}
