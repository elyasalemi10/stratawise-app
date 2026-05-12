"use server";

import { randomInt } from "crypto";
import { createServerClient } from "@/lib/supabase";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { sendVerificationCodeEmail } from "@/lib/email";

const CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const CODE_RATE_LIMIT_MS = 30 * 1000; // 30 seconds between code requests

function generate6DigitCode(): string {
  // randomInt is CSPRNG-backed. Range [100000, 1000000) gives a uniform 6-digit code.
  return String(randomInt(100_000, 1_000_000));
}

/**
 * Sends a fresh 6-digit verification code to the currently signed-in user's
 * email. Invalidates any pending (unused) codes for the same profile first
 * so only the latest code works. Rate-limited to one request per 30s per
 * profile to avoid mailbox flooding.
 *
 * Returns { ok: true } on send, { error } on failure.
 */
export async function sendVerificationCode(): Promise<{ ok: true } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return { error: "Not authenticated" };

  const admin = createServerClient();

  const { data: profile } = await admin
    .from("profiles")
    .select("id, email, first_name, email_verified")
    .eq("auth_user_id", user.id)
    .single();

  if (!profile) return { error: "Profile not found" };
  if (profile.email_verified) return { error: "Email already verified" };

  // Rate limit: check most recent unused code's created_at.
  const { data: recent } = await admin
    .from("email_verification_codes")
    .select("created_at")
    .eq("profile_id", profile.id)
    .is("used_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (recent) {
    const elapsed = Date.now() - new Date(recent.created_at).getTime();
    if (elapsed < CODE_RATE_LIMIT_MS) {
      const wait = Math.ceil((CODE_RATE_LIMIT_MS - elapsed) / 1000);
      return { error: `Please wait ${wait}s before requesting another code.` };
    }
  }

  // Invalidate any pending codes for this profile so only the new one works.
  await admin
    .from("email_verification_codes")
    .update({ used_at: new Date().toISOString() })
    .eq("profile_id", profile.id)
    .is("used_at", null);

  const code = generate6DigitCode();
  const expiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString();

  const { error: insertErr } = await admin
    .from("email_verification_codes")
    .insert({
      profile_id: profile.id,
      email: profile.email,
      code,
      expires_at: expiresAt,
    });

  if (insertErr) {
    console.error("Failed to store verification code:", insertErr);
    return { error: "Failed to create verification code" };
  }

  const send = await sendVerificationCodeEmail({
    to: profile.email,
    name: profile.first_name,
    code,
  });

  if ("error" in send) {
    return { error: send.error };
  }

  return { ok: true };
}

/**
 * Verifies a 6-digit code for the currently signed-in user. On success,
 * flips profiles.email_verified=true and marks the code used. The code must
 * be the most recent unused one for the profile and not yet expired.
 *
 * Returns { ok: true } on success, { error } on failure.
 */
export async function verifyEmailCode(
  inputCode: string,
): Promise<{ ok: true } | { error: string }> {
  const trimmed = String(inputCode).replace(/\s+/g, "");
  if (!/^\d{6}$/.test(trimmed)) {
    return { error: "Code must be 6 digits." };
  }

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const admin = createServerClient();

  const { data: profile } = await admin
    .from("profiles")
    .select("id, email_verified")
    .eq("auth_user_id", user.id)
    .single();

  if (!profile) return { error: "Profile not found" };
  if (profile.email_verified) return { ok: true };

  const nowIso = new Date().toISOString();

  const { data: row } = await admin
    .from("email_verification_codes")
    .select("id, code, expires_at, used_at")
    .eq("profile_id", profile.id)
    .is("used_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!row) return { error: "No active code. Request a new one." };
  if (row.expires_at < nowIso) return { error: "Code expired. Request a new one." };
  if (row.code !== trimmed) return { error: "Incorrect code." };

  // Mark used + flip verified flag.
  const { error: updateCodeErr } = await admin
    .from("email_verification_codes")
    .update({ used_at: nowIso })
    .eq("id", row.id);
  if (updateCodeErr) {
    console.error("Failed to mark code used:", updateCodeErr);
    return { error: "Failed to verify code" };
  }

  const { error: updateProfileErr } = await admin
    .from("profiles")
    .update({ email_verified: true })
    .eq("id", profile.id);
  if (updateProfileErr) {
    console.error("Failed to flip email_verified:", updateProfileErr);
    return { error: "Failed to verify email" };
  }

  return { ok: true };
}
