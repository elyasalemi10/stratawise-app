"use client";

import { useState } from "react";
import Link from "next/link";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { recordConsent } from "./actions";

export function ConsentForm() {
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const canSubmit = termsAccepted && privacyAccepted && !pending;

  async function handleSubmit() {
    setPending(true);
    setError(null);

    const formData = new FormData();
    formData.set("termsAccepted", String(termsAccepted));
    formData.set("privacyAccepted", String(privacyAccepted));

    const result = await recordConsent(formData);
    if (result?.error) {
      setError(result.error);
      setPending(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-5 space-y-4">
          <div className="flex items-start gap-3">
            <Checkbox
              id="terms"
              checked={termsAccepted}
              onCheckedChange={(checked) => setTermsAccepted(checked === true)}
            />
            <Label htmlFor="terms" className="text-sm text-foreground leading-snug cursor-pointer font-normal">
              I have read and agree to the{" "}
              <Link href="/legal/terms" target="_blank" className="text-primary hover:underline">
                Terms of Service
              </Link>
            </Label>
          </div>

          <div className="flex items-start gap-3">
            <Checkbox
              id="privacy"
              checked={privacyAccepted}
              onCheckedChange={(checked) => setPrivacyAccepted(checked === true)}
            />
            <Label htmlFor="privacy" className="text-sm text-foreground leading-snug cursor-pointer font-normal">
              I have read and agree to the{" "}
              <Link href="/legal/privacy" target="_blank" className="text-primary hover:underline">
                Privacy Policy
              </Link>
            </Label>
          </div>
        </CardContent>
      </Card>

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      <Button
        className="w-full"
        disabled={!canSubmit}
        onClick={handleSubmit}
      >
        {pending ? <><Spinner className="mr-2" /> Continue</> : "Continue"}
      </Button>
    </div>
  );
}
