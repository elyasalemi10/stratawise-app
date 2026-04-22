"use server";

import { cache } from "react";
import { auth, currentUser } from "@clerk/nextjs/server";
import { createServerClient } from "@/lib/supabase";

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
  clerk_id: string;
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

// ─── Verification-script injection seam ────────────────────────
//
// Server actions call getCurrentProfile(), which calls Clerk's auth() to pull
// the userId from request headers. That path requires a live HTTP request
// scope, which a standalone `tsx` verification script does not have. The seam
// below lets *.verification.ts replace the userId resolver before calling any
// server action. Production code MUST NOT import or call these functions.
//
// Pre-launch grep: `grep -rn "__setUserIdResolverForVerification" src/` must
// return exactly two hits — the definition here and the call site in a
// *.verification.ts script. Any other hit is a bug.

type UserIdResolver = () => Promise<string | null>;
let _verificationUserIdResolver: UserIdResolver | null = null;

/** Injection seam for verification scripts only. Never call from application code. Production servers never invoke this. */
export function __setUserIdResolverForVerification(fn: UserIdResolver | null): void {
  _verificationUserIdResolver = fn;
}

/** Read-only probe so a verification script can assert its resolver is active before running scenarios. Never call from application code. */
export function __getUserIdResolverForVerification(): UserIdResolver | null {
  return _verificationUserIdResolver;
}

// ─── getCurrentProfile ──────────────────────────────────────────

/**
 * Fetches the current user's full profile from Supabase.
 * Returns null if not authenticated or profile doesn't exist.
 * Wrapped with React cache() — deduplicated within a single request.
 * Multiple calls in layout + page + server actions only hit DB once.
 */
export const getCurrentProfile = cache(async (): Promise<Profile | null> => {
  const userId = _verificationUserIdResolver
    ? await _verificationUserIdResolver()
    : (await auth()).userId;
  if (!userId) return null;

  const supabase = createServerClient();

  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("clerk_id", userId)
    .single();

  return (data as Profile) ?? null;
});

// ─── requireRole ────────────────────────────────────────────────

/**
 * Ensures the current user has one of the allowed roles.
 * Throws an error if not authenticated or role doesn't match.
 * Returns the profile for convenience.
 */
export async function requireRole(
  allowedRoles: Array<"super_admin" | "strata_manager" | "lot_owner">
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

/**
 * Ensures the current user is a strata_manager/super_admin with
 * the required company_role (admin or manager). Viewers are blocked.
 * Use for all mutation actions (create, update, delete).
 */
export async function requireCompanyRole(
  allowedCompanyRoles: Array<"admin" | "manager"> = ["admin", "manager"]
): Promise<Profile> {
  const profile = await requireRole(["strata_manager", "super_admin"]);

  // super_admin bypasses company role check
  if (profile.role === "super_admin") return profile;

  // strata_manager must have an explicit company_role in the allowed set.
  // A null company_role is NOT treated as admin — deny by default.
  if (!profile.company_role || !(allowedCompanyRoles as string[]).includes(profile.company_role)) {
    throw new Error("Access denied. Insufficient permissions.");
  }

  return profile;
}

// ─── ensureProfile ──────────────────────────────────────────────

/**
 * Ensures a profile row exists for the current Clerk user.
 * Creates one on-the-fly if missing (just-in-time provisioning).
 * Also seeds default notification preferences if they don't exist.
 * Returns the profile id, or null if not authenticated.
 */
export async function ensureProfile(): Promise<string | null> {
  const { userId } = await auth();
  if (!userId) return null;

  const supabase = createServerClient();

  // Check if profile already exists
  const { data: existing } = await supabase
    .from("profiles")
    .select("id")
    .eq("clerk_id", userId)
    .single();

  if (existing) {
    await seedNotificationPreferences(supabase, existing.id);
    return existing.id;
  }

  // Profile doesn't exist — create it from Clerk user data
  const user = await currentUser();
  if (!user) return null;

  const { data: created, error } = await supabase
    .from("profiles")
    .insert({
      clerk_id: userId,
      email: user.primaryEmailAddress?.emailAddress ?? "",
      first_name: user.firstName ?? null,
      last_name: user.lastName ?? null,
      avatar_url: user.imageUrl ?? null,
      role: "lot_owner",
    })
    .select("id")
    .single();

  if (error) {
    console.error("Failed to create profile:", error.message, error.code);
    throw new Error(`Database error: ${error.message}`);
  }

  if (created) {
    await seedNotificationPreferences(supabase, created.id);
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

/**
 * Validates the current user has access to a specific subdivision.
 * Returns the profile if authorized, throws if not.
 */
export async function requireSubdivisionAccess(
  subdivisionId: string
): Promise<Profile> {
  const profile = await getCurrentProfile();
  if (!profile) throw new Error("Not authenticated");

  // super_admin can access everything
  if (profile.role === "super_admin") return profile;

  const supabase = createServerClient();

  if (profile.role === "strata_manager") {
    // Must belong to the same management company
    const { data: subdivision } = await supabase
      .from("subdivisions")
      .select("management_company_id")
      .eq("id", subdivisionId)
      .single();

    if (!subdivision || subdivision.management_company_id !== profile.management_company_id) {
      throw new Error("Access denied");
    }
    return profile;
  }

  // lot_owner — must be a member
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

/**
 * Check if the current user has completed onboarding.
 * Returns the redirect path if incomplete, or null if complete.
 */
export async function getOnboardingRedirect(): Promise<string | null> {
  const { userId } = await auth();
  if (!userId) return "/sign-in";

  const supabase = createServerClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role, management_company_id")
    .eq("clerk_id", userId)
    .single();

  if (!profile) return "/onboarding";

  // Lot owners don't need a management company — just need consent
  if (profile.role === "lot_owner") {
    const { count } = await supabase
      .from("user_consents")
      .select("id", { count: "exact", head: true })
      .eq("profile_id", profile.id);

    if (!count || count === 0) return "/onboarding/lot-owner";
    return null; // lot owner with consent → allow dashboard
  }

  // Strata managers need a management company
  if (!profile.management_company_id) return "/onboarding/setup";

  return null;
}
