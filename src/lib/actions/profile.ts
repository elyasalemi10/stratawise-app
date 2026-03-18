"use server";

import { auth } from "@clerk/nextjs/server";
import { createServerClient } from "@/lib/supabase";

export interface SidebarProfile {
  companyName: string | null;
  companyLogoUrl: string | null;
  userName: string | null;
  userEmail: string | null;
}

export async function getSidebarProfile(): Promise<SidebarProfile | null> {
  const { userId } = await auth();
  if (!userId) return null;

  const supabase = createServerClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("first_name, last_name, email, management_company_id")
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

  const userName = [profile.first_name, profile.last_name].filter(Boolean).join(" ") || null;

  return {
    companyName,
    companyLogoUrl,
    userName,
    userEmail: profile.email,
  };
}
