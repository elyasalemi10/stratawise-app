import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { createServerClient } from "@/lib/supabase";
import { ensureProfile } from "@/lib/auth";
import { checkExistingConsent } from "./actions";
import { ConsentForm } from "./consent-form";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  // Ensure profile exists in DB (creates if missing)
  await ensureProfile();

  const hasConsent = await checkExistingConsent();

  if (hasConsent) {
    // Check if user needs company setup
    const supabase = createServerClient();
    const { data: profile } = await supabase
      .from("profiles")
      .select("management_company_id")
      .eq("clerk_id", userId)
      .single();

    if (!profile?.management_company_id) {
      redirect("/onboarding/setup");
    }

    redirect("/dashboard");
  }

  return (
    <div className="w-full max-w-lg mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Welcome to My Strata Management
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Before you get started, please review and accept our terms.
        </p>
      </div>

      <ConsentForm />
    </div>
  );
}
