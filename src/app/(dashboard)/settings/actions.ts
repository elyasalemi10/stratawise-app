"use server";

import { createServerClient } from "@/lib/supabase";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getCurrentProfile, getAuthUserId } from "@/lib/auth";
import { profileSchema } from "@/lib/validations/settings";
import { uploadObject } from "@/lib/storage/r2";

export async function updateProfile(formData: {
  phone?: string;
  postal_address?: string;
}) {
  const userId = await getAuthUserId();
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
    .eq("auth_user_id", userId);

  if (error) {
    console.error("Failed to update profile:", error);
    return { error: "Failed to update profile. Please try again." };
  }

  return { success: true };
}

export async function updateAvatar(avatarUrl: string) {
  const userId = await getAuthUserId();
  if (!userId) throw new Error("Not authenticated");

  const supabase = createServerClient();

  const { error } = await supabase
    .from("profiles")
    .update({ avatar_url: avatarUrl || null })
    .eq("auth_user_id", userId);

  if (error) {
    console.error("Failed to update avatar:", error);
    return { error: "Failed to update avatar." };
  }

  return { success: true };
}

export async function changePassword(currentPassword: string, newPassword: string) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) throw new Error("Not authenticated");

  // Verify current password by attempting re-auth. Supabase doesn't expose a
  // "verifyPassword" — signInWithPassword on the existing email is the
  // documented pattern. It returns an error on wrong password without
  // disturbing the existing session.
  const { error: verifyError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  });
  if (verifyError) {
    return { error: "Current password is incorrect." };
  }

  const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
  if (updateError) {
    return { error: updateError.message || "Failed to change password. Please try again." };
  }

  return { success: true };
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


// ─── Mail provider (Settings → Email tab) ─────────────────────────────────

interface UpdateMailProviderInput {
  provider: "stratawise" | "gmail" | "outlook";
  domain: string | null;
}

export async function updateMailProvider(input: UpdateMailProviderInput) {
  const profile = await getCurrentProfile();
  if (!profile || !profile.management_company_id) {
    return { error: "Not authenticated" };
  }
  if (profile.company_role !== "admin") {
    return { error: "Only company admins can change this." };
  }
  if (input.provider !== "stratawise" && !input.domain?.trim()) {
    return { error: "Enter the email domain your firm sends from." };
  }

  const supabase = createServerClient();
  const { error } = await supabase
    .from("management_companies")
    .update({
      mail_provider: input.provider,
      mail_provider_config:
        input.provider === "stratawise"
          ? null
          : { domain: input.domain!.trim().toLowerCase() },
      mail_provider_configured_at: new Date().toISOString(),
      mail_provider_configured_by: profile.id,
    })
    .eq("id", profile.management_company_id);
  if (error) return { error: error.message };
  return { ok: true as const };
}

// Test connection — calls Gmail's users.getProfile via DWD impersonation.
// Surfaces the exact failure reason so admins can self-diagnose during the
// 24-hour DWD propagation window (unauthorized_client, forbidden, etc.).
export async function testGmailMailbox(input: { managerEmail: string }) {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "Not authenticated" };
  if (profile.company_role !== "admin") {
    return { error: "Only company admins can run the test." };
  }
  const target = input.managerEmail?.trim().toLowerCase();
  if (!target || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target)) {
    return { error: "Enter a mailbox to test (e.g. you@yourfirm.com.au)." };
  }
  const { testGmailConnection } = await import("@/lib/google/gmail-client");
  const result = await testGmailConnection(target);
  if (result.ok) {
    // Successful test = mailbox is reachable via DWD. Register a row in
    // gmail_mailbox_subscriptions so the daily watch-refresh cron picks
    // it up + Pub/Sub pushes start landing on /api/webhooks/gmail-push.
    if (profile.management_company_id) {
      const supabase = createServerClient();
      await supabase
        .from("gmail_mailbox_subscriptions")
        .upsert(
          {
            management_company_id: profile.management_company_id,
            mailbox_email: target,
            manager_profile_id: profile.id,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "management_company_id,mailbox_email" },
        );
    }
    return {
      ok: true as const,
      email: result.email,
      messagesTotal: result.messagesTotal,
    };
  }
  return {
    error: result.error,
    reason: result.reason,
  };
}

export async function disconnectMailProvider() {
  const profile = await getCurrentProfile();
  if (!profile || !profile.management_company_id) {
    return { error: "Not authenticated" };
  }
  if (profile.company_role !== "admin") {
    return { error: "Only company admins can change this." };
  }
  const supabase = createServerClient();
  const { error } = await supabase
    .from("management_companies")
    .update({
      mail_provider: "stratawise",
      mail_provider_config: null,
      mail_provider_configured_at: new Date().toISOString(),
      mail_provider_configured_by: profile.id,
    })
    .eq("id", profile.management_company_id);
  if (error) return { error: error.message };
  return { ok: true as const };
}
