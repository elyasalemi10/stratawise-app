"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Mail, MailOpen, MailX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { saveStep, type DraftJson } from "../actions";

// Wizard Step 2.1 — Communications default.
//
// Single decision: where notices go when an individual lot owner hasn't
// expressed a digital preference. Per-lot consent capture lives on Step 3.2.

type Delivery = "postal" | "mixed" | "email";

const OPTIONS: Array<{ value: Delivery; title: string; icon: typeof Mail; body: string }> = [
  {
    value: "postal",
    title: "Postal only",
    icon: MailX,
    body: "Every notice posted. Legal safest but slow, and the cost of letters is billed to your management company through your communication credits.",
  },
  {
    value: "mixed",
    title: "Mixed (recommended)",
    icon: Mail,
    body: "Email if the lot owner has consented to that category, postal otherwise. Most OCs end up here.",
  },
  {
    value: "email",
    title: "Email by default",
    icon: MailOpen,
    body: "Owners get digital notices unless they explicitly opt out. Only use if every owner has consented.",
  },
];

export function Step2CommsDefault({
  draftId,
  initialDraft,
  onBack,
  onNext,
}: {
  draftId: string;
  initialDraft: DraftJson;
  onBack: () => void;
  onNext: () => void;
}) {
  const [delivery, setDelivery] = useState<Delivery>(
    (initialDraft.default_delivery_method as Delivery | undefined) ?? "postal",
  );
  const [pending, setPending] = useState(false);

  async function onContinue() {
    setPending(true);
    const r = await saveStep(draftId, {
      default_delivery_method: delivery,
    }, 3, 0); // Advance to Step 3 main (Lots).
    if (r.error) {
      setPending(false);
      toast.error(r.error);
      return;
    }
    await onNext();
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-lg font-semibold text-foreground">Communications default</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          How notices are delivered when an owner&apos;s individual digital consent isn&apos;t on file.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {OPTIONS.map((opt) => {
          const Icon = opt.icon;
          const selected = delivery === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => setDelivery(opt.value)}
              className={`text-left rounded-md border p-4 transition-colors cursor-pointer ${
                selected ? "border-primary bg-primary/5" : "border-border bg-card hover:border-primary/40"
              }`}
            >
              <div className="flex items-center gap-2">
                <Icon className="h-5 w-5 text-primary" />
                <h4 className="text-sm font-semibold text-foreground">{opt.title}</h4>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{opt.body}</p>
            </button>
          );
        })}
      </div>

      <div className="rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
        <strong className="text-foreground">Recommended: Mixed.</strong>{" "}
        Posting every notice is legally safest but the cost of letters is billed to your management company through your communication credits. Mixed delivery keeps you compliant and minimises postal spend as owners consent to digital comms.
      </div>

      <div className="flex justify-between pt-2">
        <Button type="button" variant="secondary" onClick={onBack}>Back</Button>
        <Button type="button" onClick={onContinue} disabled={pending}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          Continue
        </Button>
      </div>
    </div>
  );
}
