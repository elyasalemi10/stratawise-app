"use server";

import { requireRole } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";
import {
  step1Schema,
  step2Schema,
  step3Schema,
  step4Schema,
  step5Schema,
  type Step1Values,
  type Step2Values,
  type Step3Values,
  type Step4Values,
  type Step5Values,
} from "@/lib/validations/subdivision-wizard";

// ─── Helpers ────────────────────────────────────────────────────

async function verifySubdivisionOwnership(subdivisionId: string, managementCompanyId: string) {
  const supabase = createServerClient();
  const { data } = await supabase
    .from("subdivisions")
    .select("id")
    .eq("id", subdivisionId)
    .eq("management_company_id", managementCompanyId)
    .single();
  return !!data;
}

// ─── Step 1: Create subdivision with general details ────────────

export async function createSubdivisionStep1(data: Step1Values) {
  try {
    const profile = await requireRole(["strata_manager", "super_admin"]);
    if (!profile.management_company_id) {
      return { error: "No management company assigned" };
    }

    const parsed = step1Schema.safeParse(data);
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Validation failed" };
    }

    const v = parsed.data;
    const address = `${v.street_number} ${v.street_name}, ${v.suburb}, ${v.state}`;

    const supabase = createServerClient();

    const { data: subdivision, error } = await supabase
      .from("subdivisions")
      .insert({
        management_company_id: profile.management_company_id,
        subdivision_type: v.subdivision_type,
        plan_number: v.plan_number,
        management_start_date: v.management_start_date,
        name: v.name,
        street_number: v.street_number,
        street_name: v.street_name,
        suburb: v.suburb,
        state: v.state,
        address,
        common_property_description: v.common_property_description || null,
        abn: v.abn || null,
        tfn: v.tfn || null,
        total_lots: 0,
        setup_step: 1,
        created_by: profile.id,
      })
      .select("id")
      .single();

    if (error) {
      console.error("Step 1 error:", error);
      return { error: "Failed to create subdivision" };
    }

    // Add creator as subdivision member
    await supabase.from("subdivision_members").insert({
      subdivision_id: subdivision.id,
      profile_id: profile.id,
      role: "strata_manager",
      is_primary_contact: true,
    });

    // Audit log
    await supabase.from("audit_log").insert({
      profile_id: profile.id,
      subdivision_id: subdivision.id,
      action: "create",
      entity_type: "subdivision",
      entity_id: subdivision.id,
      after_state: { step: 1, name: v.name, plan_number: v.plan_number },
    });

    return { subdivisionId: subdivision.id };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Unexpected error" };
  }
}

// ─── Step 2: Update advanced settings ───────────────────────────

export async function updateSubdivisionStep2(subdivisionId: string, data: Step2Values) {
  try {
    const profile = await requireRole(["strata_manager", "super_admin"]);
    if (!profile.management_company_id) {
      return { error: "No management company assigned" };
    }

    if (!(await verifySubdivisionOwnership(subdivisionId, profile.management_company_id))) {
      return { error: "Access denied" };
    }

    const parsed = step2Schema.safeParse(data);
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Validation failed" };
    }

    const v = parsed.data;
    const supabase = createServerClient();

    const { error } = await supabase
      .from("subdivisions")
      .update({
        financial_year_start_month: v.financial_year_start_month,
        levy_year_start_month: v.levy_year_start_month,
        levies_per_year: v.levies_per_year,
        setup_step: 2,
      })
      .eq("id", subdivisionId);

    if (error) {
      console.error("Step 2 error:", error);
      return { error: "Failed to update settings" };
    }

    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Unexpected error" };
  }
}

// ─── Step 3: Banking details ────────────────────────────────────

export async function updateSubdivisionStep3(subdivisionId: string, data: Step3Values) {
  try {
    const profile = await requireRole(["strata_manager", "super_admin"]);
    if (!profile.management_company_id) {
      return { error: "No management company assigned" };
    }

    if (!(await verifySubdivisionOwnership(subdivisionId, profile.management_company_id))) {
      return { error: "Access denied" };
    }

    const parsed = step3Schema.safeParse(data);
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Validation failed" };
    }

    const v = parsed.data;
    const supabase = createServerClient();

    // Update subdivision bank connection type
    await supabase
      .from("subdivisions")
      .update({
        bank_connection_type: v.bank_connection_type,
        bank_bsb: v.bsb,
        bank_account_number: v.account_number,
        bank_account_name: v.account_name,
        setup_step: 3,
      })
      .eq("id", subdivisionId);

    // Upsert admin fund bank account
    const { data: existing } = await supabase
      .from("bank_accounts")
      .select("id")
      .eq("subdivision_id", subdivisionId)
      .eq("fund_type", "administrative")
      .single();

    if (existing) {
      await supabase
        .from("bank_accounts")
        .update({
          bank_name: v.bank_name,
          account_name: v.account_name,
          bsb: v.bsb,
          account_number: v.account_number,
        })
        .eq("id", existing.id);
    } else {
      await supabase.from("bank_accounts").insert({
        subdivision_id: subdivisionId,
        fund_type: "administrative",
        bank_name: v.bank_name,
        account_name: v.account_name,
        bsb: v.bsb,
        account_number: v.account_number,
      });
    }

    // Upsert capital works fund bank account (same bank details)
    const { data: existingCw } = await supabase
      .from("bank_accounts")
      .select("id")
      .eq("subdivision_id", subdivisionId)
      .eq("fund_type", "capital_works")
      .single();

    if (existingCw) {
      await supabase
        .from("bank_accounts")
        .update({
          bank_name: v.bank_name,
          account_name: v.account_name,
          bsb: v.bsb,
          account_number: v.account_number,
        })
        .eq("id", existingCw.id);
    } else {
      await supabase.from("bank_accounts").insert({
        subdivision_id: subdivisionId,
        fund_type: "capital_works",
        bank_name: v.bank_name,
        account_name: v.account_name,
        bsb: v.bsb,
        account_number: v.account_number,
      });
    }

    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Unexpected error" };
  }
}

