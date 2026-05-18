"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Pill-shaped read-only field with a brand-gold copy button. Used in the
// Gmail setup tutorial for the GCP Client ID + OAuth scopes — they're long
// strings managers paste into Google Workspace admin, so the copy affordance
// has to be obvious.
//
// Less-round corners (rounded-md) per the project rule that rounded-full is
// reserved for avatars and badges. Brand-gold accent on the copy button
// matches the rest of the sidebar-active / PDF-accent palette.
export function CopyPill({
  value,
  label,
  className,
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }

  return (
    <div className={cn("space-y-1", className)}>
      {label && (
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
      )}
      <div className="flex h-10 items-center overflow-hidden rounded-md border border-border bg-card pl-3 pr-1">
        <p className="flex-1 truncate font-mono text-xs text-foreground">
          {value}
        </p>
        <Button
          size="icon"
          onClick={handleCopy}
          className="h-7 w-7 rounded-md bg-[color:var(--brand-gold)] text-white hover:bg-[color:var(--brand-gold)]/90 focus-visible:ring-[color:var(--brand-gold)]/30"
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          <span className="sr-only">Copy {label ?? "value"}</span>
        </Button>
      </div>
    </div>
  );
}
