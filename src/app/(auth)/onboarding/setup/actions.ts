"use server";

import { auth } from "@clerk/nextjs/server";
import { createServerClient } from "@/lib/supabase";
import { companySchema, subdivisionSchema, inviteRowSchema } from "@/lib/validations/onboarding-setup";

async function getProfileId(clerkUserId: string) {
  const supabase = createServerClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, management_company_id")
    .eq("clerk_id", clerkUserId)
    .single();
  return data;
}

export async function createCompany(formData: {
  name: string;
  abn?: string;
  address: string;
  phone: string;
  email: string;
  logo_url?: string;
}) {
  const { userId } = await auth();
  if (!userId) throw new Error("Not authenticated");

  const parsed = companySchema.safeParse(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid data" };
  }

  const supabase = createServerClient();

  // Create the management company
  const { data: company, error: companyError } = await supabase
    .from("management_companies")
    .insert({
      name: parsed.data.name,
      abn: parsed.data.abn || null,
      address: parsed.data.address,
      phone: formData.phone,
      email: formData.email,
      logo_url: formData.logo_url || null,
    })
    .select("id")
    .single();

  if (companyError || !company) {
    console.error("Failed to create company:", companyError);
    return { error: "Failed to create company. Please try again." };
  }

  // Assign user to this company as strata_manager
  const { error: profileError } = await supabase
    .from("profiles")
    .update({
      management_company_id: company.id,
      role: "strata_manager",
    })
    .eq("clerk_id", userId);

  if (profileError) {
    console.error("Failed to assign company:", profileError);
    return { error: "Failed to assign company. Please try again." };
  }

  return { companyId: company.id };
}

export async function createSubdivision(formData: {
  plan_number: string;
  name: string;
  address: string;
  total_lots: number;
  state: string;
}) {
  const { userId } = await auth();
  if (!userId) throw new Error("Not authenticated");

  if (!formData.plan_number || !formData.name || !formData.address || formData.total_lots < 2) {
    return { error: "All fields are required. Minimum 2 lots." };
  }

  const profile = await getProfileId(userId);
  if (!profile?.management_company_id) {
    return { error: "No management company found. Please complete Step 1 first." };
  }

  const supabase = createServerClient();

  // Create subdivision
  const { data: subdivision, error: subError } = await supabase
    .from("subdivisions")
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

  if (subError || !subdivision) {
    console.error("Failed to create subdivision:", subError);
    return { error: "Failed to create subdivision. Please try again." };
  }

  // Create lots
  const lots = Array.from({ length: formData.total_lots }, (_, i) => ({
    subdivision_id: subdivision.id,
    lot_number: i + 1,
    lot_entitlement: 0,
    lot_liability: 0,
  }));

  const { error: lotsError } = await supabase.from("lots").insert(lots);

  if (lotsError) {
    console.error("Failed to create lots:", lotsError);
    return { error: "Subdivision created but failed to create lots." };
  }

  // Add creator as subdivision member
  const { error: memberError } = await supabase
    .from("subdivision_members")
    .insert({
      subdivision_id: subdivision.id,
      profile_id: profile.id,
      role: "strata_manager",
      is_primary_contact: true,
    });

  if (memberError) {
    console.error("Failed to add member:", memberError);
  }

  return { subdivisionId: subdivision.id };
}

export async function sendInvitations(invites: { email: string; name: string }[]) {
  const { userId } = await auth();
  if (!userId) throw new Error("Not authenticated");

  const profile = await getProfileId(userId);
  if (!profile?.management_company_id) {
    return { error: "No management company found." };
  }

  const supabase = createServerClient();

  // Get the first subdivision for this company
  const { data: subdivision } = await supabase
    .from("subdivisions")
    .select("id")
    .eq("management_company_id", profile.management_company_id)
    .limit(1)
    .single();

  if (!subdivision) {
    return { error: "No subdivision found. Please complete Step 2 first." };
  }

  const validInvites = invites.filter((inv) => {
    const parsed = inviteRowSchema.safeParse(inv);
    return parsed.success;
  });

  if (validInvites.length === 0) {
    return { error: "No valid invitations to send." };
  }

  const invitationRows = validInvites.map((inv) => ({
    subdivision_id: subdivision.id,
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
  const { userId } = await auth();
  if (!userId) return { state: "no-auth" as const };

  const supabase = createServerClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, management_company_id")
    .eq("clerk_id", userId)
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

  // Check if they have any subdivisions
  const { data: subdivisions } = await supabase
    .from("subdivisions")
    .select("id")
    .eq("management_company_id", profile.management_company_id)
    .limit(1);

  if (!subdivisions || subdivisions.length === 0) {
    return { state: "needs-subdivision" as const };
  }

  return { state: "complete" as const };
}

export async function getSetupSummary() {
  const { userId } = await auth();
  if (!userId) return null;

  const supabase = createServerClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("management_company_id")
    .eq("clerk_id", userId)
    .single();

  if (!profile?.management_company_id) return null;

  const { data: company } = await supabase
    .from("management_companies")
    .select("name")
    .eq("id", profile.management_company_id)
    .single();

  const { data: subdivision } = await supabase
    .from("subdivisions")
    .select("name, total_lots")
    .eq("management_company_id", profile.management_company_id)
    .limit(1)
    .single();

  return {
    companyName: company?.name ?? "",
    subdivisionName: subdivision?.name ?? "",
    totalLots: subdivision?.total_lots ?? 0,
  };
}
