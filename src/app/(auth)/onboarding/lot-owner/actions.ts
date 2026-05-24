"use server";

import { getAuthUserId } from "@/lib/auth";import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createServerClient } from "@/lib/supabase";
import { ensureProfile } from "@/lib/auth";

export async function recordLotOwnerConsent() {
  const userId = await getAuthUserId();
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

  const { error } = await supabase.from("user_consents").insert([
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

  if (error) {
    console.error("Failed to record consent:", error);
    return { error: "Failed to save consent. Please try again." };
  }

  // Clear any cached redirects
  revalidatePath("/dashboard");
  revalidatePath("/onboarding");

  return { success: true };
}

// Records a lot owner's per-OC digital-communication consent. Consent is
// per (owner, OC) , stored in oc_member_consents and mirrored onto the
// owner's lot_owners row (digital_consent_categories) for the OC, with a
// before/after entry in lot_owner_consent_log for audit.
export async function recordOcConsent(ocId: string, categories: string[]) {
  const userId = await getAuthUserId();
  if (!userId) return { error: "Not authenticated" };
  const profileId = await ensureProfile();
  if (!profileId) return { error: "Failed to resolve profile" };

  const supabase = createServerClient();
  const headersList = await headers();
  const ipAddress =
    headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    headersList.get("x-real-ip") ??
    "unknown";
  const userAgent = headersList.get("user-agent") ?? null;
  const cats = Array.isArray(categories) ? categories : [];

  // Confirm this profile actually belongs to the OC (and find their lot).
  const { data: membership } = await supabase
    .from("oc_members")
    .select("lot_id")
    .eq("profile_id", profileId)
    .eq("oc_id", ocId)
    .eq("role", "lot_owner")
    .is("left_at", null)
    .limit(1)
    .maybeSingle();
  if (!membership) return { error: "You're not a member of this Owners Corporation." };

  const { error } = await supabase.from("oc_member_consents").upsert(
    {
      profile_id: profileId,
      oc_id: ocId,
      categories: cats,
      accepted_at: new Date().toISOString(),
      ip_address: ipAddress,
      user_agent: userAgent,
    },
    { onConflict: "profile_id,oc_id" },
  );
  if (error) {
    console.error("Failed to record OC consent:", error);
    return { error: "Failed to save your preferences. Please try again." };
  }

  // Mirror onto the owner's lot_owners row + audit log (best-effort).
  if (membership.lot_id) {
    const { data: lotOwner } = await supabase
      .from("lot_owners")
      .select("id, digital_consent_categories")
      .eq("lot_id", membership.lot_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lotOwner) {
      const before = (lotOwner.digital_consent_categories as string[] | null) ?? [];
      await supabase
        .from("lot_owners")
        .update({
          digital_consent_categories: cats,
          digital_consent_given_at: new Date().toISOString(),
          digital_consent_ip: ipAddress,
          digital_consent_source: "portal_signup",
        })
        .eq("id", lotOwner.id);
      await supabase.from("lot_owner_consent_log").insert({
        lot_owner_id: lotOwner.id,
        oc_id: ocId,
        before_categories: before,
        after_categories: cats,
        source: "portal_signup",
        actor_profile_id: profileId,
        ip: ipAddress,
        user_agent: userAgent,
      });
    }
  }

  revalidatePath("/dashboard");
  revalidatePath("/onboarding");
  return { success: true };
}
