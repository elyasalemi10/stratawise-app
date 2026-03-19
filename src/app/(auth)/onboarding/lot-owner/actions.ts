"use server";

import { auth } from "@clerk/nextjs/server";
import { headers } from "next/headers";
import { createServerClient } from "@/lib/supabase";
import { ensureProfile } from "@/lib/auth";

export async function recordLotOwnerConsent() {
  const { userId } = await auth();
  if (!userId) return { error: "Not authenticated" };

  // Ensure profile exists
  const profileId = await ensureProfile();
  if (!profileId) return { error: "Failed to create profile" };

  const supabase = createServerClient();

  // Check if consent already recorded
  const { count } = await supabase
    .from("user_consents")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", profileId);

  if (count && count > 0) return { success: true };

  const headersList = await headers();
  const ipAddress =
    headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    headersList.get("x-real-ip") ??
    "unknown";
  const now = new Date().toISOString();

  await supabase.from("user_consents").insert([
    {
      profile_id: profileId,
      consent_type: "terms_of_service",
      version: "1.0",
      accepted_at: now,
      ip_address: ipAddress,
    },
    {
      profile_id: profileId,
      consent_type: "privacy_policy",
      version: "1.0",
      accepted_at: now,
      ip_address: ipAddress,
    },
  ]);

  return { success: true };
}
