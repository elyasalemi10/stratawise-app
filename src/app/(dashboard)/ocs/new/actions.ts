"use server";

import { requireCompanyRole } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";
import { insertOCWithCode } from "@/lib/oc-code";
import { buildOCUrl } from "@/lib/oc-resolver";
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
} from "@/lib/validations/oc-wizard";

// ─── Helpers ────────────────────────────────────────────────────

async function verifyOCOwnership(ocId: string, managementCompanyId: string) {
  const supabase = createServerClient();
  const { data } = await supabase
    .from("owners_corporations")
    .select("id")
    .eq("id", ocId)
    .eq("management_company_id", managementCompanyId)
    .single();
  return !!data;
}

// ─── Step 1: Create oc with general details ────────────

export async function createOCStep1(data: Step1Values) {
  try {
    const profile = await requireCompanyRole();
    if (!profile.management_company_id) {
      return { error: "No management company assigned" };
    }

    const parsed = step1Schema.safeParse(data);
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Validation failed" };
    }

    const v = parsed.data;
    const address = `${v.street_number} ${v.street_name}, ${v.suburb} ${v.state} ${v.postcode}`;

    const supabase = createServerClient();

    // Allocate a unique short_code app-side with 23505-retry on collision
    // (alphabet ABCDEFGHJKLMNPQRSTUVWXYZ23456789, 8 chars). The DB UNIQUE
    // constraint is the source of truth; the helper retries on collision.
    const insertResult = await insertOCWithCode(supabase, {
      management_company_id: profile.management_company_id,
      plan_number: v.plan_number,
      management_start_date: v.management_start_date,
      name: v.name,
      street_number: v.street_number,
      street_name: v.street_name,
      suburb: v.suburb,
      state: v.state,
      postcode: v.postcode,
      address,
      common_property_description: v.common_property_description || null,
      abn: v.abn || null,
      tfn: v.tfn || null,
      total_lots: 0,
      setup_step: 1,
      created_by: profile.id,
    });

    if (insertResult.error) {
      console.error("Step 1 error:", insertResult.error);
      return { error: "Failed to create oc" };
    }
    const oc = { id: insertResult.success!.id, short_code: insertResult.success!.short_code };

    // Add creator as oc member
    await supabase.from("oc_members").insert({
      oc_id: oc.id,
      profile_id: profile.id,
      role: "strata_manager",
      is_primary_contact: true,
    });

    // Audit log
    await supabase.from("audit_log").insert({
      profile_id: profile.id,
      oc_id: oc.id,
      action: "create",
      entity_type: "oc",
      entity_id: oc.id,
      after_state: { step: 1, name: v.name, plan_number: v.plan_number },
    });

    return { ocId: oc.id, ocCode: oc.short_code };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Unexpected error" };
  }
}

// ─── Step 1: Update existing oc general details ────────

export async function updateOCStep1(ocId: string, data: Step1Values) {
  try {
    const profile = await requireCompanyRole();
    if (!profile.management_company_id) {
      return { error: "No management company assigned" };
    }

    if (!(await verifyOCOwnership(ocId, profile.management_company_id))) {
      return { error: "Access denied" };
    }

    const parsed = step1Schema.safeParse(data);
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Validation failed" };
    }

    const v = parsed.data;
    const address = `${v.street_number} ${v.street_name}, ${v.suburb} ${v.state} ${v.postcode}`;

    const supabase = createServerClient();

    const { error } = await supabase
      .from("owners_corporations")
      .update({
        plan_number: v.plan_number,
        management_start_date: v.management_start_date,
        name: v.name,
        street_number: v.street_number,
        street_name: v.street_name,
        suburb: v.suburb,
        state: v.state,
        postcode: v.postcode,
        address,
        common_property_description: v.common_property_description || null,
        abn: v.abn || null,
        tfn: v.tfn || null,
      })
      .eq("id", ocId);

    if (error) {
      console.error("Step 1 update error:", error);
      return { error: "Failed to update oc" };
    }

    return { ocId };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Unexpected error" };
  }
}

