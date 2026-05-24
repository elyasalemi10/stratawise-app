"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { recordLotOwnerConsent } from "./actions";

// Account-level Terms / Privacy acceptance , the first step of lot-owner
// onboarding. After this, per-OC digital-consent steps run (one per OC the
// owner belongs to that they haven't consented for yet).
export function TcStep() {
  const [accepted, setAccepted] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleSubmit() {
    if (!accepted) return;
    setPending(true);
    const result = await recordLotOwnerConsent();
    if (result.error) {
      setPending(false);
      toast.error(result.error);
      return;
    }
    // Re-enter the onboarding router, which now moves to the first per-OC
    // consent step (or the dashboard). Spinner stays on through the nav.
    window.location.href = "/onboarding/lot-owner";
  }

  return (
    <div className="max-w-lg mx-auto py-12 px-4">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">
        Welcome to StrataWise
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Before you get started, please review and accept our terms.
      </p>

      <Card className="mt-6">
        <CardContent className="pt-5">
          <div className="flex items-start gap-3">
            <Checkbox
              id="legal-consent"
              checked={accepted}
              onCheckedChange={(v) => setAccepted(v === true)}
              className="shrink-0 mt-0.5"
            />
            <p className="text-sm leading-relaxed text-foreground">
              I have read and agree to the{" "}
              <Link href="/legal/terms" target="_blank" rel="noopener noreferrer" className="text-[color:var(--brand-gold)] hover:underline">Terms of Service</Link>
              {" "}and{" "}
              <Link href="/legal/privacy" target="_blank" rel="noopener noreferrer" className="text-[color:var(--brand-gold)] hover:underline">Privacy Policy</Link>.
            </p>
          </div>
        </CardContent>
      </Card>

      <Button
        className="w-full mt-4"
        disabled={!accepted || pending}
        onClick={handleSubmit}
      >
        {pending && <Loader2 className="size-4 animate-spin" />}
        Continue
      </Button>
    </div>
  );
}
