"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  Mail,
  Globe,
  ShieldCheck,
  Loader2,
  Unplug,
  Copy,
  Check,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  updateMailProvider,
  disconnectMailProvider,
  testGmailMailbox,
} from "./actions";

// Settings → Email tab. Lets the manager (admins only) swap or disconnect
// their mail provider after onboarding. Disconnecting falls back to
// stratawise so outbound mail never breaks silently.

export interface MailProviderConfig {
  provider: "stratawise" | "gmail" | "outlook";
  domain: string | null;
  configured_at: string | null;
}

export function EmailTab({
  initial,
  oauthClientId,
}: {
  initial: MailProviderConfig;
  // The 21-digit GCP service account Client ID customers paste into their
  // Workspace admin (passed in from the server page via env). Null = the
  // platform hasn't configured Gmail yet; we hide the copy button + show
  // a "coming soon" line in that case.
  oauthClientId: string | null;
}) {
  const [provider, setProvider] = useState<MailProviderConfig["provider"]>(
    initial.provider,
  );
  const [domain, setDomain] = useState(initial.domain ?? "");
  const [pending, setPending] = useState(false);

  async function handleSave() {
    if (provider !== "stratawise" && !domain.trim()) {
      toast.error("Enter your firm's email domain.");
      return;
    }
    setPending(true);
    const res = await updateMailProvider({
      provider,
      domain: provider === "stratawise" ? null : domain.trim(),
    });
    setPending(false);
    if ("error" in res) {
      toast.error(res.error);
      return;
    }
    toast.success("Email provider saved");
  }

  async function handleDisconnect() {
    setPending(true);
    const res = await disconnectMailProvider();
    setPending(false);
    if ("error" in res) {
      toast.error(res.error);
      return;
    }
    setProvider("stratawise");
    setDomain("");
    toast.success("Switched back to stratawise.com.au");
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-5 space-y-5">
          <div>
            <h3 className="text-base font-semibold text-foreground">
              Where outbound email is sent from
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Pick one. Disconnecting your own mailbox falls back to{" "}
              <span className="font-mono">yourname@stratawise.com.au</span>{" "}
              automatically.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <ProviderTile
              label="StrataWise"
              sub="yourname@stratawise.com.au"
              icon={Mail}
              selected={provider === "stratawise"}
              onClick={() => setProvider("stratawise")}
            />
            <ProviderTile
              label="Gmail"
              sub="Google Workspace"
              icon={Globe}
              selected={provider === "gmail"}
              onClick={() => setProvider("gmail")}
            />
            <ProviderTile
              label="Outlook"
              sub="Microsoft 365"
              icon={Globe}
              selected={provider === "outlook"}
              onClick={() => setProvider("outlook")}
            />
          </div>

          {provider !== "stratawise" && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="mail-domain">
                  Email domain <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="mail-domain"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  placeholder="acmestrata.com.au"
                />
                <p className="text-xs text-muted-foreground">
                  The bit after the <span className="font-mono">@</span> in
                  your firm&apos;s email address.
                </p>
              </div>

              {provider === "gmail" && (
                <GmailAuthorisationCard oauthClientId={oauthClientId} />
              )}
              {provider === "outlook" && <OutlookAuthorisationCard />}

              <ReadWriteDisclosure />
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <div>
              {initial.provider !== "stratawise" && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleDisconnect}
                  disabled={pending}
                >
                  <Unplug className="mr-1.5 h-3.5 w-3.5" />
                  Disconnect & fall back to StrataWise
                </Button>
              )}
            </div>
            <Button size="sm" onClick={handleSave} disabled={pending}>
              {pending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Save
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ProviderTile({
  label,
  sub,
  icon: Icon,
  selected,
  onClick,
}: {
  label: string;
  sub: string;
  icon: React.ElementType;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-start gap-3 rounded-md border-2 bg-card p-3 text-left transition-colors cursor-pointer",
        selected
          ? "border-[color:var(--brand-gold)]"
          : "border-border hover:border-primary/40",
      )}
    >
      <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground">{sub}</p>
      </div>
    </button>
  );
}

