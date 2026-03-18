import { redirect } from "next/navigation";
import { checkExistingConsent } from "./actions";
import { ConsentForm } from "./consent-form";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const hasConsent = await checkExistingConsent();

  if (hasConsent) {
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
