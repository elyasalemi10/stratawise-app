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
  management_company_id: string | null;
  status: "active" | "deactivated" | "anonymised";
  created_at: string;
  updated_at: string;
}

// ─── getCurrentProfile ──────────────────────────────────────────

/**
 * Fetches the current user's full profile from Supabase.
 * Returns null if not authenticated or profile doesn't exist.
 * Wrapped with React cache() — deduplicated within a single request.
 * Multiple calls in layout + page + server actions only hit DB once.
 */
export const getCurrentProfile = cache(async (): Promise<Profile | null> => {
  const { userId } = await auth();
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
    console.error("Failed to create profile:", error);
    return null;
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
    .select("id, management_company_id")
    .eq("clerk_id", userId)
    .single();

  if (!profile) return "/onboarding";
  if (!profile.management_company_id) return "/onboarding/setup";

  return null;
}
