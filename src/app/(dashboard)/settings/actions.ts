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
// Combined Gmail setup save. Replaces the two-step (test → save) flow with a
// single action that takes the manager's mailbox prefix (e.g. "elyas"),
// composes the full address against the firm's domain (elyas@upscalewithai.com.au),
// tests the DWD impersonation, kicks off Gmail Pub/Sub watch immediately,
// upserts gmail_mailbox_subscriptions so outbound sends know which mailbox
// to impersonate, and persists provider+domain on management_companies.
//
// Validation:
//   - admin role required
//   - domain required when provider=gmail/outlook
//   - prefix required when provider=gmail (used as sender mailbox + tested)
//   - prefix must be a valid local-part (letters, digits, dot, dash, underscore)
//
// Returns:
//   { ok, mailbox, watching, watchError? }  on success
//   { error, reason? }                     on test failure (so the UI can
//                                          show the verbatim DWD reason)
interface SaveGmailSetupInput {
  provider: "stratawise" | "gmail" | "outlook";
  domain: string | null;
  mailboxPrefix: string | null;
}

export async function saveGmailSetup(input: SaveGmailSetupInput) {
  const profile = await getCurrentProfile();
  if (!profile || !profile.management_company_id) {
    return { error: "Not authenticated" };
  }
  if (profile.company_role !== "admin") {
    return { error: "Only company admins can change this." };
  }

  const domain = input.domain?.trim().toLowerCase() ?? "";
  const prefix = input.mailboxPrefix?.trim().toLowerCase() ?? "";

  if (input.provider !== "stratawise") {
    if (!domain) return { error: "Enter the email domain your firm sends from." };
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain)) {
      return { error: "That domain doesn't look right (e.g. acmestrata.com.au)." };
    }
  }
  if (input.provider === "gmail") {
    if (!prefix) {
      return { error: "Enter your mailbox prefix (the part before the @)." };
    }
    if (!/^[a-z0-9._-]+$/.test(prefix)) {
      return { error: "Prefix can only contain letters, digits, dot, dash or underscore." };
    }
  }

  const supabase = createServerClient();

  // Provider + domain go on the company row regardless of test outcome —
  // disconnecting is one click away, and the admin may want to switch back
  // to stratawise without re-running the prefix test.
  const { error: companyErr } = await supabase
    .from("management_companies")
    .update({
      mail_provider: input.provider,
      mail_provider_config:
        input.provider === "stratawise" ? null : { domain },
      mail_provider_configured_at: new Date().toISOString(),
      mail_provider_configured_by: profile.id,
    })
    .eq("id", profile.management_company_id);
  if (companyErr) return { error: companyErr.message };

  // Non-Gmail flows have nothing further to set up here.
  if (input.provider !== "gmail") {
    return { ok: true as const };
  }

  const mailbox = `${prefix}@${domain}`;
  const { testGmailConnection, watchMailbox } = await import(
    "@/lib/google/gmail-client"
  );

  const test = await testGmailConnection(mailbox);
  if (!test.ok) {
    return { error: test.error, reason: test.reason };
  }

  // Successful test → kick off users.watch() so inbound sync goes live
  // immediately, then upsert the subscription with the resulting history
  // cursor. Watch failures are logged but do NOT fail the save — sends
  // still work, the admin just sees an inbound-sync warning on the row.
  let watchInfo: { historyId: string; expiresAt: string } | null = null;
  let watchError: string | null = null;
  const topic = process.env.GMAIL_PUBSUB_TOPIC;
  if (topic) {
    const w = await watchMailbox(mailbox, topic);
    if (w.ok) {
      watchInfo = {
        historyId: w.historyId,
        expiresAt: new Date(
          Number(w.expiration) || Date.now() + 7 * 24 * 60 * 60 * 1000,
        ).toISOString(),
      };
    } else {
      watchError = w.error;
      console.error(
        "saveGmailSetup: watch() failed for",
        mailbox,
        ":",
        w.error,
      );
    }
  }

  await supabase
    .from("gmail_mailbox_subscriptions")
    .upsert(
      {
        management_company_id: profile.management_company_id,
        mailbox_email: mailbox,
        manager_profile_id: profile.id,
        history_id: watchInfo?.historyId ?? null,
        watch_expires_at: watchInfo?.expiresAt ?? null,
        watch_last_renewed_at: watchInfo ? new Date().toISOString() : null,
        last_error: watchError,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "management_company_id,mailbox_email" },
    );

  return {
    ok: true as const,
    mailbox,
    messagesTotal: test.messagesTotal,
    watching: !!watchInfo,
    watchError: watchError ?? undefined,
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
