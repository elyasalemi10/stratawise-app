"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, Check, ExternalLink, Landmark } from "lucide-react";
import { toast } from "sonner";
import {
  disconnectBasiqConnection,
  getBankAccountsForWizardStep,
  initiateReauth,
  listBasiqConnectionsForSubdivision,
  type BasiqConnectionListItem,
  type WizardBankAccountRow,
} from "@/lib/actions/basiq";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { InstitutionPicker } from "@/components/shared/institution-picker";
import { cn } from "@/lib/utils";

export function Step4BankFeeds({
  subdivisionId,
  onNext,
  onBack,
}: {
  subdivisionId: string;
  onNext: () => void;
  onBack: () => void;
}) {
  const searchParams = useSearchParams();
  const basiqParam = searchParams.get("basiq");
  const basiqErrorMessage = searchParams.get("message");

  const [accounts, setAccounts] = useState<WizardBankAccountRow[] | null>(
    null,
  );
  const [connections, setConnections] = useState<
    BasiqConnectionListItem[] | null
  >(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const loadData = useCallback(async () => {
    const [a, c] = await Promise.all([
      getBankAccountsForWizardStep(subdivisionId),
      listBasiqConnectionsForSubdivision(subdivisionId),
    ]);
    setAccounts(a);
    setConnections(c);
  }, [subdivisionId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData();
  }, [loadData]);

  // ── Derived state ────────────────────────────────────────────

  const activeConnections = useMemo(
    () => (connections ?? []).filter((c) => c.status === "active"),
    [connections],
  );
  const pendingConnection = useMemo(
    () =>
      (connections ?? []).find((c) => c.status === "pending") ?? null,
    [connections],
  );
  const hasAnyConnected = activeConnections.length > 0;

  // For each account: label it based on whether its basiq_connection_id
  // matches an active connection, and whether another account (created
  // earlier) shares that connection.
  function renderAccountStatus(account: WizardBankAccountRow) {
    if (!account.basiqConnectionId) {
      return { label: "Not connected", variant: "none" as const };
    }
    const conn = (connections ?? []).find(
      (c) => c.id === account.basiqConnectionId,
    );
    if (!conn) return { label: "Connected", variant: "primary" as const };
    const siblings = (accounts ?? []).filter(
      (a) => a.basiqConnectionId === account.basiqConnectionId,
    );
    if (siblings.length <= 1) {
      return {
        label: `Connected to ${conn.institutionName}`,
        variant: "primary" as const,
      };
    }
    // Multiple accounts share this connection — oldest is the "primary";
    // the others display as shared-feed secondaries.
    const sorted = [...siblings].sort((a, b) =>
      a.createdAt.localeCompare(b.createdAt),
    );
    const primary = sorted[0];
    if (primary.id === account.id) {
      return {
        label: `Connected to ${conn.institutionName}`,
        variant: "primary" as const,
      };
    }
    return {
      label: `Connected (shared feed with ${primary.accountName})`,
      variant: "secondary" as const,
    };
  }

  async function onRetryPending() {
    if (!pendingConnection) return;
    const res = await initiateReauth(pendingConnection.id);
    if (res.error || !res.success) {
      toast.error(res.error ?? "Could not restart the pending connection");
      return;
    }
    window.location.assign(res.success.consentUrl);
  }

  async function onCancelPending() {
    if (!pendingConnection) return;
    const res = await disconnectBasiqConnection(pendingConnection.id);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    await loadData();
  }

  // ── Render ───────────────────────────────────────────────────

  const loading = accounts === null || connections === null;

  return (
    <div className="space-y-5">
      {basiqParam === "connected" && (
        <InlineBanner tone="success">
          <Check className="h-4 w-4 shrink-0" />
          <span>
            Bank feed connected. Any of the bank accounts below that match will
            sync automatically from now on.
          </span>
        </InlineBanner>
      )}
      {basiqParam === "error" && (
        <InlineBanner tone="destructive">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            Could not complete the connection
            {basiqErrorMessage ? `: ${basiqErrorMessage}` : "."} You can try
            again below.
          </span>
        </InlineBanner>
      )}
      {basiqParam === "state_invalid" && (
        <InlineBanner tone="destructive">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            Security check failed on return. Start a fresh connection attempt.
          </span>
        </InlineBanner>
      )}

      <div className="rounded-md border border-border bg-muted/30 p-4">
        <p className="text-sm text-foreground">
          Before continuing, ensure you&apos;re registered as the nominated
          representative in your bank&apos;s online banking under{" "}
          <strong>Data sharing</strong> or <strong>CDR</strong>. Some banks
          require a phone call to enable sharing on trust or business accounts.
        </p>
        <a
          href="/help/nominated-representative-setup"
          target="_blank"
          className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          Help guide
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>

      {pendingConnection && (
        <InlineBanner tone="warning">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">
              A bank feed connection was started but not completed.
            </p>
            <div className="mt-2 flex gap-2">
              <Button
                type="button"
                size="sm"
                onClick={onRetryPending}
              >
                Retry
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={onCancelPending}
              >
                Cancel and start over
              </Button>
            </div>
          </div>
        </InlineBanner>
      )}

      <div>
        <h3 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Bank accounts
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Connect each account at its bank. One consent covers all accounts at
          the same bank login.
        </p>
      </div>

      {loading ? (
        <AccountSkeletonList />
      ) : accounts!.length === 0 ? (
        <div className="rounded-md border border-border bg-muted/30 p-6 text-center">
          <p className="text-sm text-foreground">
            No bank accounts yet. Go back and add at least one in the previous
            step.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {accounts!.map((acct) => {
            const status = renderAccountStatus(acct);
            return (
              <div
                key={acct.id}
                className="flex items-start gap-3 rounded-md border border-border bg-card p-4"
              >
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
                  <Landmark className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">
                    {acct.accountName}
                    <span className="ml-2 font-normal text-muted-foreground">
                      · {fundLabel(acct.fundType)}
                    </span>
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {acct.bankName ?? "—"} · BSB {acct.bsb} · {acct.accountNumber}
                  </p>
                  <p
                    className={cn(
                      "mt-2 inline-flex items-center gap-1.5 text-xs font-medium",
                      status.variant === "none"
                        ? "text-muted-foreground"
                        : status.variant === "primary"
                          ? "text-[hsl(160,100%,37%)]"
                          : "text-foreground",
                    )}
                  >
                    {status.variant === "none" ? (
                      <span className="inline-block h-2 w-2 rounded-full border border-muted-foreground" />
                    ) : (
                      <Check className="h-3.5 w-3.5" />
                    )}
                    {status.label}
                  </p>
                </div>
                {!acct.basiqConnectionId && (
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => setPickerOpen(true)}
                  >
                    Connect
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        CSV import remains available as a fallback — you can connect or change
        the feed later from the bank account page.
      </p>

      <div className="flex items-center justify-between pt-2">
        <Button type="button" variant="outline" onClick={onBack}>
          Back
        </Button>
        {hasAnyConnected ? (
          <Button type="button" onClick={onNext}>
            Continue
          </Button>
        ) : (
          <Button type="button" variant="outline" onClick={onNext}>
            Skip for now
          </Button>
        )}
      </div>

      <InstitutionPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        subdivisionId={subdivisionId}
        returnToPath={`/subdivisions/new?step=4&id=${subdivisionId}`}
      />
    </div>
  );
}


// ============================================================================
// Small helpers
// ============================================================================

function fundLabel(f: "administrative" | "capital_works"): string {
  return f === "administrative" ? "Administrative fund" : "Capital works fund";
}

function InlineBanner({
  tone,
  children,
}: {
  tone: "success" | "destructive" | "warning";
  children: React.ReactNode;
}) {
  const cls =
    tone === "success"
      ? "border-[hsl(160,100%,37%)]/30 bg-[hsl(160,100%,37%)]/10 text-foreground"
      : tone === "warning"
        ? "border-[hsl(38,92%,50%)]/30 bg-[hsl(38,92%,50%)]/10 text-foreground"
        : "border-destructive/30 bg-destructive/10 text-foreground";
  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-md border px-3.5 py-3",
        cls,
      )}
    >
      {children}
    </div>
  );
}

function AccountSkeletonList() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 2 }).map((_, i) => (
        <div
          key={i}
          className="flex items-start gap-3 rounded-md border border-border bg-card p-4"
        >
          <Skeleton className="h-8 w-8 rounded-md" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-56" />
            <Skeleton className="h-3 w-28" />
          </div>
          <Skeleton className="h-8 w-20 rounded-md" />
        </div>
      ))}
    </div>
  );
}
