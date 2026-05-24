"use server";

import { getCurrentProfile } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";
import { revalidatePath } from "next/cache";

export interface TeamMember {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  company_role: "admin" | "manager" | "viewer" | null;
  created_at: string;
}

export async function getTeamMembers(): Promise<TeamMember[]> {
  const profile = await getCurrentProfile();
  if (!profile?.management_company_id) return [];

  const supabase = createServerClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, email, first_name, last_name, avatar_url, company_role, created_at")
    .eq("management_company_id", profile.management_company_id)
    .in("role", ["strata_manager", "super_admin"])
    .eq("status", "active")
    .order("created_at");

  return data ?? [];
}

export async function updateMemberRole(
  memberId: string,
  newRole: "admin" | "manager" | "viewer"
) {
  const profile = await getCurrentProfile();
  if (!profile?.management_company_id) return { error: "Unauthorized" };
  if (profile.company_role !== "admin") return { error: "Only admins can change roles" };
  if (memberId === profile.id) return { error: "You cannot change your own role" };

  const supabase = createServerClient();

  // Verify target is in same company
  const { data: target } = await supabase
    .from("profiles")
    .select("id, management_company_id")
    .eq("id", memberId)
    .single();

  if (!target || target.management_company_id !== profile.management_company_id) {
    return { error: "Member not found" };
  }

  const { error } = await supabase
    .from("profiles")
    .update({ company_role: newRole })
    .eq("id", memberId);

  if (error) return { error: error.message };

  await supabase.from("audit_log").insert({
    profile_id: profile.id,
    action: "update",
    entity_type: "profile",
    entity_id: memberId,
    after_state: { company_role: newRole },
  });

  revalidatePath("/settings");
  revalidatePath("/dashboard");

  return { success: true };
}

export async function removeMember(memberId: string) {
  const profile = await getCurrentProfile();
  if (!profile?.management_company_id) return { error: "Unauthorized" };
  if (profile.company_role !== "admin") return { error: "Only admins can remove members" };
  if (memberId === profile.id) return { error: "You cannot remove yourself" };

  const supabase = createServerClient();

  // Verify target is in same company
  const { data: target } = await supabase
    .from("profiles")
    .select("id, management_company_id")
    .eq("id", memberId)
    .single();

  if (!target || target.management_company_id !== profile.management_company_id) {
    return { error: "Member not found" };
  }

  // Remove from company (don't delete profile , just unlink)
  const { error } = await supabase
    .from("profiles")
    .update({ management_company_id: null, company_role: null, role: "lot_owner" })
    .eq("id", memberId);

  if (error) return { error: error.message };

  await supabase.from("audit_log").insert({
    profile_id: profile.id,
    action: "remove",
    entity_type: "profile",
    entity_id: memberId,
  });

  revalidatePath("/settings");
  revalidatePath("/dashboard");

  return { success: true };
}