function GmailAuthorisationCard({
  oauthClientId,
}: {
  oauthClientId: string | null;
}) {
  const [copied, setCopied] = useState<"id" | "scopes" | null>(null);
  const scopes =
    "https://www.googleapis.com/auth/gmail.send,https://www.googleapis.com/auth/gmail.modify";

  function copy(text: string, which: "id" | "scopes") {
    navigator.clipboard.writeText(text);
    setCopied(which);
    setTimeout(() => setCopied(null), 2000);
  }

  if (!oauthClientId) {
    return (
      <div className="rounded-md border border-warning/30 bg-warning/5 p-3 text-xs text-foreground">
        Gmail send-as is being rolled out. Save your domain choice now — we
        will email you the Workspace admin steps as soon as it&apos;s live
        for your firm.
      </div>
    );
  }

  return (
    <div className="rounded-md border border-border bg-cool-muted p-4 text-xs text-foreground space-y-3">
      <p className="font-medium uppercase tracking-wide text-muted-foreground">
        Authorise StrataWise in Google Workspace admin
      </p>
      <ol className="list-decimal pl-4 space-y-1 leading-relaxed">
        <li>
          Sign into <span className="font-mono">admin.google.com</span> as a
          super admin.
        </li>
        <li>
          Menu → Security → Access and data control → <em>API controls</em>.
        </li>
        <li>
          Click <em>Manage Domain Wide Delegation</em> → <em>Add new</em>.
        </li>
        <li>
          Paste the Client ID below.
        </li>
        <li>Paste the OAuth scopes below.</li>
        <li>Click Authorize.</li>
      </ol>

      <CopyRow
        label="Client ID"
        value={oauthClientId}
        onCopy={() => copy(oauthClientId, "id")}
        copied={copied === "id"}
      />
      <CopyRow
        label="OAuth scopes"
        value={scopes}
        onCopy={() => copy(scopes, "scopes")}
        copied={copied === "scopes"}
      />

      <TestConnectionRow />

      <p className="text-muted-foreground">
        Usually works in minutes; Google sometimes takes up to 24 hours to
        propagate the grant.
      </p>
    </div>
  );
}

function TestConnectionRow() {
  const [target, setTarget] = useState("");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<
    | { ok: true; email: string; messagesTotal: number | null }
    | { ok: false; message: string; reason: string }
    | null
  >(null);

  async function handleTest() {
    if (!target.trim()) {
      toast.error("Enter a mailbox on your domain to test.");
      return;
    }
    setPending(true);
    setResult(null);
    const res = await testGmailMailbox({ managerEmail: target.trim() });
    setPending(false);
    if ("ok" in res && res.ok) {
      setResult({
        ok: true,
        email: res.email,
        messagesTotal: res.messagesTotal,
      });
    } else if ("error" in res) {
      setResult({
        ok: false,
        message: res.error,
        reason: (res as { reason?: string }).reason ?? "",
      });
    }
  }

  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        Test connection
      </p>
      <div className="flex items-center gap-2">
        <Input
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          placeholder="you@yourfirm.com.au"
          className="h-9"
        />
        <Button size="sm" onClick={handleTest} disabled={pending}>
          {pending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
          Test
        </Button>
      </div>
      {result?.ok && (
        <p className="text-xs text-[hsl(160,100%,28%)]">
          Connected as <span className="font-mono">{result.email}</span>
          {result.messagesTotal !== null
            ? ` · ${result.messagesTotal} messages in mailbox`
            : ""}
          .
        </p>
      )}
      {result && !result.ok && (
        <p className="text-xs text-destructive">
          {result.message}
          {result.reason ? ` (${result.reason})` : ""}
        </p>
      )}
    </div>
  );
}

function CopyRow({
  label,
  value,
  onCopy,
  copied,
}: {
  label: string;
  value: string;
  onCopy: () => void;
  copied: boolean;
}) {
  return (
    <div className="space-y-1">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div className="flex items-center gap-2 rounded-md border border-border bg-card px-2 py-1.5">
        <code className="flex-1 truncate font-mono text-[11px]">{value}</code>
        <button
          type="button"
          onClick={onCopy}
          className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label={`Copy ${label}`}
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
        </button>
      </div>
    </div>
  );
}

function OutlookAuthorisationCard() {
  return (
    <div className="rounded-md border border-border bg-cool-muted p-4 text-xs text-foreground space-y-2">
      <p className="font-medium uppercase tracking-wide text-muted-foreground">
        Authorise StrataWise in Microsoft 365 admin
      </p>
      <p className="leading-relaxed">
        We&apos;ll send your tenant admin a one-click consent URL after you
        save. They approve <span className="font-mono">Mail.Send</span> and{" "}
        <span className="font-mono">Mail.ReadWrite</span> at the tenant
        level and your firm is live.
      </p>
      <p className="text-muted-foreground">
        Outlook send-as ships behind a feature flag for now — your domain
        choice is saved; we&apos;ll enable transport for your firm shortly.
      </p>
    </div>
  );
}

function ReadWriteDisclosure() {
  return (
    <div className="flex items-start gap-2 rounded-md border border-border bg-card p-3 text-xs">
      <ShieldCheck className="h-4 w-4 shrink-0 text-[color:var(--brand-gold)]" />
      <div>
        <p className="font-medium text-foreground">
          We won&apos;t delete anything.
        </p>
        <p className="mt-0.5 text-muted-foreground">
          StrataWise only{" "}
          <span className="font-medium text-foreground">reads</span> and{" "}
          <span className="font-medium text-foreground">sends</span> email.
          We don&apos;t move messages, change labels you set, or empty
          folders. You can revoke access from your admin console at any
          time — disconnecting here also flips you back to{" "}
          <span className="font-mono">yourname@stratawise.com.au</span>.
        </p>
      </div>
    </div>
  );
}
