"use server";

import { getAuthUserId } from "@/lib/auth";import { headers } from "next/headers";
import { createServerClient } from "@/lib/supabase";
import { ensureProfile } from "@/lib/auth";
import { companySchema, inviteRowSchema } from "@/lib/validations/onboarding-setup";

async function getProfileId(authUserId: string) {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, management_company_id")
    .eq("auth_user_id", authUserId)
    .single();
  if (error && error.code !== "PGRST116") {
    // PGRST116 = "no rows returned" (expected if profile doesn't exist yet)
    console.error("Database error fetching profile:", error.message);
  }
  return data;
}

export async function createCompany(formData: {
  name: string;
  trading_as?: string;
  abn?: string;
  address?: string;
  phone: string;
  email: string;
  logo_url?: string;
  brand_color?: string;
}) {
  const userId = await getAuthUserId();
  if (!userId) throw new Error("Not authenticated");

  const parsed = companySchema.safeParse(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid data" };
  }

  const supabase = createServerClient();

  // Ensure profile exists (created during onboarding page load)
  await ensureProfile();
  const profile = await getProfileId(userId);
  if (!profile) {
    return { error: "Unable to connect to the database. Please check your connection and try again." };
  }

  // Record T&Cs consent
  const headersList = await headers();
  const ipAddress =
    headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    headersList.get("x-real-ip") ??
    "unknown";
  const now = new Date().toISOString();

  await supabase.from("user_consents").insert([
    {
      profile_id: profile.id,
      consent_type: "terms_of_service",
      version: "1.0",
      accepted_at: now,
      ip_address: ipAddress,
    },
    {
      profile_id: profile.id,
      consent_type: "privacy_policy",
      version: "1.0",
      accepted_at: now,
      ip_address: ipAddress,
    },
  ]);

  // Create the management company
  const { data: company, error: companyError } = await supabase
    .from("management_companies")
    .insert({
      name: parsed.data.name,
      trading_as: parsed.data.trading_as || null,
      abn: parsed.data.abn || null,
      address: parsed.data.address || null,
      phone: formData.phone,
      email: formData.email,
      logo_url: formData.logo_url || null,
      brand_color: formData.brand_color || null,
    })
    .select("id")
    .single();

  if (companyError || !company) {
    console.error("Failed to create company:", companyError);
    return { error: "Failed to create company. Please try again." };
  }

  // Assign user to this company as strata_manager + save avatar.
  // First user onboarding their company becomes the admin.
  const { error: profileError } = await supabase
    .from("profiles")
    .update({
      management_company_id: company.id,
      role: "strata_manager",
      company_role: "admin",
    })
    .eq("auth_user_id", userId);

  if (profileError) {
    console.error("Failed to assign company:", profileError);
    return { error: "Failed to assign company. Please try again." };
  }

  return { companyId: company.id };
}

export async function createOC(formData: {
  plan_number: string;
  name: string;
  address: string;
  total_lots: number;
  state: string;
}) {
  const userId = await getAuthUserId();
  if (!userId) throw new Error("Not authenticated");

  if (!formData.plan_number || !formData.name || !formData.address || formData.total_lots < 2) {
    return { error: "All fields are required. Minimum 2 lots." };
  }

  const profile = await getProfileId(userId);
  if (!profile?.management_company_id) {
    return { error: "No management company found. Please complete Step 1 first." };
  }

  const supabase = createServerClient();

  // Create OC
  const { data: oc, error: subError } = await supabase
    .from("owners_corporations")
    .insert({
      management_company_id: profile.management_company_id,
      name: formData.name,
      plan_number: formData.plan_number,
      address: formData.address,
      total_lots: formData.total_lots,
      state: formData.state,
      created_by: profile.id,
    })
    .select("id")
    .single();

  if (subError || !oc) {
    console.error("Failed to create OC:", subError);
    return { error: "Failed to create OC. Please try again." };
  }

  // Create lots
  const lots = Array.from({ length: formData.total_lots }, (_, i) => ({
    oc_id: oc.id,
    lot_number: i + 1,
    lot_entitlement: 0,
    lot_liability: 0,
  }));

  const { error: lotsError } = await supabase.from("lots").insert(lots);

  if (lotsError) {
    console.error("Failed to create lots:", lotsError);
    return { error: "OC created but failed to create lots." };
  }

  // Add creator as oc member
  const { error: memberError } = await supabase
    .from("oc_members")
    .insert({
      oc_id: oc.id,
      profile_id: profile.id,
      role: "strata_manager",
      is_primary_contact: true,
    });

  if (memberError) {
    console.error("Failed to add member:", memberError);
  }

  return { ocId: oc.id };
}

