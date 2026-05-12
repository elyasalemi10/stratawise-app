"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { recordLotOwnerConsent } from "./actions";

export default function LotOwnerOnboardingPage() {
  const router = useRouter();
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [pending, setPending] = useState(false);

  const canContinue = termsAccepted && privacyAccepted;

  async function handleSubmit() {
    if (!canContinue) return;
    setPending(true);
    const result = await recordLotOwnerConsent();
    setPending(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }

    // Force full reload to clear Next.js router cache
    window.location.href = "/dashboard";
  }

  return (
    <div className="max-w-lg mx-auto py-12 px-4">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">
        Welcome to Strata Wise
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Before you get started, please review and accept our terms.
      </p>

      <Card className="mt-6">
        <CardContent className="pt-5 space-y-4">
          <div className="flex items-start gap-3">
            <Checkbox
              id="terms"
              checked={termsAccepted}
              onCheckedChange={(v) => setTermsAccepted(v === true)}
            />
            <label htmlFor="terms" className="text-sm text-foreground cursor-pointer">
              I have read and agree to the{" "}
              <Link href="/legal/terms" target="_blank" className="text-primary hover:underline">
                Terms of Service
              </Link>
            </label>
          </div>

          <div className="flex items-start gap-3">
            <Checkbox
              id="privacy"
              checked={privacyAccepted}
              onCheckedChange={(v) => setPrivacyAccepted(v === true)}
            />
            <label htmlFor="privacy" className="text-sm text-foreground cursor-pointer">
              I have read and agree to the{" "}
              <Link href="/legal/privacy" target="_blank" className="text-primary hover:underline">
                Privacy Policy
              </Link>
            </label>
          </div>
        </CardContent>
      </Card>

      <Button
        className="w-full mt-4"
        disabled={!canContinue || pending}
        onClick={handleSubmit}
      >
        {pending && <Loader2 className="size-4 animate-spin" />}
        Continue
      </Button>
    </div>
  );
}
