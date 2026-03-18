"use server";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { createServerClient } from "@/lib/supabase";
import { profileSchema } from "@/lib/validations/settings";

export async function updateProfile(formData: {
  phone?: string;
  postal_address?: string;
}) {
  const { userId } = await auth();
  if (!userId) throw new Error("Not authenticated");

  const parsed = profileSchema.safeParse(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid data" };
  }

  const supabase = createServerClient();

  const { error } = await supabase
    .from("profiles")
    .update({
      phone: parsed.data.phone || null,
      postal_address: parsed.data.postal_address || null,
    })
    .eq("clerk_id", userId);

  if (error) {
    console.error("Failed to update profile:", error);
    return { error: "Failed to update profile. Please try again." };
  }

  return { success: true };
}

export async function updateAvatar(avatarUrl: string) {
  const { userId } = await auth();
  if (!userId) throw new Error("Not authenticated");

  const supabase = createServerClient();

  const { error } = await supabase
    .from("profiles")
    .update({ avatar_url: avatarUrl || null })
    .eq("clerk_id", userId);

  if (error) {
    console.error("Failed to update avatar:", error);
    return { error: "Failed to update avatar." };
  }

  return { success: true };
}

export async function changePassword(currentPassword: string, newPassword: string) {
  const { userId } = await auth();
  if (!userId) throw new Error("Not authenticated");

  try {
    const client = await clerkClient();
    await client.users.verifyPassword({ userId, password: currentPassword });
    await client.users.updateUser(userId, { password: newPassword });
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to change password";
    if (message.includes("password")) {
      return { error: "Current password is incorrect." };
    }
    return { error: "Failed to change password. Please try again." };
  }
}
