"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CopyPill } from "@/components/shared/copy-pill";
import { GMAIL_SCOPES_STRING } from "@/lib/google/gmail-scopes";
import { cn } from "@/lib/utils";
import { saveMailProvider, getGmailOauthClientId } from "./actions";

// Where the firm's outbound mail comes from.
//
//   - stratawise: <username>@stratawise.com.au , nothing to set up
//   - gmail: their own Workspace mailbox via Domain-Wide Delegation
//
// Two screens, not one. The choice is a choice; the Gmail setup is a job
// with a Client ID to copy and a scope string to paste, and stacking it
// under the picker meant the page grew a second half the moment you clicked
// the right-hand option, with the instructions in a card inside a card
// inside the step. Picking Gmail advances to its own screen, which is one
// numbered list and the two things you copy.

type Screen = "choose" | "gmail";

export function StepMailProvider({
  onNext,
  onBack,
}: {
  onNext: () => void;
  onBack: () => void;
}) {
  const [screen, setScreen] = useState<Screen>("choose");
  const [domain, setDomain] = useState("");
  const [domainInvalid, setDomainInvalid] = useState(false);
  const [pending, setPending] = useState(false);
  const [clientId, setClientId] = useState<string | null>(null);

  useEffect(() => {
    getGmailOauthClientId().then(setClientId);
  }, []);

  async function save(provider: "stratawise" | "gmail") {
    if (provider === "gmail" && !domain.trim()) {
      setDomainInvalid(true);
      toast.error("Enter your firm's email domain.");
      return;
    }
    setPending(true);
    const res = await saveMailProvider({
      provider,
      domain: provider === "stratawise" ? null : domain.trim(),
    });
    if ("error" in res) {
      setPending(false);
      toast.error(res.error);
      return;
    }
    onNext();
  }

  if (screen === "gmail") {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-foreground">
            Connect your Gmail
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            One trip to your Google admin console. You can do it later from
            Settings , email still sends in the meantime.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="mail-domain">
            Your email domain <span className="text-destructive">*</span>
          </Label>
          <Input
            id="mail-domain"
            value={domain}
            onChange={(e) => { setDomain(e.target.value); if (domainInvalid) setDomainInvalid(false); }}
            aria-invalid={domainInvalid || undefined}
            placeholder="Email domain"
          />
        </div>

        {/* One numbered list, no nested cards. The two things that are
            actually copied sit inline at the step that needs them, rather
            than being promised "on the next page". */}
        <ol className="space-y-4 border-t border-border pt-5 text-sm">
          <Step n={1}>
            Sign in to <span className="font-mono">admin.google.com</span> as a
            super admin.
          </Step>
          <Step n={2}>
            Go to Security → Access and data control → API controls, then
            Manage Domain Wide Delegation.
          </Step>
          <Step n={3}>
            Click Add new and paste this Client ID:
            {clientId ? (
              <CopyPill value={clientId} className="mt-2" />
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">
                Your Client ID will be in Settings → Email once setup finishes.
              </p>
            )}
          </Step>
          <Step n={4}>
            Paste these scopes:
            <CopyPill value={GMAIL_SCOPES_STRING} className="mt-2" />
          </Step>
          <Step n={5}>Click Authorise.</Step>
        </ol>

        <p className="text-xs text-muted-foreground">
          These scopes let us send as your managers and read replies. We never
          delete or move anything in a mailbox.
        </p>

        <div className="flex items-center justify-between">
          <Button type="button" variant="secondary" onClick={() => setScreen("choose")}>
            <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
            Back
          </Button>
          <Button type="button" onClick={() => save("gmail")} disabled={pending} loading={pending}>
            Finish setup
            <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-foreground">
          Where should your email come from?
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Pick one. You can change or disconnect anytime in Settings.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <ProviderChoice
          logo="/stratawise-icon.webp"
          logoAlt="StrataWise"
          title="Send from StrataWise"
          address="yourname@stratawise.com.au"
          blurb="Nothing to set up. Replies land in your StrataWise inbox."
          pending={pending}
          onClick={() => save("stratawise")}
        />
        <ProviderChoice
          logo="/logos/gmail.webp"
          logoAlt="Gmail"
          title="Send from your Gmail"
          address="yourname@yourfirm.com.au"
          blurb="Mail goes out from your real address. One setup step in your Google admin console."
          pending={pending}
          onClick={() => setScreen("gmail")}
        />
      </div>

      <div className="flex items-center justify-between">
        <Button type="button" variant="secondary" onClick={onBack} disabled={pending}>
          <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
          Back
        </Button>
      </div>
    </div>
  );
}

function ProviderChoice({
  logo,
  logoAlt,
  title,
  address,
  blurb,
  pending,
  onClick,
}: {
  logo: string;
  logoAlt: string;
  title: string;
  address: string;
  blurb: string;
  pending: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className={cn(
        "flex h-full flex-col items-start gap-3 rounded-lg border-2 border-border bg-card p-5 text-left transition-colors cursor-pointer",
        "hover:border-[color:var(--brand-gold)] disabled:cursor-not-allowed disabled:opacity-60",
      )}
    >
      <Image src={logo} alt={logoAlt} width={32} height={32} className="h-8 w-auto" />
      <div className="flex-1">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="mt-0.5 font-mono text-xs text-muted-foreground">{address}</p>
        <p className="mt-2 text-xs text-muted-foreground">{blurb}</p>
      </div>
    </button>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
        {n}
      </span>
      <div className="min-w-0 flex-1 text-foreground">{children}</div>
    </li>
  );
}
