"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { recordOcConsent } from "./actions";

// The 5 digital-communication categories (mirrors the manager-side wizard
// list). Consent is recorded PER OC , the owner confirms which of these they
// agree to receive electronically for this specific Owners Corporation.
const CATEGORIES: Array<{ value: string; label: string; hint: string }> = [
  { value: "meetings", label: "Meeting notices and minutes", hint: "AGMs, special and committee meetings." },
  { value: "levies", label: "Levy notices", hint: "Quarterly/annual levies and arrears reminders." },
  { value: "breach", label: "Breach notices", hint: "Notices about rule breaches , legally significant." },
  { value: "financial_reports", label: "Financial reports", hint: "Annual financial statements and budgets." },
  { value: "general_correspondence", label: "General correspondence", hint: "Routine updates and notifications." },
];

export function OcConsentStep({
  ocId,
  ocName,
  initialCategories,
}: {
  ocId: string;
  ocName: string;
  initialCategories: string[];
}) {
  const [checked, setChecked] = useState<Set<string>>(
    () => new Set(initialCategories.length ? initialCategories : CATEGORIES.map((c) => c.value)),
  );
  const [pending, setPending] = useState(false);

  function toggle(v: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(v)) next.delete(v);
      else next.add(v);
      return next;
    });
  }

  const allChecked = checked.size === CATEGORIES.length;

  async function handleSubmit() {
    setPending(true);
    const result = await recordOcConsent(ocId, [...checked]);
    if (result.error) {
      setPending(false);
      toast.error(result.error);
      return;
    }
    // Re-enter the router: it advances to the next OC needing consent, or to
    // the dashboard (with the welcome confetti) once they're all done.
    window.location.href = "/onboarding/lot-owner";
  }

  return (
    <div className="max-w-lg mx-auto py-12 px-4">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">
        Communication preferences
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        For <span className="font-medium text-foreground">{ocName}</span>, choose
        which communications you&apos;re happy to receive electronically. You
        can change these later in your portal settings.
      </p>

      <Card className="mt-6">
        <CardContent className="space-y-1 pt-5">
          <div className="flex items-center gap-3 rounded-md border border-border bg-muted/30 px-3 py-2">
            <Checkbox
              checked={allChecked}
              onCheckedChange={(v) =>
                setChecked(v === true ? new Set(CATEGORIES.map((c) => c.value)) : new Set())
              }
              className="bg-card"
            />
            <Label className="text-sm font-medium text-foreground">All communications</Label>
          </div>
          {CATEGORIES.map((c) => (
            <div key={c.value} className="flex items-start gap-3 px-1 py-2">
              <Checkbox
                checked={checked.has(c.value)}
                onCheckedChange={() => toggle(c.value)}
                className="bg-card mt-0.5"
              />
              <div className="-mt-0.5">
                <Label className="text-sm text-foreground">{c.label}</Label>
                <p className="text-xs text-muted-foreground">{c.hint}</p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <p className="mt-3 text-xs text-muted-foreground">
        Anything you don&apos;t select will be sent to you by post instead.
      </p>

      <Button className="w-full mt-4" disabled={pending} onClick={handleSubmit}>
        {pending && <Loader2 className="size-4 animate-spin" />}
        Confirm preferences
      </Button>
    </div>
  );
}