// ─── Step 4: Lots and membership ────────────────────────────────

export async function updateSubdivisionStep4(subdivisionId: string, data: Step4Values) {
  try {
    const profile = await requireRole(["strata_manager", "super_admin"]);
    if (!profile.management_company_id) {
      return { error: "No management company assigned" };
    }

    if (!(await verifySubdivisionOwnership(subdivisionId, profile.management_company_id))) {
      return { error: "Access denied" };
    }

    const parsed = step4Schema.safeParse(data);
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Validation failed" };
    }

    const v = parsed.data;
    const supabase = createServerClient();

    // Delete existing lots (safe during setup, no downstream refs yet)
    await supabase
      .from("lots")
      .delete()
      .eq("subdivision_id", subdivisionId);

    // Insert new lots
    const lotsToInsert = v.lots.map((lot) => ({
      subdivision_id: subdivisionId,
      lot_number: lot.lot_number,
      unit_number: lot.unit_number || null,
      owner_type: lot.owner_type,
      owner_name: lot.owner_name || null,
      owner_email: lot.owner_email || null,
      owner_phone: lot.owner_phone || null,
      lot_entitlement: lot.lot_entitlement,
      lot_liability: lot.lot_entitlement, // Default liability = entitlement
    }));

    const { error: lotsError } = await supabase
      .from("lots")
      .insert(lotsToInsert);

    if (lotsError) {
      console.error("Step 4 lots error:", lotsError);
      return { error: "Failed to create lots" };
    }

    // Update total_lots
    await supabase
      .from("subdivisions")
      .update({
        total_lots: v.total_lots,
        setup_step: 4,
      })
      .eq("id", subdivisionId);

    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Unexpected error" };
  }
}

// ─── Step 5: Opening balances + complete setup ──────────────────

export async function completeSubdivisionSetup(subdivisionId: string, data: Step5Values) {
  try {
    const profile = await requireRole(["strata_manager", "super_admin"]);
    if (!profile.management_company_id) {
      return { error: "No management company assigned" };
    }

    if (!(await verifySubdivisionOwnership(subdivisionId, profile.management_company_id))) {
      return { error: "Access denied" };
    }

    const parsed = step5Schema.safeParse(data);
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Validation failed" };
    }

    const v = parsed.data;
    const supabase = createServerClient();

    // Update admin fund bank account with opening balance
    await supabase
      .from("bank_accounts")
      .update({
        opening_balance: v.admin_opening_balance,
        opening_balance_date: v.opening_balance_date,
      })
      .eq("subdivision_id", subdivisionId)
      .eq("fund_type", "administrative");

    // Update capital works fund bank account with opening balance
    await supabase
      .from("bank_accounts")
      .update({
        opening_balance: v.capital_works_opening_balance,
        opening_balance_date: v.opening_balance_date,
      })
      .eq("subdivision_id", subdivisionId)
      .eq("fund_type", "capital_works");

    // Mark subdivision as active
    await supabase
      .from("subdivisions")
      .update({
        setup_step: 5,
        status: "active",
      })
      .eq("id", subdivisionId);

    // Audit log — full setup completed
    await supabase.from("audit_log").insert({
      profile_id: profile.id,
      subdivision_id: subdivisionId,
      action: "create",
      entity_type: "subdivision",
      entity_id: subdivisionId,
      after_state: { step: 5, status: "active" },
      metadata: { source: "subdivision_wizard_complete" },
    });

    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Unexpected error" };
  }
}

// ─── Get wizard data for pre-populating forms ───────────────────

export async function getSubdivisionWizardData(subdivisionId: string) {
  try {
    const profile = await requireRole(["strata_manager", "super_admin"]);
    if (!profile.management_company_id) return null;

    const supabase = createServerClient();

    const { data: subdivision } = await supabase
      .from("subdivisions")
      .select("*")
      .eq("id", subdivisionId)
      .eq("management_company_id", profile.management_company_id)
      .single();

    if (!subdivision) return null;

    const { data: lots } = await supabase
      .from("lots")
      .select("*")
      .eq("subdivision_id", subdivisionId)
      .order("lot_number");

    const { data: bankAccounts } = await supabase
      .from("bank_accounts")
      .select("*")
      .eq("subdivision_id", subdivisionId);

    return {
      subdivision,
      lots: lots ?? [],
      bankAccounts: bankAccounts ?? [],
    };
  } catch {
    return null;
  }
}
