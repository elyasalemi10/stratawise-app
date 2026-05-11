"use server";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { createServerClient } from "@/lib/supabase";
import { getCurrentProfile } from "@/lib/auth";
import { profileSchema } from "@/lib/validations/settings";
import { uploadObject } from "@/lib/storage/r2";

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

// ─── Company settings ──────────────────────────────────────

export async function getCompanyData() {
  const profile = await getCurrentProfile();
  if (!profile?.management_company_id) return null;

  const supabase = createServerClient();
  const { data } = await supabase
    .from("management_companies")
    .select("id, name, abn, address, phone, email, logo_url, registered_name, signature_url")
    .eq("id", profile.management_company_id)
    .single();

  return data;
}

export async function updateCompanyField(companyId: string, field: string, value: string | null) {
  const profile = await getCurrentProfile();
  if (!profile?.management_company_id || profile.management_company_id !== companyId) {
    return { error: "Unauthorized" };
  }

  const allowedFields = ["name", "abn", "address", "phone", "email", "registered_name"];
  if (!allowedFields.includes(field)) {
    return { error: "Invalid field" };
  }

  const supabase = createServerClient();
  const { error } = await supabase
    .from("management_companies")
    .update({ [field]: value })
    .eq("id", companyId);

  if (error) return { error: error.message };
  return { success: true };
}

// PP7-A: signature upload kept here; logo upload moved to
// src/lib/actions/company-branding.ts with hardened validation (1MB cap,
// 800×400 dimensions, PNG/JPG/SVG types). The UI calls the new action for
// logo and this one for signature.
export async function uploadCompanySignature(formData: FormData): Promise<{ url?: string; error?: string }> {
  const profile = await getCurrentProfile();
  if (!profile?.management_company_id) return { error: "Unauthorized" };

  const file = formData.get("file") as File | null;
  const companyId = formData.get("company_id") as string | null;

  if (!file || !companyId || companyId !== profile.management_company_id) {
    return { error: "Invalid request" };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = file.type === "image/png" ? "png" : "jpg";
  const key = `logos/${companyId}/signature.${ext}`;

  const { publicUrl } = await uploadObject(key, buffer, file.type);

  const supabase = createServerClient();
  await supabase
    .from("management_companies")
    .update({ signature_url: publicUrl })
    .eq("id", companyId);

  return { url: publicUrl };
}
