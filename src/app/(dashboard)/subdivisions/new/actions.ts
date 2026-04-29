"use server";

import { requireCompanyRole } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";
import { insertSubdivisionWithCode } from "@/lib/subdivision-code";
import { buildSubdivisionUrl } from "@/lib/subdivision-resolver";
import { sendInvitationEmail } from "@/lib/email";
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
    const profile = await requireCompanyRole();
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

    // Allocate a unique short_code app-side with 23505-retry on collision
    // (alphabet ABCDEFGHJKLMNPQRSTUVWXYZ23456789, 8 chars). The DB UNIQUE
    // constraint is the source of truth; the helper retries on collision.
    const insertResult = await insertSubdivisionWithCode(supabase, {
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
    });

    if (insertResult.error) {
      console.error("Step 1 error:", insertResult.error);
      return { error: "Failed to create subdivision" };
    }
    const subdivision = { id: insertResult.success!.id, short_code: insertResult.success!.short_code };

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

    return { subdivisionId: subdivision.id, subdivisionCode: subdivision.short_code };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Unexpected error" };
  }
}

// ─── Step 1: Update existing subdivision general details ────────

export async function updateSubdivisionStep1(subdivisionId: string, data: Step1Values) {
  try {
    const profile = await requireCompanyRole();
    if (!profile.management_company_id) {
      return { error: "No management company assigned" };
    }

    if (!(await verifySubdivisionOwnership(subdivisionId, profile.management_company_id))) {
      return { error: "Access denied" };
    }

    const parsed = step1Schema.safeParse(data);
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Validation failed" };
    }

    const v = parsed.data;
    const address = `${v.street_number} ${v.street_name}, ${v.suburb}, ${v.state}`;

    const supabase = createServerClient();

    const { error } = await supabase
      .from("subdivisions")
      .update({
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
      })
      .eq("id", subdivisionId);

    if (error) {
      console.error("Step 1 update error:", error);
      return { error: "Failed to update subdivision" };
    }

    return { subdivisionId };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Unexpected error" };
  }
}

// ─── Step 2: Update advanced settings ───────────────────────────

export async function updateSubdivisionStep2(subdivisionId: string, data: Step2Values) {
  try {
    const profile = await requireCompanyRole();
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
    const profile = await requireCompanyRole();
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
    const profile = await requireCompanyRole();
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

    // Replace the full lot list for this subdivision during setup. Pending
    // invitations reference lot_id with no ON DELETE CASCADE, so we must
    // clear them before deleting lots.
    const { data: existingLots } = await supabase
      .from("lots")
      .select("id")
      .eq("subdivision_id", subdivisionId);

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
      .eq("subdivision_id", subdivisionId);

    // Insert lots (no owner fields — ownership lives on subdivision_members).
    const lotsToInsert = v.lots.map((lot, idx) => ({
      subdivision_id: subdivisionId,
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

    // Pre-create pending invitations for lots that provided owner contact
    // details. Invitation emails are NOT sent here — they're sent when the
    // wizard completes (see completeSubdivisionSetup). Until then, the
    // subdivision is in setup mode and the pending invitations are the
    // canonical pre-acceptance identity for each lot.
    const lotByNumber = new Map<number, string>();
    for (const l of insertedLots ?? []) lotByNumber.set(l.lot_number, l.id);

    const invitationsToInsert = v.lots
      .map((lot, idx) => {
        const email = (lot.invitee_email ?? "").trim();
        if (!email) return null;
        const lotNumber = parseInt(lot.lot_number, 10) || (idx + 1);
        const lotId = lotByNumber.get(lotNumber);
        if (!lotId) return null;
        return {
          subdivision_id: subdivisionId,
          lot_id: lotId,
          email,
          name: lot.invitee_name?.trim() || null,
          phone: lot.invitee_phone?.trim() || null,
          role: "lot_owner" as const,
          status: "pending" as const,
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
    const profile = await requireCompanyRole();
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

    // Dispatch any pending lot-owner invitations that were queued during
    // step 4. Emails are only sent now — at the end of setup — so the
    // manager isn't firing invitations while they're still editing the lot
    // list. Each send failure is logged but doesn't abort completion.
    const { data: subdivisionRow } = await supabase
      .from("subdivisions")
      .select("name, address")
      .eq("id", subdivisionId)
      .single();

    const { data: pendingInvitations } = await supabase
      .from("invitations")
      .select("id, token, email, name, lot_id, lots(lot_number)")
      .eq("subdivision_id", subdivisionId)
      .eq("status", "pending")
      .eq("role", "lot_owner");

    const baseUrl = process.env.APP_URL ?? "http://localhost:3000";
    for (const inv of pendingInvitations ?? []) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const lot = (inv as any).lots;
        await sendInvitationEmail({
          to: inv.email,
          inviteeName: inv.name ?? "",
          role: "lot_owner",
          subdivisionName: subdivisionRow?.name ?? "Your subdivision",
          subdivisionAddress: subdivisionRow?.address ?? "",
          lotNumber: lot?.lot_number ?? null,
          inviteUrl: `${baseUrl}/invite/${inv.token}`,
        });
      } catch (err) {
        console.error("Failed to send wizard invitation:", inv.email, err);
      }
    }

    // Audit log — full setup completed
    await supabase.from("audit_log").insert({
      profile_id: profile.id,
      subdivision_id: subdivisionId,
      action: "create",
      entity_type: "subdivision",
      entity_id: subdivisionId,
      after_state: { step: 5, status: "active" },
      metadata: {
        source: "subdivision_wizard_complete",
        invitations_sent: pendingInvitations?.length ?? 0,
      },
    });

    // Look up the short_code so the wizard can redirect to the code-shaped
    // URL (/subdivisions/<short_code>) instead of the now-stale UUID URL.
    const subdivisionUrl = (await buildSubdivisionUrl(subdivisionId, "")) ?? "/dashboard";

    return { success: true, redirectUrl: subdivisionUrl };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Unexpected error" };
  }
}

// ─── Get wizard data for pre-populating forms ───────────────────

export async function getSubdivisionWizardData(subdivisionId: string) {
  try {
    const { getCurrentProfile } = await import("@/lib/auth");
    const profile = await getCurrentProfile();
    if (!profile || !profile.management_company_id) return null;

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
