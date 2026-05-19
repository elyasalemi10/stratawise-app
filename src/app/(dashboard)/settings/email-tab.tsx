"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  ShieldCheck,
  Loader2,
  Unplug,
  CheckCircle2,
  Mail,
  AlertTriangle,
  Info,
  ExternalLink,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { GmailSetupTutorial } from "@/components/shared/gmail-setup-tutorial";
import {
  saveGmailSetup,
  disconnectMailProvider,
  startOutlookConsent,
  saveOutlookMailbox,
} from "./actions";

// Settings → Email tab.
//
// Two visual modes:
//   (A) "Connected" — provider logo, mailbox, sync state, Disconnect +
//       Change-mailbox buttons. Shown whenever mail_provider !== stratawise
//       AND a mailbox was saved (or in the case of gmail, even without one
//       since the domain alone proves intent).
//   (B) "Wizard" — provider picker → domain → tutorial → prefix → Save.
//       Shown when on stratawise (fallback) OR when the user clicks
//       "Change mailbox" from the connected card.
//
// Disconnect simply flips provider back to stratawise. The manager's
// <username>@stratawise.com.au alias is always available as the fallback —
// nothing else is required to make it work.

export interface MailProviderConfig {
  provider: "stratawise" | "gmail" | "outlook";
  domain: string | null;
  configured_at: string | null;
}

export function EmailTab({
  initial,
  oauthClientId,
  initialMailboxPrefix,
  initialOutlookPrefix,
  outlookTenantId,
  stratawiseFallbackEmail,
  dwdRevoked,
  mailboxIntegrationError,
}: {
  initial: MailProviderConfig;
  oauthClientId: string | null;
  initialMailboxPrefix: string;
  initialOutlookPrefix: string;
  // Non-null when the firm's Microsoft 365 admin has already granted
  // consent. Drives the Outlook wizard between "Connect Microsoft 365" and
  // "Enter mailbox prefix" states.
  outlookTenantId: string | null;
  // The manager's <username>@stratawise.com.au alias (always present once
  // they've onboarded). Used as the read-out for "your fallback address".
  stratawiseFallbackEmail: string;
  // Set when gmail_mailbox_subscriptions.last_error matches an auth-shape
  // failure (admin removed the DWD entry). Drives the revoked banner.
  dwdRevoked: boolean;
  mailboxIntegrationError: string | null;
}) {
  const [config, setConfig] = useState<MailProviderConfig>(initial);
  const [mailboxPrefix, setMailboxPrefix] = useState(
    initial.provider === "outlook" ? initialOutlookPrefix : initialMailboxPrefix,
  );
  const [savedMailbox, setSavedMailbox] = useState<string | null>(() => {
    const prefix = initial.provider === "outlook" ? initialOutlookPrefix : initialMailboxPrefix;
    return prefix && initial.domain ? `${prefix}@${initial.domain}` : null;
  });
  const [editing, setEditing] = useState(
    (initial.provider === "gmail" && !initialMailboxPrefix) ||
      (initial.provider === "outlook" && !initialOutlookPrefix),
  );

  // Surface Microsoft-consent callback flags (?outlook_consent=granted or
  // ?outlook_error=...) as toasts so the manager knows whether the
  // round-trip succeeded. The callback already sets mail_provider_config
  // server-side; we just need to acknowledge it in the UI.
  const searchParams = useSearchParams();
  useEffect(() => {
    const consent = searchParams.get("outlook_consent");
    const err = searchParams.get("outlook_error");
    if (consent === "granted") {
      toast.success("Microsoft 365 consent granted — enter your mailbox prefix to finish.");
      setEditing(true);
      const next = new URLSearchParams(searchParams.toString());
      next.delete("outlook_consent");
      window.history.replaceState(null, "", `/settings?${next.toString()}`);
    } else if (err) {
      toast.error(`Microsoft consent failed: ${err.replace(/_/g, " ")}`);
      const next = new URLSearchParams(searchParams.toString());
      next.delete("outlook_error");
      window.history.replaceState(null, "", `/settings?${next.toString()}`);
    }
  }, [searchParams]);

  if (!editing && config.provider !== "stratawise") {
    return (
      <div className="space-y-4">
        {dwdRevoked && (
          <RevokedBanner
            error={mailboxIntegrationError}
            onReconnect={() => setEditing(true)}
          />
        )}
        <ConnectedView
          config={config}
          savedMailbox={savedMailbox}
          stratawiseFallbackEmail={stratawiseFallbackEmail}
          onDisconnected={() => {
            setConfig({ provider: "stratawise", domain: null, configured_at: null });
            setMailboxPrefix("");
            setSavedMailbox(null);
          }}
        />
      </div>
    );
  }

  if (!editing && config.provider === "stratawise") {
    return (
      <StratawiseDefaultView
        stratawiseFallbackEmail={stratawiseFallbackEmail}
        onConnect={() => setEditing(true)}
      />
    );
  }

  return (
    <Wizard
      config={config}
      mailboxPrefix={mailboxPrefix}
      oauthClientId={oauthClientId}
      outlookTenantId={outlookTenantId}
      stratawiseFallbackEmail={stratawiseFallbackEmail}
      onMailboxPrefixChange={setMailboxPrefix}
      onProviderChange={(provider, domain) =>
        setConfig((prev) => ({ ...prev, provider, domain: domain ?? prev.domain }))
      }
      onSaved={(mailbox, domain, provider) => {
        setSavedMailbox(mailbox);
        setConfig({
          provider,
          domain,
          configured_at: new Date().toISOString(),
        });
        setEditing(false);
      }}
      onCancel={
        initial.provider !== "stratawise" && savedMailbox
          ? () => setEditing(false)
          : undefined
      }
    />
  );
}

