"use server";

import { requireRole, getCurrentProfile } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";

export async function inviteStrataManager(data: { email: string; name: string }) {
  const profile = await requireRole(["strata_manager", "super_admin"]);

  if (!profile.management_company_id) {
    return { error: "No management company found" };
  }

  const supabase = createServerClient();

  // Check for existing pending invitation
  const { data: existing } = await supabase
    .from("invitations")
    .select("id")
    .eq("email", data.email)
    .eq("role", "strata_manager")
    .eq("status", "pending")
    .single();

  if (existing) {
    return { error: "A pending invitation already exists for this email" };
  }

  // Need a subdivision_id for the FK — use any active subdivision from the company
  const { data: anySub } = await supabase
    .from("subdivisions")
    .select("id")
    .eq("management_company_id", profile.management_company_id)
    .eq("status", "active")
    .limit(1)
    .single();

  if (!anySub) {
    return { error: "Create at least one subdivision before inviting team members" };
  }

  const { data: invitation, error } = await supabase
    .from("invitations")
    .insert({
      subdivision_id: anySub.id,
      email: data.email,
      name: data.name,
      role: "strata_manager",
      invited_by: profile.id,
    })
    .select("id, token")
    .single();

  if (error) return { error: error.message };

  await supabase.from("audit_log").insert({
    profile_id: profile.id,
    action: "create",
    entity_type: "invitation",
    entity_id: invitation.id,
    after_state: { email: data.email, name: data.name, role: "strata_manager" },
  });

  return { success: true, token: invitation.token };
}

export async function getInvitationByToken(token: string) {
  const supabase = createServerClient();

  const { data: invitation } = await supabase
    .from("invitations")
    .select(`
      *,
      subdivisions:subdivision_id (id, name, address, plan_number),
      lots:lot_id (lot_number, unit_number)
    `)
    .eq("token", token)
    .single();

  if (!invitation) return null;

  return {
    ...invitation,
    subdivision: invitation.subdivisions,
    lot: invitation.lots,
    isExpired: new Date(invitation.expires_at) < new Date(),
  };
}

export async function acceptInvitation(token: string) {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "Please sign in first" };

  const supabase = createServerClient();

  // Fetch invitation
  const { data: invitation } = await supabase
    .from("invitations")
    .select("*")
    .eq("token", token)
    .single();

  if (!invitation) return { error: "Invitation not found" };
  if (invitation.status === "accepted") return { error: "This invitation has already been accepted" };
  if (invitation.status === "revoked") return { error: "This invitation has been revoked" };
  if (new Date(invitation.expires_at) < new Date()) return { error: "This invitation has expired" };

  // Check lot isn't already claimed (for lot_owner invitations)
  if (invitation.lot_id) {
    const { data: existingMember } = await supabase
      .from("subdivision_members")
      .select("id")
      .eq("lot_id", invitation.lot_id)
      .eq("role", "lot_owner")
      .is("left_at", null)
      .single();

    if (existingMember) {
      return { error: "This lot has already been claimed by another owner" };
    }
  }

  // Update invitation status
  await supabase
    .from("invitations")
    .update({ status: "accepted" })
    .eq("id", invitation.id);

  if (invitation.role === "strata_manager") {
    // Get the management company from the subdivision
    const { data: sub } = await supabase
      .from("subdivisions")
      .select("management_company_id")
      .eq("id", invitation.subdivision_id)
      .single();

    if (sub) {
      // Assign to management company
      await supabase
        .from("profiles")
        .update({
          role: "strata_manager",
          management_company_id: sub.management_company_id,
        })
        .eq("id", profile.id);
    }
  } else {
    // Lot owner — create subdivision member
    await supabase
      .from("profiles")
      .update({ role: "lot_owner" })
      .eq("id", profile.id);

    await supabase.from("subdivision_members").insert({
      subdivision_id: invitation.subdivision_id,
      profile_id: profile.id,
      lot_id: invitation.lot_id,
      role: "lot_owner",
      is_primary_contact: true,
    });

    // Update lot with owner email if not set
    if (invitation.lot_id) {
      await supabase
        .from("lots")
        .update({ owner_email: profile.email })
        .eq("id", invitation.lot_id)
        .is("owner_email", null);
    }
  }

  // Audit
  await supabase.from("audit_log").insert({
    profile_id: profile.id,
    subdivision_id: invitation.subdivision_id,
    action: "accept",
    entity_type: "invitation",
    entity_id: invitation.id,
    after_state: { role: invitation.role, lot_id: invitation.lot_id },
  });

  return {
    success: true,
    subdivisionId: invitation.subdivision_id,
    role: invitation.role,
  };
}
