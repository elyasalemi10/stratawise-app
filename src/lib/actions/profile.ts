"use server";

import { auth } from "@clerk/nextjs/server";
import { createServerClient } from "@/lib/supabase";

export interface SidebarProfile {
  companyName: string | null;
  companyLogoUrl: string | null;
  userEmail: string | null;
  userAvatarUrl: string | null;
  userInitials: string;
  userRole: string;
}

export async function getSidebarProfile(): Promise<SidebarProfile | null> {
  const { userId } = await auth();
  if (!userId) return null;

  const supabase = createServerClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("email, first_name, last_name, avatar_url, role, management_company_id")
    .eq("clerk_id", userId)
    .single();

  if (!profile) return null;

  let companyName: string | null = null;
  let companyLogoUrl: string | null = null;

  if (profile.management_company_id) {
    const { data: company } = await supabase
      .from("management_companies")
      .select("name, logo_url")
      .eq("id", profile.management_company_id)
      .single();

    companyName = company?.name ?? null;
    companyLogoUrl = company?.logo_url ?? null;
  }

  // For lot owners, show their name instead of company name
  const fullName = [profile.first_name, profile.last_name].filter(Boolean).join(" ");
  const displayName = companyName || fullName || profile.email?.split("@")[0] || null;

  const initial = displayName?.[0]?.toUpperCase() ?? profile.email?.[0]?.toUpperCase() ?? "?";

  return {
    companyName: displayName,
    companyLogoUrl,
    userEmail: profile.email,
    userAvatarUrl: profile.avatar_url,
    userInitials: initial,
    userRole: profile.role,
  };
}
