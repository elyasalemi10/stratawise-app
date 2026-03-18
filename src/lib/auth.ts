"use server";

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
    // Ensure notification preferences exist
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

/**
 * Seeds default notification preferences if none exist for the profile.
 * Email + in_app enabled, sms + voice disabled.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function seedNotificationPreferences(supabase: any, profileId: string) {
  // Check if any prefs already exist
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

/**
 * Check if the current user has completed onboarding.
 * Since consent is now part of Step 1, we only check for a management company.
 * Returns the redirect path if onboarding is incomplete, or null if complete.
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

  // No profile — send to onboarding to create one
  if (!profile) return "/onboarding";

  // No company — send to setup wizard
  if (!profile.management_company_id) return "/onboarding/setup";

  // All good
  return null;
}
