import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { createServerClient } from "@/lib/supabase";
import { ensureProfile } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  await ensureProfile();

  const supabase = createServerClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role, management_company_id")
    .eq("clerk_id", userId)
    .single();

  // Lot owners should go to the lot owner onboarding, not the company setup
  if (profile?.role === "lot_owner") {
    const { count } = await supabase
      .from("user_consents")
      .select("id", { count: "exact", head: true })
      .eq("profile_id", profile.id);

    if (count && count > 0) {
      redirect("/dashboard");
    }
    redirect("/onboarding/lot-owner");
  }

  // If user already has a company, skip to dashboard
  if (profile?.management_company_id) {
    redirect("/dashboard");
  }

  // Otherwise go to the setup wizard (consent is on Step 1)
  redirect("/onboarding/setup");
}