// ─── Connected view (status card with Disconnect + Change mailbox) ───────

function ConnectedView({
  config,
  savedMailbox,
  stratawiseFallbackEmail,
  onDisconnected,
}: {
  config: MailProviderConfig;
  savedMailbox: string | null;
  stratawiseFallbackEmail: string;
  onDisconnected: () => void;
}) {
  const [pending, setPending] = useState(false);

  async function handleDisconnect() {
    setPending(true);
    const res = await disconnectMailProvider();
    setPending(false);
    if ("error" in res) {
      toast.error(res.error);
      return;
    }
    toast.success(`Switched back to ${stratawiseFallbackEmail}`);
    onDisconnected();
  }

  const providerLogo =
    config.provider === "gmail"
      ? "/logos/gmail.webp"
      : config.provider === "outlook"
        ? "/logos/outlook.webp"
        : null;
  const providerLabel =
    config.provider === "gmail"
      ? "Gmail · Google Workspace"
      : config.provider === "outlook"
        ? "Outlook · Microsoft 365"
        : "StrataWise";

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-5 space-y-5">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-border bg-card">
              {providerLogo ? (
                <Image
                  src={providerLogo}
                  alt=""
                  width={28}
                  height={28}
                  className="size-7 object-contain"
                />
              ) : (
                <Mail className="size-6 text-primary" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">
                {providerLabel}
              </p>
              {savedMailbox && (
                <p className="text-sm text-foreground break-all font-mono">
                  {savedMailbox}
                </p>
              )}
              <div className="mt-1 flex items-center gap-1.5 text-xs text-[hsl(160,100%,28%)]">
                <CheckCircle2 className="size-3.5" />
                Connected
                {config.configured_at && (
                  <span className="text-muted-foreground">
                    · since {new Date(config.configured_at).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-md border border-border bg-cool-muted p-3 text-xs text-muted-foreground">
            <p>
              <span className="font-medium text-foreground">Fallback:</span>{" "}
              <span className="font-mono">{stratawiseFallbackEmail}</span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDisconnect}
              disabled={pending}
            >
              {pending ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Unplug className="mr-1.5 h-3.5 w-3.5" />
              )}
              Disconnect
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Default state (no 3rd-party mailbox connected) ────────────────────
// Reads as "you're already set up, here's your address, want to send from
// your own firm instead?" rather than dumping the manager straight into a
// blank wizard. Disconnecting always lands back here.
function StratawiseDefaultView({
  stratawiseFallbackEmail,
  onConnect,
}: {
  stratawiseFallbackEmail: string;
  onConnect: () => void;
}) {
  return (
    <Card>
      <CardContent className="pt-5 space-y-5">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-border bg-card">
            <Mail className="size-6 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground">StrataWise email</p>
            <p className="text-sm text-foreground break-all font-mono">
              {stratawiseFallbackEmail}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              You&apos;re using your free StrataWise address. Outbound mail to
              owners goes from here, replies come back to your inbox.
            </p>
          </div>
        </div>

        <div className="rounded-md border border-border bg-cool-muted p-3 text-xs text-muted-foreground">
          Want owners to see your firm&apos;s own domain instead? Connect a
          Gmail or Outlook mailbox under your firm. We only{" "}
          <span className="font-medium text-foreground">read</span> and{" "}
          <span className="font-medium text-foreground">send</span> — we never
          delete anything.
        </div>

        <div>
          <Button size="sm" onClick={onConnect}>
            Connect a third-party mailbox
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Wizard view (provider picker → domain → tutorial → prefix → save) ──

function Wizard({
  config,
  mailboxPrefix,
  oauthClientId,
  outlookTenantId,
  stratawiseFallbackEmail,
  onMailboxPrefixChange,
  onProviderChange,
  onSaved,
  onCancel,
}: {
  config: MailProviderConfig;
  mailboxPrefix: string;
  oauthClientId: string | null;
  outlookTenantId: string | null;
  stratawiseFallbackEmail: string;
  onMailboxPrefixChange: (v: string) => void;
  onProviderChange: (provider: MailProviderConfig["provider"], domain?: string | null) => void;
  onSaved: (mailbox: string, domain: string, provider: "gmail" | "outlook") => void;
  onCancel?: () => void;
}) {
  const [provider, setProvider] = useState<MailProviderConfig["provider"]>(
    config.provider === "stratawise" ? "gmail" : config.provider,
  );
  const [domain, setDomain] = useState(config.domain ?? "");
  const [pending, setPending] = useState(false);
  const [consentPending, setConsentPending] = useState(false);
  const [errorResult, setErrorResult] = useState<{ message: string; reason?: string } | null>(null);

  // Outlook is a two-leg flow: admin consent (sets tenant_id) then save
  // mailbox. We've already granted consent once the server reports a
  // tenant_id on mail_provider_config.
  const outlookConsentGranted = !!outlookTenantId;

  const mailboxPreview = useMemo(() => {
    const p = mailboxPrefix.trim().toLowerCase();
    const d = domain.trim().toLowerCase();
    if (!p || !d) return "";
    return `${p}@${d}`;
  }, [mailboxPrefix, domain]);

  function sanitizeDomain(raw: string): string {
    return raw
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .replace(/\/.*$/, "");
  }

  async function handleConnectMicrosoft() {
    const cleanDomain = sanitizeDomain(domain);
    if (!cleanDomain) {
      toast.error("Enter your firm's email domain first.");
      return;
    }
    setConsentPending(true);
    const res = await startOutlookConsent({ domain: cleanDomain });
    setConsentPending(false);
    if ("error" in res && res.error) {
      toast.error(res.error);
      return;
    }
    if ("consentUrl" in res && res.consentUrl) {
      // The server action already set an httpOnly CSRF cookie — just kick
      // the browser to Microsoft's admin-consent screen.
      window.location.href = res.consentUrl;
    }
  }

  async function handleSave() {
    const cleanDomain = sanitizeDomain(domain);
    if (!cleanDomain) {
      toast.error("Enter your firm's email domain.");
      return;
    }
    if (provider === "gmail" && !mailboxPrefix.trim()) {
      toast.error("Enter your mailbox prefix (the part before the @).");
      return;
    }
    if (provider === "outlook" && !mailboxPrefix.trim()) {
      toast.error("Enter your mailbox prefix (the part before the @).");
      return;
    }
    setPending(true);
    setErrorResult(null);

    if (provider === "outlook") {
      const res = await saveOutlookMailbox({ mailboxPrefix: mailboxPrefix.trim() });
      setPending(false);
      if ("error" in res && res.error) {
        setErrorResult({ message: res.error, reason: (res as { reason?: string }).reason });
        toast.error(res.error);
        return;
      }
      if ("mailbox" in res && res.mailbox) {
        toast.success("Outlook mailbox connected");
        onSaved(res.mailbox, cleanDomain, "outlook");
      }
      return;
    }

    onProviderChange(provider, cleanDomain);
    const res = await saveGmailSetup({
      provider,
      domain: cleanDomain,
      mailboxPrefix: provider === "gmail" ? mailboxPrefix.trim() : null,
    });
    setPending(false);
    if ("error" in res && res.error) {
      setErrorResult({
        message: res.error,
        reason: (res as { reason?: string }).reason,
      });
      toast.error(res.error);
      return;
    }
    if (provider === "gmail" && "mailbox" in res && res.mailbox) {
      toast.success("Email setup saved");
      onSaved(res.mailbox, cleanDomain, "gmail");
      return;
    }
  }

  return (
    <TooltipProvider delay={120}>
      <div className="space-y-6">
      <Card>
        <CardContent className="pt-5 space-y-5">
          <div>
            <h3 className="text-base font-semibold text-foreground">
              Connect a mailbox
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Pick your provider, follow the steps, and Save. Outbound mail
              starts going from your firm immediately.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <ProviderTile
              label="Gmail"
              sub="Google Workspace"
              logo="/logos/gmail.webp"
              selected={provider === "gmail"}
              onClick={() => setProvider("gmail")}
            />
            <ProviderTile
              label="Outlook"
              sub="Microsoft 365"
              logo="/logos/outlook.webp"
              selected={provider === "outlook"}
              onClick={() => setProvider("outlook")}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="mail-domain" className="inline-flex items-center gap-1">
              Email domain <span className="text-destructive">*</span>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <button
                      type="button"
                      aria-label="What is this?"
                      className="inline-flex items-center justify-center text-muted-foreground hover:text-foreground cursor-help"
                    />
                  }
                >
                  <Info className="size-3.5" />
                </TooltipTrigger>
                <TooltipContent>
                  The bit after the @ in your business email.
                </TooltipContent>
              </Tooltip>
            </Label>
            <Input
              id="mail-domain"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="Firm domain"
            />
          </div>

          {provider === "gmail" && (
            <>
              <GmailSetupTutorial oauthClientId={oauthClientId} />

              <div className="space-y-1.5">
                <Label htmlFor="mailbox-prefix">
                  Your mailbox prefix <span className="text-destructive">*</span>
                </Label>
                <div className="flex items-center gap-1">
                  <Input
                    id="mailbox-prefix"
                    value={mailboxPrefix}
                    onChange={(e) => onMailboxPrefixChange(e.target.value)}
                    placeholder="Mailbox prefix"
                    className="w-44"
                  />
                  <span className="text-sm text-muted-foreground whitespace-nowrap">
                    @{domain ? sanitizeDomain(domain) : "yourfirm.com.au"}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Outbound sends will come from{" "}
                  <span className="font-mono">
                    {mailboxPreview || "yourname@yourfirm.com.au"}
                  </span>
                  .
                </p>
              </div>
            </>
          )}

          {provider === "outlook" && (
            <OutlookConnect
              tenantConsented={outlookConsentGranted}
              domain={sanitizeDomain(domain)}
              mailboxPrefix={mailboxPrefix}
              onMailboxPrefixChange={onMailboxPrefixChange}
              onConnectMicrosoft={handleConnectMicrosoft}
              consentPending={consentPending}
              mailboxPreview={mailboxPreview}
            />
          )}

          <ReadWriteDisclosure stratawiseFallbackEmail={stratawiseFallbackEmail} />

          {errorResult && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
              <AlertTriangle className="size-4 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-medium">{errorResult.message}</p>
                <p className="opacity-80">
                  Google sometimes takes a few minutes (up to 24h in rare cases) to
                  propagate the grant — wait and try Save again.
                </p>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
            {onCancel && (
              <Button variant="secondary" size="sm" onClick={onCancel} disabled={pending}>
                Cancel
              </Button>
            )}
            {/* Outlook hides Save until admin consent is granted — the
                inline OutlookConnect block owns that leg of the flow. */}
            {!(provider === "outlook" && !outlookConsentGranted) && (
              <Button size="sm" onClick={handleSave} disabled={pending}>
                {pending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                Save
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
      </div>
    </TooltipProvider>
  );
}

function ProviderTile({
  label,
  sub,
  logo,
  selected,
  onClick,
}: {
  label: string;
  sub: string;
  logo: string;
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
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border bg-card">
        <Image src={logo} alt="" width={24} height={24} className="size-6 object-contain" />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground">{sub}</p>
      </div>
    </button>
  );
}

function OutlookConnect({
  tenantConsented,
  domain,
  mailboxPrefix,
  onMailboxPrefixChange,
  onConnectMicrosoft,
  consentPending,
  mailboxPreview,
}: {
  tenantConsented: boolean;
  domain: string;
  mailboxPrefix: string;
  onMailboxPrefixChange: (v: string) => void;
  onConnectMicrosoft: () => void;
  consentPending: boolean;
  mailboxPreview: string;
}) {
  // Two-leg flow:
  //   (1) Pre-consent: admin clicks "Connect Microsoft 365" → redirected to
  //       login.microsoftonline.com/adminconsent → callback drops tenant_id
  //       on management_companies.mail_provider_config.
  //   (2) Post-consent: admin enters the mailbox prefix to actually send
  //       and subscribe as. saveOutlookMailbox tests Mail.Send + creates
  //       the Graph change-notification subscription.
  if (!tenantConsented) {
    return (
      <div className="space-y-3 rounded-md border border-border bg-cool-muted p-4 text-sm">
        <div className="space-y-1">
          <p className="font-medium text-foreground">
            Step 1 — Authorise StrataWise in Microsoft 365
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            We&apos;ll redirect you to your Microsoft 365 admin consent screen.
            Approve the <span className="font-mono">Mail.Send</span> and{" "}
            <span className="font-mono">Mail.ReadWrite</span> permissions, then
            you&apos;ll be brought back here to finish setup.
          </p>
        </div>
        <div>
          <Button size="sm" onClick={onConnectMicrosoft} disabled={consentPending || !domain}>
            {consentPending ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
            )}
            Connect Microsoft 365
          </Button>
          {!domain && (
            <p className="mt-2 text-xs text-muted-foreground">
              Enter your firm&apos;s domain above first.
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-md border border-[hsl(160,80%,40%)]/30 bg-[hsl(160,80%,40%)]/5 p-3 text-xs">
        <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-[hsl(160,100%,28%)]" />
        <div>
          <p className="font-medium text-foreground">
            Microsoft 365 admin consent granted
          </p>
          <p className="mt-0.5 text-muted-foreground">
            StrataWise can now send and read mail in your tenant. Last step —
            tell us which mailbox to use.
          </p>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="outlook-mailbox-prefix">
          Step 2 — Your mailbox prefix <span className="text-destructive">*</span>
        </Label>
        <div className="flex items-center gap-1">
          <Input
            id="outlook-mailbox-prefix"
            value={mailboxPrefix}
            onChange={(e) => onMailboxPrefixChange(e.target.value)}
            placeholder="Mailbox prefix"
            className="w-44"
          />
          <span className="text-sm text-muted-foreground whitespace-nowrap">
            @{domain || "yourfirm.com.au"}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          Outbound sends will come from{" "}
          <span className="font-mono">
            {mailboxPreview || "yourname@yourfirm.com.au"}
          </span>
          .
        </p>
      </div>
    </div>
  );
}

// Surfaces when gmail_mailbox_subscriptions.last_error is an auth-shape
// failure — i.e. the Workspace admin removed our DWD entry, the firm's
// IT changed the OAuth scopes, or Google revoked the grant for some
// other reason. Without this banner outbound mail silently falls back
// to the @stratawise.com.au alias and inbound just goes dark, which
// is a poor user experience.
function RevokedBanner({
  error,
  onReconnect,
}: {
  error: string | null;
  onReconnect: () => void;
}) {
  return (
    <div className="flex items-start gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm">
      <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5 text-destructive" />
      <div className="flex-1 space-y-2">
        <div>
          <p className="font-medium text-destructive">Gmail connection needs reconnecting</p>
          <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
            Your Workspace admin appears to have removed StrataWise from
            Domain-Wide Delegation, or Google revoked our grant. Outbound
            mail has fallen back to your StrataWise alias and inbox sync
            is paused until you reconnect.
          </p>
          {error && (
            <p className="mt-1 text-xs text-muted-foreground/80 font-mono break-all">
              {error}
            </p>
          )}
        </div>
        <Button size="sm" onClick={onReconnect}>
          Reconnect
        </Button>
      </div>
    </div>
  );
}

function ReadWriteDisclosure({ stratawiseFallbackEmail }: { stratawiseFallbackEmail: string }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-border bg-card p-3 text-xs">
      <ShieldCheck className="h-4 w-4 shrink-0 text-[color:var(--brand-gold)]" />
      <div>
        <p className="font-medium text-foreground">We won&apos;t delete anything.</p>
        <p className="mt-0.5 text-muted-foreground">
          StrataWise only{" "}
          <span className="font-medium text-foreground">reads</span> and{" "}
          <span className="font-medium text-foreground">sends</span> email. We
          don&apos;t move messages, change labels you set, or empty folders.
          You can revoke access from your admin console at any time —
          disconnecting here also flips you back to{" "}
          <span className="font-mono">{stratawiseFallbackEmail}</span>.
        </p>
      </div>
    </div>
  );
}
