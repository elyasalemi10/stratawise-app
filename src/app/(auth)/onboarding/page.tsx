import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { createServerClient } from "@/lib/supabase";
import { ensureProfile } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  await ensureProfile();

  // If user already has a company, skip to dashboard
  const supabase = createServerClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("management_company_id")
    .eq("clerk_id", userId)
    .single();

  if (profile?.management_company_id) {
    redirect("/dashboard");
  }

  // Otherwise go to the setup wizard (consent is on Step 1)
  redirect("/onboarding/setup");
}