// ─── Step 2: Update advanced settings ───────────────────────────

export async function updateOCStep2(ocId: string, data: Step2Values) {
  try {
    const profile = await requireCompanyRole();
    if (!profile.management_company_id) {
      return { error: "No management company assigned" };
    }

    if (!(await verifyOCOwnership(ocId, profile.management_company_id))) {
      return { error: "Access denied" };
    }

    const parsed = step2Schema.safeParse(data);
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Validation failed" };
    }

    const v = parsed.data;
    const supabase = createServerClient();

    const { error } = await supabase
      .from("owners_corporations")
      .update({
        financial_year_start_month: v.financial_year_start_month,
        levy_year_start_month: v.levy_year_start_month,
        levies_per_year: v.levies_per_year,
        setup_step: 2,
      })
      .eq("id", ocId);

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

export async function updateOCStep3(ocId: string, data: Step3Values) {
  try {
    const profile = await requireCompanyRole();
    if (!profile.management_company_id) {
      return { error: "No management company assigned" };
    }

    if (!(await verifyOCOwnership(ocId, profile.management_company_id))) {
      return { error: "Access denied" };
    }

    const parsed = step3Schema.safeParse(data);
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Validation failed" };
    }

    const v = parsed.data;
    const supabase = createServerClient();

    // Update oc bank connection type
    await supabase
      .from("owners_corporations")
      .update({
        bank_connection_type: v.bank_connection_type,
        bank_bsb: v.bsb,
        bank_account_number: v.account_number,
        bank_account_name: v.account_name,
        setup_step: 3,
      })
      .eq("id", ocId);

    // Upsert admin fund bank account
    const { data: existing } = await supabase
      .from("bank_accounts")
      .select("id")
      .eq("oc_id", ocId)
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
        oc_id: ocId,
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
      .eq("oc_id", ocId)
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
        oc_id: ocId,
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

export async function updateOCStep4(ocId: string, data: Step4Values) {
  try {
    const profile = await requireCompanyRole();
    if (!profile.management_company_id) {
      return { error: "No management company assigned" };
    }

    if (!(await verifyOCOwnership(ocId, profile.management_company_id))) {
      return { error: "Access denied" };
    }

    const parsed = step4Schema.safeParse(data);
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Validation failed" };
    }

    const v = parsed.data;
    const supabase = createServerClient();

    // Replace the full lot list for this oc during setup. Pending
    // invitations reference lot_id with no ON DELETE CASCADE, so we must
    // clear them before deleting lots.
    const { data: existingLots } = await supabase
      .from("lots")
      .select("id")
      .eq("oc_id", ocId);

    const existingLotIds = (existingLots ?? []).map((l) => l.id);
    if (existingLotIds.length > 0) {
      await supabase
        .from("invitations")
        .delete()
        .in("lot_id", existingLotIds)
        .eq("status", "pending");
    }

    await supabase
      .from("lots")
      .delete()
      .eq("oc_id", ocId);

    // Insert lots (no owner fields — ownership lives on oc_members).
    const lotsToInsert = v.lots.map((lot, idx) => ({
      oc_id: ocId,
      lot_number: parseInt(lot.lot_number, 10) || (idx + 1),
      unit_number: lot.unit_number || null,
      lot_entitlement: lot.lot_entitlement,
      lot_liability: lot.lot_entitlement, // Default liability = entitlement
    }));

    const { data: insertedLots, error: lotsError } = await supabase
      .from("lots")
      .insert(lotsToInsert)
      .select("id, lot_number");

    if (lotsError) {
      console.error("Step 4 lots error:", lotsError);
      return { error: "Failed to create lots" };
    }

    // Pre-create pending invitation rows for lots whose manager noted any
    // owner contact details (name OR email OR phone). No emails are sent
    // here or at the end of setup — they fire only when the manager
    // explicitly clicks "Invite" on the manage page. Until then, the row
    // is the canonical pre-acceptance owner record for the lot.
    const lotByNumber = new Map<number, string>();
    for (const l of insertedLots ?? []) lotByNumber.set(l.lot_number, l.id);

    const invitationsToInsert = v.lots
      .map((lot, idx) => {
        const email = (lot.invitee_email ?? "").trim();
        const name = lot.invitee_name?.trim() ?? "";
        const phone = lot.invitee_phone?.trim() ?? "";
        if (!email && !name && !phone) return null;
        const lotNumber = parseInt(lot.lot_number, 10) || (idx + 1);
        const lotId = lotByNumber.get(lotNumber);
        if (!lotId) return null;
        return {
          oc_id: ocId,
          lot_id: lotId,
          email: email || null,
          name: name || null,
          phone: phone || null,
          role: "lot_owner" as const,
          status: "noted" as const,
          invited_by: profile.id,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    if (invitationsToInsert.length > 0) {
      const { error: invError } = await supabase
        .from("invitations")
        .insert(invitationsToInsert);
      if (invError) {
        console.error("Step 4 invitations error:", invError);
        // Don't fail step 4 — lots are created; manager can retry invitations
        // from the manage page.
      }
    }

    // Update total_lots
    await supabase
      .from("owners_corporations")
      .update({
        total_lots: v.total_lots,
        setup_step: 4,
      })
      .eq("id", ocId);

    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Unexpected error" };
  }
}

// ─── Step 5: Opening balances + complete setup ──────────────────

export async function completeOCSetup(ocId: string, data: Step5Values) {
  try {
    const profile = await requireCompanyRole();
    if (!profile.management_company_id) {
      return { error: "No management company assigned" };
    }

    if (!(await verifyOCOwnership(ocId, profile.management_company_id))) {
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
      .eq("oc_id", ocId)
      .eq("fund_type", "administrative");

    // Update capital works fund bank account with opening balance
    await supabase
      .from("bank_accounts")
      .update({
        opening_balance: v.capital_works_opening_balance,
        opening_balance_date: v.opening_balance_date,
      })
      .eq("oc_id", ocId)
      .eq("fund_type", "capital_works");

    // Mark oc as active
    await supabase
      .from("owners_corporations")
      .update({
        setup_step: 5,
        status: "active",
      })
      .eq("id", ocId);

    // Lot-owner invitation emails are NOT dispatched at the end of setup.
    // Pending invitation rows queued in step 4 stay queued until the manager
    // explicitly clicks "Invite" on a lot from the manage page.

    // Audit log — full setup completed
    await supabase.from("audit_log").insert({
      profile_id: profile.id,
      oc_id: ocId,
      action: "create",
      entity_type: "oc",
      entity_id: ocId,
      after_state: { step: 5, status: "active" },
      metadata: {
        source: "oc_wizard_complete",
      },
    });

    // Look up the short_code so the wizard can redirect to the code-shaped
    // URL (/ocs/<short_code>) instead of the now-stale UUID URL.
    const ocUrl = (await buildOCUrl(ocId, "")) ?? "/dashboard";

    return { success: true, redirectUrl: ocUrl };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Unexpected error" };
  }
}

// ─── Get wizard data for pre-populating forms ───────────────────

export async function getOCWizardData(ocId: string) {
  try {
    const { getCurrentProfile } = await import("@/lib/auth");
    const profile = await getCurrentProfile();
    if (!profile || !profile.management_company_id) return null;

    const supabase = createServerClient();

    const { data: oc } = await supabase
      .from("owners_corporations")
      .select("*")
      .eq("id", ocId)
      .eq("management_company_id", profile.management_company_id)
      .single();

    if (!oc) return null;

    const { data: lots } = await supabase
      .from("lots")
      .select("*")
      .eq("oc_id", ocId)
      .order("lot_number");

    const { data: bankAccounts } = await supabase
      .from("bank_accounts")
      .select("*")
      .eq("oc_id", ocId);

    return {
      oc,
      lots: lots ?? [],
      bankAccounts: bankAccounts ?? [],
    };
  } catch {
    return null;
  }
}
