"use server";

import { getAuthUserId } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";
import { companyDisplayName as brandName } from "@/lib/company-name";

export interface SidebarProfile {
  /** The signed-in person. Headline of the account card. */
  userName: string | null;
  companyName: string | null;
  companyLogoUrl: string | null;
  userEmail: string | null;
  userAvatarUrl: string | null;
  userInitials: string;
  userRole: string;
}

export async function getSidebarProfile(): Promise<SidebarProfile | null> {
  const userId = await getAuthUserId();
  if (!userId) return null;

  const supabase = createServerClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("email, first_name, last_name, avatar_url, role, management_company_id")
    .eq("auth_user_id", userId)
    .single();

  if (!profile) return null;

  let companyName: string | null = null;
  let companyLogoUrl: string | null = null;

  if (profile.management_company_id) {
    const { data: company } = await supabase
      .from("management_companies")
      .select("name, trading_as, logo_url")
      .eq("id", profile.management_company_id)
      .single();

    // The brand, not the registered business name , see lib/company-name.ts.
    companyName = brandName(company ?? {}) || null;
    companyLogoUrl = company?.logo_url ?? null;
  }

  const fullName =
    [profile.first_name, profile.last_name].filter(Boolean).join(" ").trim() || null;
  const userName = fullName || profile.email?.split("@")[0] || null;

  const initial =
    fullName?.[0]?.toUpperCase() ?? profile.email?.[0]?.toUpperCase() ?? "?";

  return {
    userName,
    // Null for a lot owner: they do not belong to a firm, so the card shows
    // their name alone rather than an empty second line.
    companyName,
    companyLogoUrl,
    userEmail: profile.email,
    userAvatarUrl: profile.avatar_url,
    userInitials: initial,
    userRole: profile.role,
  };
}
