"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { recordLotOwnerConsent } from "./actions";

// Single combined consent on lot-owner onboarding. The original page had
// two checkboxes (terms + privacy) which felt like ceremony — managers
// reported owners bouncing here. The links stay clickable and open in a
// new tab; the checkbox itself isn't toggled by clicking the label copy
// (per CLAUDE.md: htmlFor must NOT be paired to a checkbox id).

export default function LotOwnerOnboardingPage() {
  const [accepted, setAccepted] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleSubmit() {
    if (!accepted) return;
    setPending(true);
    const result = await recordLotOwnerConsent();

    if (result.error) {
      // Only drop the loading state on FAILURE. On success we keep the
      // button spinning through the navigation so the user never sees a
      // "loaded → idle → redirect" flicker (the pattern the team hates).
      setPending(false);
      toast.error(result.error);
      return;
    }

    // ?welcome=1 triggers the dashboard's WelcomeConfetti once, then it
    // strips the param so a refresh doesn't replay. Spinner stays on
    // until the new page paints.
    window.location.href = "/dashboard?welcome=1";
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
          <div className="flex items-center gap-3">
            <Checkbox
              id="legal-consent"
              checked={accepted}
              onCheckedChange={(v) => setAccepted(v === true)}
              className="shrink-0"
            />
            {/* Single flowing line — the previous markup let every link /
                text fragment wrap independently, producing an ugly
                column of one-word lines. Wrapping the whole sentence in
                one <span> keeps it as a normal paragraph that wraps at
                natural word boundaries. */}
            <Label className="text-sm leading-relaxed text-foreground">
              I have read and agree to the{" "}
              <Link href="/legal/terms" target="_blank" rel="noopener noreferrer" className="text-[color:var(--brand-gold)] hover:underline">Terms of Service</Link>
              {" "}and{" "}
              <Link href="/legal/privacy" target="_blank" rel="noopener noreferrer" className="text-[color:var(--brand-gold)] hover:underline">Privacy Policy</Link>.
            </Label>
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
