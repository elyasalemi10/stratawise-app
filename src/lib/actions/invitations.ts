"use server";

import { requireCompanyRole, getCurrentProfile } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";
import { sendInvitationEmail } from "@/lib/email";
import { resolveCompanyLogo } from "@/lib/notifications";
import { canonicaliseSender } from "@/lib/reconciliation/canonical";
import { sweepMappingsForOwnerChange } from "@/lib/reconciliation/mappings";
import { buildSubdivisionUrl } from "@/lib/subdivision-resolver";
import { generateInviteCode, normaliseInviteCode } from "@/lib/invite-code";
import { rateLimitCheck, getClientIp } from "@/lib/rate-limit";
import { headers } from "next/headers";

export async function inviteStrataManager(data: { email: string; name: string }) {
  const profile = await requireCompanyRole();

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
      code: generateInviteCode(),
    })
    .select("id, code")
    .single();

  if (error) return { error: error.message };

  await supabase.from("audit_log").insert({
    profile_id: profile.id,
    action: "create",
    entity_type: "invitation",
    entity_id: invitation.id,
    after_state: { email: data.email, name: data.name, role: "strata_manager" },
  });

  // Send invitation email
  const baseUrl = process.env.APP_URL ?? "http://localhost:3000";
  const inviteUrl = `${baseUrl}/invite/${invitation.code}`;
  const companyLogoUrl = await resolveCompanyLogo(supabase, {
    managementCompanyId: profile.management_company_id,
  });
  await sendInvitationEmail({
    to: data.email,
    inviteeName: data.name,
    role: "strata_manager",
    subdivisionName: "Your management company",
    subdivisionAddress: "",
    inviteUrl,
    companyLogoUrl,
  });

  return { success: true, code: invitation.code };
}

/**
 * Look up an invitation by its 10-char code. Rate-limited by client IP to
 * defuse brute-force enumeration: max 10 lookups per IP per 10 minutes.
 *
 * Returns null when the code is unknown OR the IP is rate-limited — we
 * deliberately don't distinguish the two so an attacker can't tell whether
 * a code shape is valid by watching response codes.
 */
export async function getInvitationByCode(rawCode: string) {
  const code = normaliseInviteCode(rawCode);
  if (!code) return null;

  const h = await headers();
  const ip = getClientIp(h);
  const rl = await rateLimitCheck({
    key: `invite_lookup:${ip}`,
    limit: 10,
    windowMs: 10 * 60 * 1000,
  });
  if (!rl.ok) return null;

  const supabase = createServerClient();

  const { data: invitation } = await supabase
    .from("invitations")
    .select(`
      *,
      subdivisions:subdivision_id (id, name, address, plan_number),
      lots:lot_id (lot_number, unit_number)
    `)
    .eq("code", code)
    .single();

  if (!invitation) return null;

  return {
    ...invitation,
    subdivision: invitation.subdivisions,
    lot: invitation.lots,
    isExpired: new Date(invitation.expires_at) < new Date(),
  };
}

export async function acceptInvitation(rawCode: string) {
  const code = normaliseInviteCode(rawCode);
  if (!code) return { error: "Invalid invite code" };

  const profile = await getCurrentProfile();
  if (!profile) return { error: "Please sign in first" };

  const supabase = createServerClient();

  // Fetch invitation
  const { data: invitation } = await supabase
    .from("invitations")
    .select("*")
    .eq("code", code)
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
      // Assign to management company. Invited managers default to
      // 'manager' company_role (can do day-to-day ops, cannot invite
      // others or modify team). An admin can promote them later.
      await supabase
        .from("profiles")
        .update({
          role: "strata_manager",
          management_company_id: sub.management_company_id,
          company_role: "manager",
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

    // PP4-B: sweep bank_payer_mappings for active mappings on OTHER lots
    // sharing this owner's canonicalised name. Only flips active→ambiguous
    // (Addition 2: never auto-promotes). Owner name resolved from the
    // profile (preferred) with the invitation's `name` field as fallback
    // for owners whose Clerk profile lacks first/last names.
    if (invitation.lot_id) {
      const fromProfile = [profile.first_name, profile.last_name]
        .filter(Boolean)
        .join(" ")
        .trim();
      const ownerNameRaw =
        fromProfile.length > 0 ? fromProfile : (invitation.name ?? "").trim();
      const ownerCanonical = canonicaliseSender(ownerNameRaw);
      if (ownerCanonical) {
        await sweepMappingsForOwnerChange(
          invitation.subdivision_id,
          invitation.lot_id,
          ownerCanonical,
          profile.id,
        );
      }
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

  // Resolve the short_code so the client can redirect to the code-shaped URL.
  const subdivisionUrl = await buildSubdivisionUrl(invitation.subdivision_id, "");

  return {
    success: true,
    subdivisionId: invitation.subdivision_id,
    subdivisionUrl: subdivisionUrl ?? "/dashboard",
    role: invitation.role,
  };
}
