"use server";

import { createServerClient } from "@/lib/supabase";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requireRole, getAuthUserId } from "@/lib/auth";

// Update the super-admin's own name + avatar.
export async function updateAdminProfile(input: {
  firstName: string;
  lastName: string;
}): Promise<{ success?: true; error?: string }> {
  await requireRole(["super_admin"]);
  const userId = await getAuthUserId();
  if (!userId) return { error: "Not authenticated" };

  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  if (!firstName) return { error: "First name is required." };

  const supabase = createServerClient();
  const { error } = await supabase
    .from("profiles")
    .update({ first_name: firstName, last_name: lastName || null })
    .eq("auth_user_id", userId);

  if (error) {
    console.error("Failed to update admin profile:", error);
    return { error: "Something went wrong. Please try again." };
  }
  return { success: true };
}

export async function updateAdminAvatar(
  avatarUrl: string,
): Promise<{ success?: true; error?: string }> {
  await requireRole(["super_admin"]);
  const userId = await getAuthUserId();
  if (!userId) return { error: "Not authenticated" };

  const supabase = createServerClient();
  const { error } = await supabase
    .from("profiles")
    .update({ avatar_url: avatarUrl || null })
    .eq("auth_user_id", userId);

  if (error) {
    console.error("Failed to update admin avatar:", error);
    return { error: "Something went wrong. Please try again." };
  }
  return { success: true };
}

export async function changeAdminPassword(
  currentPassword: string,
  newPassword: string,
): Promise<{ success?: true; error?: string }> {
  await requireRole(["super_admin"]);

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return { error: "Not authenticated" };

  // Verify the current password by re-authenticating (Supabase exposes no
  // dedicated verify call); this doesn't disturb the existing session.
  const { error: verifyError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  });
  if (verifyError) return { error: "Current password is incorrect." };

  const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
  if (updateError) {
    return { error: "Couldn't change your password. Please try again." };
  }
  return { success: true };
}
