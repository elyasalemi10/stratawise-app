"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { createServerClient } from "@/lib/supabase";

/**
 * Ensures a profile row exists for the current Clerk user.
 * Creates one on-the-fly if missing (just-in-time provisioning).
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

  if (existing) return existing.id;

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
      role: "lot_owner", // default, upgraded during onboarding
    })
    .select("id")
    .single();

  if (error) {
    console.error("Failed to create profile:", error);
    return null;
  }

  return created?.id ?? null;
}

/**
 * Check if the current user has completed onboarding:
 * 1. Profile exists
 * 2. Consent recorded (terms + privacy)
 * 3. Management company assigned
 *
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

  // Check consent
  const { data: consents } = await supabase
    .from("user_consents")
    .select("consent_type")
    .eq("profile_id", profile.id)
    .in("consent_type", ["terms_of_service", "privacy_policy"]);

  const consentTypes = consents?.map((c) => c.consent_type) ?? [];
  const hasTerms = consentTypes.includes("terms_of_service");
  const hasPrivacy = consentTypes.includes("privacy_policy");

  if (!hasTerms || !hasPrivacy) return "/onboarding";

  // No company — send to setup wizard
  if (!profile.management_company_id) return "/onboarding/setup";

  // All good
  return null;
}
