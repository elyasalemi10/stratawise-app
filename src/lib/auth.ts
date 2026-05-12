"use server";

import { cache } from "react";
import { createServerClient } from "@/lib/supabase";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { _verificationUserIdResolver } from "@/lib/auth-resolver";

const NOTIFICATION_TYPES = [
  "levy_issued",
  "payment_received",
  "payment_overdue",
  "meeting_notice",
  "meeting_minutes",
  "maintenance_update",
  "announcement",
  "complaint_update",
  "escalation_step",
  "document_uploaded",
];

// ─── Profile type ───────────────────────────────────────────────

export interface Profile {
  id: string;
  auth_user_id: string | null;
  email: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  postal_address: string | null;
  avatar_url: string | null;
  role: "super_admin" | "strata_manager" | "lot_owner";
  company_role: "admin" | "manager" | "viewer" | null;
  management_company_id: string | null;
  status: "active" | "deactivated" | "anonymised";
  created_at: string;
  updated_at: string;
}

// ─── Resolve current Supabase Auth user id ────────────────────

/**
 * Returns the current Supabase Auth user's UUID, or null if not signed in.
 * Verification suites short-circuit via _verificationUserIdResolver so they
 * can run server actions without a real signed-in user. Replaces Clerk's
 * `(await auth()).userId` pattern.
 */
export async function getAuthUserId(): Promise<string | null> {
  if (_verificationUserIdResolver) {
    return await _verificationUserIdResolver();
  }
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

// ─── getCurrentProfile ──────────────────────────────────────────

/**
 * Fetches the current user's full profile from Supabase.
 * Returns null if not authenticated or profile doesn't exist.
 * Wrapped with React cache() — deduplicated within a single request.
 */
export const getCurrentProfile = cache(async (): Promise<Profile | null> => {
  const authUserId = await getAuthUserId();
  if (!authUserId) return null;

  // Admin client — we already validated the user is signed in via
  // Supabase Auth. RLS isn't needed here since we're scoping by
  // auth_user_id explicitly.
  const supabase = createServerClient();

  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("auth_user_id", authUserId)
    .single();

  return (data as Profile) ?? null;
});

// ─── requireRole ────────────────────────────────────────────────

export async function requireRole(
  allowedRoles: Array<"super_admin" | "strata_manager" | "lot_owner">,
): Promise<Profile> {
  const profile = await getCurrentProfile();

  if (!profile) {
    throw new Error("Not authenticated");
  }

  if (!allowedRoles.includes(profile.role)) {
    throw new Error(`Access denied. Required role: ${allowedRoles.join(" or ")}`);
  }

  return profile;
}

// ─── requireCompanyRole ────────────────────────────────────────

export async function requireCompanyRole(
  allowedCompanyRoles: Array<"admin" | "manager"> = ["admin", "manager"],
): Promise<Profile> {
  const profile = await requireRole(["strata_manager", "super_admin"]);

  if (profile.role === "super_admin") return profile;

  if (
    !profile.company_role ||
    !(allowedCompanyRoles as string[]).includes(profile.company_role)
  ) {
    throw new Error("Access denied. Insufficient permissions.");
  }

  return profile;
}

// ─── ensureProfile ──────────────────────────────────────────────

/**
 * Ensures a profile row exists for the current Supabase Auth user.
 * The on_auth_user_created DB trigger should have created one on signup,
 * but this provides a safety net (e.g. trigger disabled, race during
 * initial deploy). Also seeds default notification preferences.
 * Returns the profile id, or null if not authenticated.
 */
export async function ensureProfile(): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createServerClient();

  const { data: existing } = await admin
    .from("profiles")
    .select("id")
    .eq("auth_user_id", user.id)
    .single();

  if (existing) {
    await seedNotificationPreferences(admin, existing.id);
    return existing.id;
  }

  // Trigger missed — create profile manually from auth.users metadata.
  const intendedRole =
    (user.user_metadata?.intended_role as string | undefined) ?? null;
  const role: "strata_manager" | "lot_owner" =
    intendedRole === "strata_manager" ? "strata_manager" : "lot_owner";

  const { data: created, error } = await admin
    .from("profiles")
    .insert({
      auth_user_id: user.id,
      email: user.email ?? "",
      first_name: (user.user_metadata?.first_name as string | undefined) ?? null,
      last_name: (user.user_metadata?.last_name as string | undefined) ?? null,
      role,
    })
    .select("id")
    .single();

  if (error) {
    // 23505 = duplicate. The trigger fired between our SELECT and INSERT.
    // Recover by re-reading.
    if (error.code === "23505") {
      const { data: raced } = await admin
        .from("profiles")
        .select("id")
        .eq("auth_user_id", user.id)
        .single();
      if (raced) {
        await seedNotificationPreferences(admin, raced.id);
        return raced.id;
      }
    }
    console.error("Failed to create profile:", error.message, error.code);
    throw new Error(`Database error: ${error.message}`);
  }

  if (created) {
    await seedNotificationPreferences(admin, created.id);
  }

  return created?.id ?? null;
}

// ─── seedNotificationPreferences ────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function seedNotificationPreferences(supabase: any, profileId: string) {
  const { count } = await supabase
    .from("notification_preferences")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", profileId);

  if (count && count > 0) return;

  const preferences = NOTIFICATION_TYPES.flatMap((type) => [
    { profile_id: profileId, notification_type: type, channel: "email", enabled: true },
    { profile_id: profileId, notification_type: type, channel: "in_app", enabled: true },
    { profile_id: profileId, notification_type: type, channel: "sms", enabled: false },
    { profile_id: profileId, notification_type: type, channel: "voice", enabled: false },
  ]);

  await supabase
    .from("notification_preferences")
    .upsert(preferences, { onConflict: "profile_id,notification_type,channel" });
}

// ─── requireSubdivisionAccess ───────────────────────────────────

export async function requireSubdivisionAccess(
  subdivisionId: string,
): Promise<Profile> {
  const profile = await getCurrentProfile();
  if (!profile) throw new Error("Not authenticated");

  if (profile.role === "super_admin") return profile;

  const supabase = createServerClient();

  if (profile.role === "strata_manager") {
    const { data: subdivision } = await supabase
      .from("subdivisions")
      .select("management_company_id")
      .eq("id", subdivisionId)
      .single();

    if (
      !subdivision ||
      subdivision.management_company_id !== profile.management_company_id
    ) {
      throw new Error("Access denied");
    }
    return profile;
  }

  const { data: membership } = await supabase
    .from("subdivision_members")
    .select("id")
    .eq("subdivision_id", subdivisionId)
    .eq("profile_id", profile.id)
    .is("left_at", null)
    .single();

  if (!membership) throw new Error("Access denied");
  return profile;
}

// ─── getOnboardingRedirect ──────────────────────────────────────

export async function getOnboardingRedirect(): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return "/sign-in";

  const admin = createServerClient();

  const { data: profile } = await admin
    .from("profiles")
    .select("id, role, management_company_id")
    .eq("auth_user_id", user.id)
    .single();

  if (!profile) return "/onboarding";

  if (profile.role === "lot_owner") {
    const { count } = await admin
      .from("user_consents")
      .select("id", { count: "exact", head: true })
      .eq("profile_id", profile.id);

    if (!count || count === 0) return "/onboarding/lot-owner";
    return null;
  }

  if (!profile.management_company_id) return "/onboarding/setup";

  return null;
}
