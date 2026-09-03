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
    .eq("purpose", "email_verify")
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

  // Invalidate any pending email-verify codes for this profile so only
  // the new one works. (Password-reset codes are kept separate via
  // purpose='password_reset'.)
  await admin
    .from("email_verification_codes")
    .update({ used_at: new Date().toISOString() })
    .eq("profile_id", profile.id)
    .eq("purpose", "email_verify")
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
      purpose: "email_verify",
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
    // The row is already in the table, and OUR 30-second gate reads the most
    // recent unused code , so a failed send would lock the user out of
    // asking again for a code that never arrived. Take it back out.
    await admin
      .from("email_verification_codes")
      .delete()
      .eq("profile_id", profile.id)
      .eq("code", code)
      .eq("purpose", "email_verify");

    // Never hand the mail provider's own wording to the user. Rate limiting
    // is the one failure worth distinguishing, because "wait and retry" is
    // advice they can act on; everything else is ours to fix.
    const raw = send.error.toLowerCase();
    const rateLimited =
      raw.includes("rate") || raw.includes("too many") || raw.includes("429");
    console.error("[verify] code email failed:", send.error);
    return {
      error: rateLimited
        ? "Too many codes requested. Wait a few minutes and try again."
        : "We couldn't send the code just now. Please try again in a moment.",
    };
  }

  return { ok: true };
}

/**
 * Throws away a half-finished sign-up so the email is free again.
 *
 * An account exists from the moment someone submits the sign-up form, before
 * they have proved they own the address. Get the address wrong and you are
 * stuck: the code goes somewhere you cannot read, and signing up again says
 * the email is already registered , for an account that was never confirmed.
 *
 * Only ever deletes an UNVERIFIED profile belonging to the caller, so it
 * cannot be turned into a way to remove a real account.
 */
export async function abandonUnverifiedSignup(): Promise<{ ok: true } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const admin = createServerClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("id, email_verified, management_company_id")
    .eq("auth_user_id", user.id)
    .single();

  if (!profile) return { error: "Profile not found" };
  if (profile.email_verified) {
    return { error: "This account is already verified. Sign in instead." };
  }
  if (profile.management_company_id) {
    // Belt and braces: an unverified profile should never have got this far,
    // and deleting one would take a company with it.
    return { error: "This account is already set up. Sign in instead." };
  }

  await admin.from("email_verification_codes").delete().eq("profile_id", profile.id);
  await admin.from("profiles").delete().eq("id", profile.id);

  const { error: delErr } = await admin.auth.admin.deleteUser(user.id);
  if (delErr) {
    console.error("[verify] could not delete unverified auth user:", delErr);
    return { error: "Something went wrong. Please try again." };
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
    .select("id, code, expires_at, used_at, attempts")
    .eq("profile_id", profile.id)
    .eq("purpose", "email_verify")
    .is("used_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!row) return { error: "No active code. Request a new one." };
  if (row.expires_at < nowIso) return { error: "Code expired. Request a new one." };

  // Rate limit: after MAX_ATTEMPTS wrong tries on the same code, burn it
  // so the user must resend. Defends against brute-force attempts at
  // guessing the 6 digits.
  const MAX_ATTEMPTS = 5;
  if (row.code !== trimmed) {
    const nextAttempts = (row.attempts ?? 0) + 1;
    if (nextAttempts >= MAX_ATTEMPTS) {
      await admin
        .from("email_verification_codes")
        .update({ used_at: nowIso, attempts: nextAttempts })
        .eq("id", row.id);
      return {
        error: "Too many incorrect attempts. Click Resend for a new code.",
      };
    }
    await admin
      .from("email_verification_codes")
      .update({ attempts: nextAttempts })
      .eq("id", row.id);
    return {
      error: `Incorrect code. ${MAX_ATTEMPTS - nextAttempts} attempts left.`,
    };
  }

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