export async function sendInvitations(invites: { email: string; name: string }[]) {
  const userId = await getAuthUserId();
  if (!userId) throw new Error("Not authenticated");

  const profile = await getProfileId(userId);
  if (!profile?.management_company_id) {
    return { error: "No management company found." };
  }

  const supabase = createServerClient();

  // Get the first OC for this company
  const { data: oc } = await supabase
    .from("owners_corporations")
    .select("id")
    .eq("management_company_id", profile.management_company_id)
    .limit(1)
    .single();

  if (!oc) {
    return { error: "No OC found. Please complete Step 2 first." };
  }

  const validInvites = invites.filter((inv) => {
    const parsed = inviteRowSchema.safeParse(inv);
    return parsed.success;
  });

  if (validInvites.length === 0) {
    return { error: "No valid invitations to send." };
  }

  const invitationRows = validInvites.map((inv) => ({
    oc_id: oc.id,
    email: inv.email,
    name: inv.name,
    role: "strata_manager" as const,
    invited_by: profile.id,
  }));

  const { error } = await supabase.from("invitations").insert(invitationRows);

  if (error) {
    console.error("Failed to create invitations:", error);
    return { error: "Failed to send invitations. Please try again." };
  }

  return { sent: validInvites.length };
}

export async function getOnboardingState() {
  const userId = await getAuthUserId();
  if (!userId) return { state: "no-auth" as const };

  const supabase = createServerClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, management_company_id")
    .eq("auth_user_id", userId)
    .single();

  if (!profile) return { state: "no-profile" as const };

  // Check for pending invitations
  const { data: invitations } = await supabase
    .from("invitations")
    .select("id, token")
    .eq("email", userId) // Will be matched by email in practice
    .eq("status", "pending")
    .limit(1);

  if (invitations && invitations.length > 0) {
    return { state: "has-invitation" as const, token: invitations[0].token };
  }

  if (!profile.management_company_id) {
    return { state: "needs-setup" as const };
  }

  // Check if they have any ocs
  const { data: ocs } = await supabase
    .from("owners_corporations")
    .select("id")
    .eq("management_company_id", profile.management_company_id)
    .limit(1);

  if (!ocs || ocs.length === 0) {
    return { state: "needs-oc" as const };
  }

  return { state: "complete" as const };
}

export async function getSetupSummary() {
  const userId = await getAuthUserId();
  if (!userId) return null;

  const supabase = createServerClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("management_company_id")
    .eq("auth_user_id", userId)
    .single();

  if (!profile?.management_company_id) return null;

  const { data: company } = await supabase
    .from("management_companies")
    .select("name")
    .eq("id", profile.management_company_id)
    .single();

  const { data: oc } = await supabase
    .from("owners_corporations")
    .select("name, total_lots")
    .eq("management_company_id", profile.management_company_id)
    .limit(1)
    .single();

  return {
    companyName: company?.name ?? "",
    ocName: oc?.name ?? "",
    totalLots: oc?.total_lots ?? 0,
  };
}

// Step 2 of onboarding — save the operating account on the manager's
// management_companies row. Validation already happened client-side.
export async function saveOperatingAccount(formData: {
  account_name: string;
  bsb: string;
  account_number: string;
  bank_name?: string;
}): Promise<{ success: true } | { error: string }> {
  const userId = await getAuthUserId();
  if (!userId) return { error: "Not authenticated" };

  const supabase = createServerClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, management_company_id")
    .eq("auth_user_id", userId)
    .single();

  if (!profile?.management_company_id) {
    return { error: "Complete step 1 first." };
  }

  const { error } = await supabase
    .from("management_companies")
    .update({
      operating_account_name: formData.account_name,
      operating_bsb: formData.bsb,
      operating_account_number: formData.account_number,
      operating_bank_name: formData.bank_name ?? null,
    })
    .eq("id", profile.management_company_id);

  if (error) {
    console.error("Failed to save operating account:", error);
    return { error: "Failed to save operating account. Please try again." };
  }

  return { success: true };
}
