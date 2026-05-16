"use server";

import { randomInt } from "crypto";
import { headers } from "next/headers";
import { createServerClient } from "@/lib/supabase";
import { sendPasswordResetCodeEmail } from "@/lib/email";
import { rateLimitCheck, getClientIp } from "@/lib/rate-limit";
import { logAudit } from "@/lib/audit";

// Our own password-reset flow — same 6-digit OTP machinery as signup
// verification, but the user is NOT signed in, we look up by email, and
// the final step calls auth.admin.updateUserById to actually change the
// password. Reuses email_verification_codes with purpose='password_reset'.

const CODE_TTL_MS = 10 * 60 * 1000; // 10 min
const SEND_RATE_LIMIT_MS = 30 * 1000; // 30s between sends per email
const MAX_ATTEMPTS = 5;

function generate6DigitCode(): string {
  return String(randomInt(100_000, 1_000_000));
}

const PASSWORD_RULE = /^(?=.*[A-Za-z])(?=.*[^A-Za-z0-9]).{8,}$/;

/**
 * Send a 6-digit code to the email's owner if they have an account. Always
 * returns { ok: true } regardless of whether the email exists — don't leak
 * which addresses are registered. IP-rate-limited (5 / 10 min) so a script
 * can't enumerate.
 */
export async function requestPasswordResetCode(
  rawEmail: string,
): Promise<{ ok: true } | { error: string }> {
  const email = rawEmail.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return { error: "Enter a valid email address." };
  }

  const h = await headers();
  const ip = getClientIp(h);
  const rl = await rateLimitCheck({
    key: `password_reset_send:${ip}`,
    limit: 5,
    windowMs: 10 * 60 * 1000,
  });
  if (!rl.ok) {
    return { error: `Too many attempts. Try again in ${rl.retryAfterSeconds}s.` };
  }

  const admin = createServerClient();

  // Look up profile by email
  const { data: profile } = await admin
    .from("profiles")
    .select("id, email, first_name")
    .eq("email", email)
    .maybeSingle();

  // If no profile, return success anyway (don't leak account existence).
  if (!profile) return { ok: true };

  // Per-profile send rate limit (avoid mailbox flooding)
  const { data: recent } = await admin
    .from("email_verification_codes")
    .select("created_at")
    .eq("profile_id", profile.id)
    .eq("purpose", "password_reset")
    .is("used_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (recent) {
    const elapsed = Date.now() - new Date(recent.created_at).getTime();
    if (elapsed < SEND_RATE_LIMIT_MS) {
      const wait = Math.ceil((SEND_RATE_LIMIT_MS - elapsed) / 1000);
      return { error: `Please wait ${wait}s before requesting another code.` };
    }
  }

  // Invalidate previous unused reset codes
  await admin
    .from("email_verification_codes")
    .update({ used_at: new Date().toISOString() })
    .eq("profile_id", profile.id)
    .eq("purpose", "password_reset")
    .is("used_at", null);

  const code = generate6DigitCode();
  const expiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString();

  await admin.from("email_verification_codes").insert({
    profile_id: profile.id,
    email: profile.email,
    code,
    expires_at: expiresAt,
    purpose: "password_reset",
  });

  await sendPasswordResetCodeEmail({
    to: profile.email,
    name: profile.first_name ?? null,
    code,
  });

  return { ok: true };
}

/**
 * Verify the code and set a new password. On success the user can sign in
 * immediately with the new password. The code is marked used afterwards.
 * Attempts tracked the same way as the signup OTP: 5 wrong tries burns
 * the code.
 */
export async function resetPasswordWithCode(
  rawEmail: string,
  rawCode: string,
  newPassword: string,
): Promise<{ ok: true } | { error: string }> {
  const email = rawEmail.trim().toLowerCase();
  const code = String(rawCode).replace(/\s+/g, "");

  if (!/^\d{6}$/.test(code)) return { error: "Code must be 6 digits." };
  if (!PASSWORD_RULE.test(newPassword)) {
    return {
      error: "Password too weak. 8+ characters, one letter, one special symbol.",
    };
  }

  const admin = createServerClient();

  const { data: profile } = await admin
    .from("profiles")
    .select("id, auth_user_id")
    .eq("email", email)
    .maybeSingle();

  // Generic error — never leak "email not found"
  if (!profile || !profile.auth_user_id) {
    return { error: "Code is invalid or expired. Request a new one." };
  }

  const { data: row } = await admin
    .from("email_verification_codes")
    .select("id, code, expires_at, attempts")
    .eq("profile_id", profile.id)
    .eq("purpose", "password_reset")
    .is("used_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nowIso = new Date().toISOString();
  if (!row || row.expires_at < nowIso) {
    return { error: "Code is invalid or expired. Request a new one." };
  }

  if (row.code !== code) {
    const nextAttempts = (row.attempts ?? 0) + 1;
    if (nextAttempts >= MAX_ATTEMPTS) {
      await admin
        .from("email_verification_codes")
        .update({ used_at: nowIso, attempts: nextAttempts })
        .eq("id", row.id);
      return { error: "Too many incorrect attempts. Request a new code." };
    }
    await admin
      .from("email_verification_codes")
      .update({ attempts: nextAttempts })
      .eq("id", row.id);
    return {
      error: `Incorrect code. ${MAX_ATTEMPTS - nextAttempts} attempts left.`,
    };
  }

  // Update password via admin API
  const { error: updateErr } = await admin.auth.admin.updateUserById(
    profile.auth_user_id,
    { password: newPassword },
  );
  if (updateErr) {
    console.error("Failed to update password:", updateErr);
    return { error: "Failed to update password. Try again." };
  }

  // Burn the code
  await admin
    .from("email_verification_codes")
    .update({ used_at: nowIso })
    .eq("id", row.id);

  // Item 10 — security-sensitive action; log to audit trail. Don't include the
  // new password or the code in the audit row.
  await logAudit({
    profileId: profile.id,
    action: "password_reset",
    entityType: "profile",
    entityId: profile.id,
    metadata: { via: "email_code" },
  });

  return { ok: true };
}
