"use server";

import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createServerClient } from "@/lib/supabase";
import { consentSchema } from "@/lib/validations/onboarding";

const TERMS_VERSION = "1.0";
const PRIVACY_VERSION = "1.0";

/**
 * Look up the profile UUID from the Clerk user ID.
 * Profiles are synced from Clerk via webhook — the profile must exist
 * before consent can be recorded.
 */
async function getProfileId(clerkUserId: string): Promise<string | null> {
  const supabase = createServerClient();
  const { data } = await supabase
    .from("profiles")
    .select("id")
    .eq("clerk_id", clerkUserId)
    .single();

  return data?.id ?? null;
}

export async function recordConsent(formData: FormData) {
  const { userId } = await auth();
  if (!userId) {
    throw new Error("Not authenticated");
  }

  const parsed = consentSchema.safeParse({
    termsAccepted: formData.get("termsAccepted") === "true",
    privacyAccepted: formData.get("privacyAccepted") === "true",
  });

  if (!parsed.success) {
    return { error: "You must accept both the Terms of Service and Privacy Policy." };
  }

  const profileId = await getProfileId(userId);
  if (!profileId) {
    return { error: "Your profile is still being set up. Please try again in a moment." };
  }

  const headersList = await headers();
  const ipAddress =
    headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    headersList.get("x-real-ip") ??
    "unknown";

  const supabase = createServerClient();
  const now = new Date().toISOString();

  const { error } = await supabase.from("user_consents").insert([
    {
      profile_id: profileId,
      consent_type: "terms_of_service",
      version: TERMS_VERSION,
      accepted_at: now,
      ip_address: ipAddress,
    },
    {
      profile_id: profileId,
      consent_type: "privacy_policy",
      version: PRIVACY_VERSION,
      accepted_at: now,
      ip_address: ipAddress,
    },
  ]);

  if (error) {
    console.error("Failed to record consent:", error);
    return { error: "Failed to record consent. Please try again." };
  }

  // Route based on user state after consent
  const supabase2 = createServerClient();
  const { data: profile } = await supabase2
    .from("profiles")
    .select("management_company_id")
    .eq("id", profileId)
    .single();

  if (!profile?.management_company_id) {
    redirect("/onboarding/setup");
  }

  redirect("/dashboard");
}

export async function checkExistingConsent(): Promise<boolean> {
  const { userId } = await auth();
  if (!userId) return false;

  const profileId = await getProfileId(userId);
  if (!profileId) return false;

  const supabase = createServerClient();

  const { data } = await supabase
    .from("user_consents")
    .select("consent_type")
    .eq("profile_id", profileId)
    .in("consent_type", ["terms_of_service", "privacy_policy"])
    .in("version", [TERMS_VERSION, PRIVACY_VERSION]);

  if (!data) return false;

  const types = data.map((d) => d.consent_type);
  return types.includes("terms_of_service") && types.includes("privacy_policy");
}
