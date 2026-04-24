"use client";

import {
  useCallback,
  useEffect,
  useState,
  useTransition,
} from "react";
import { usePathname } from "next/navigation";
import {
  AlertTriangle,
  Check,
  Circle,
  Loader2,
  ShieldAlert,
  ShieldX,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { enAU } from "date-fns/locale";
import { toast } from "sonner";
import {
  forceSyncBasiqConnection,
  getFeedStateForBankAccount,
  initiateReauth,
  releaseBankAccountFromConnection,
  type FeedPanelResult,
} from "@/lib/actions/basiq";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { InstitutionPicker } from "@/components/shared/institution-picker";
import { ManageBankFeedDialog } from "./manage-bank-feed-dialog";
import { cn } from "@/lib/utils";

const SYNC_COOLDOWN_SECONDS = 30;

export function BankFeedPanel({
  subdivisionId,
  bankAccountId,
}: {
  subdivisionId: string;
  bankAccountId: string;
}) {
  const pathname = usePathname();
  const [data, setData] = useState<FeedPanelResult | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [syncError, setSyncError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await getFeedStateForBankAccount(bankAccountId);
    setData(res);
  }, [bankAccountId]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    load();
  }, [load]);

  // Rate-limit countdown — we can't call Date.now() during render (React
  // Compiler flags impure reads). Instead, derive remainingMs inside an
  // interval effect and drive the label off state. The cooldown ends at
  // last_sync_at + 30s; we clear the interval when remainingMs reaches 0.
  const [remainingMs, setRemainingMs] = useState(0);
  useEffect(() => {
    const last = data?.connection?.lastSyncAt;
    if (!last) {
      setRemainingMs(0);
      return;
    }
    const endsAt =
      new Date(last).getTime() + SYNC_COOLDOWN_SECONDS * 1000;
    const update = () => {
      const now = Date.now();
      setRemainingMs(Math.max(0, endsAt - now));
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [data?.connection?.lastSyncAt]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const rateLimited = remainingMs > 0;
  const remainingSeconds = Math.ceil(remainingMs / 1000);

  async function onSyncNow() {
    if (!data?.connection) return;
    setSyncError(null);
    startTransition(async () => {
      const res = await forceSyncBasiqConnection({
        subdivisionId,
      });
      if ("error" in res && res.error) {
        setSyncError(res.error);
        return;
      }
      if (res.success?.rateLimited) {
        // Rate-limit flag flips via the connection's last_sync_at timestamp;
        // the useMemo above will recompute after load().
        toast.info("Synced recently — give it a moment before retrying.");
      } else if (res.success) {
        toast.success(
          `Synced. ${res.success.newTransactionCount} new transaction${res.success.newTransactionCount === 1 ? "" : "s"}.`,
        );
      }
      await load();
    });
  }

  async function onReauthorise() {
    if (!data?.connection) return;
    const res = await initiateReauth(data.connection.id);
    if ("error" in res && res.error) {
      toast.error(res.error);
      return;
    }
    if (res.success) window.location.assign(res.success.consentUrl);
  }

  async function onReconnect() {
    // Null the binding on THIS account so the fresh consent can rebind it.
    // The old basiq_connections row stays (audit trail), per the design.
    const rel = await releaseBankAccountFromConnection(bankAccountId);
    if ("error" in rel && rel.error) {
      toast.error(rel.error);
      return;
    }
    await load();
    setPickerOpen(true);
  }

  // ── Render ──────────────────────────────────────────────────

  if (data === null) {
    return (
      <div className="rounded-md border border-border bg-muted/30 p-4">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="mt-2 h-3 w-56" />
      </div>
    );
  }

  const { state, connection } = data;
  const lastSyncedLabel = formatLastSynced(connection?.lastSyncAt);

  switch (state) {
    case "not_connected":
      return (
        <>
          <FeedBox tone="muted">
            <FeedRow
              glyph={<Circle className="h-3.5 w-3.5 text-muted-foreground" />}
              title={
                <span className="text-muted-foreground">
                  Bank feed: Not connected
                </span>
              }
              subtitle="CSV import remains available as a fallback."
              actions={
                <Button size="sm" onClick={() => setPickerOpen(true)}>
                  Connect bank feed
                </Button>
              }
            />
          </FeedBox>
          <InstitutionPicker
            open={pickerOpen}
            onOpenChange={setPickerOpen}
            subdivisionId={subdivisionId}
            returnToPath={pathname}
          />
        </>
      );

    case "pending":
      return (
        <FeedBox tone="muted">
          <FeedRow
            glyph={<Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
            title="Bank feed: awaiting consent"
            subtitle="You started a connection but haven't finished yet. Reopen the consent flow from the bank account page or the wizard."
          />
        </FeedBox>
      );

    case "syncing":
    case "active": {
      const isSyncing = state === "syncing" || isPending;
      return (
        <>
          <FeedBox tone="success">
            <FeedRow
              glyph={<Check className="h-4 w-4 text-[hsl(160,100%,37%)]" />}
              title={`Connected to ${connection!.institutionName}`}
              subtitle={`Last synced ${lastSyncedLabel}`}
              actions={
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={isSyncing || rateLimited}
                    onClick={onSyncNow}
                  >
                    {isSyncing ? (
                      <>
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        Syncing…
                      </>
                    ) : rateLimited ? (
                      `Synced just now · retry in ${remainingSeconds}s`
                    ) : (
                      "Sync now"
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setManageOpen(true)}
                  >
                    Manage
                  </Button>
                </>
              }
            />
            {syncError && (
              <p className="mt-2 text-xs text-destructive">{syncError}</p>
            )}
          </FeedBox>
          <ManageBankFeedDialog
            open={manageOpen}
            onOpenChange={setManageOpen}
            connectionId={connection!.id}
            onChanged={load}
          />
        </>
      );
    }

    case "expiring_soon":
      return (
        <>
          <FeedBox tone="warning">
            <FeedRow
              glyph={<AlertTriangle className="h-4 w-4 text-[hsl(38,92%,50%)]" />}
              title={`Connection expires in ${connection!.daysUntilExpiry} day${connection!.daysUntilExpiry === 1 ? "" : "s"}`}
              subtitle={`${connection!.institutionName} · Last synced ${lastSyncedLabel}`}
              actions={
                <>
                  <Button size="sm" onClick={onReauthorise}>
                    Reauthorise
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={isPending || rateLimited}
                    onClick={onSyncNow}
                  >
                    {isPending ? (
                      <>
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        Syncing…
                      </>
                    ) : rateLimited ? (
                      `Retry in ${remainingSeconds}s`
                    ) : (
                      "Sync now"
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setManageOpen(true)}
                  >
                    Manage
                  </Button>
                </>
              }
            />
          </FeedBox>
          <ManageBankFeedDialog
            open={manageOpen}
            onOpenChange={setManageOpen}
            connectionId={connection!.id}
            onChanged={load}
          />
        </>
      );

    case "expired":
      return (
        <FeedBox tone="destructive">
          <FeedRow
            glyph={<ShieldX className="h-4 w-4 text-destructive" />}
            title={`Connection expired${
              connection?.consentExpiresAt
                ? ` on ${formatDate(connection.consentExpiresAt)}`
                : ""
            }`}
            subtitle="Transactions since then are not being imported. CSV import remains available as a fallback."
            actions={
              <Button size="sm" onClick={onReauthorise}>
                Reauthorise now
              </Button>
            }
          />
        </FeedBox>
      );

    case "revoked":
    case "failed":
      return (
        <>
          <FeedBox tone="destructive">
            <FeedRow
              glyph={<ShieldAlert className="h-4 w-4 text-destructive" />}
              title="Disconnected"
              subtitle={`Reason: ${translateReason(state, connection?.lastSyncError ?? null)}`}
              actions={
                <Button size="sm" onClick={onReconnect}>
                  Reconnect
                </Button>
              }
            />
            {connection?.lastSyncError && (
              <details className="mt-2">
                <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                  Details
                </summary>
                <p className="mt-1 break-words text-xs text-muted-foreground">
                  {connection.lastSyncError}
                </p>
              </details>
            )}
          </FeedBox>
          <InstitutionPicker
            open={pickerOpen}
            onOpenChange={setPickerOpen}
            subdivisionId={subdivisionId}
            returnToPath={pathname}
          />
        </>
      );
  }
}

// ============================================================================
// Box + row layout helpers
// ============================================================================

function FeedBox({
  tone,
  children,
}: {
  tone: "muted" | "success" | "warning" | "destructive";
  children: React.ReactNode;
}) {
  const cls =
    tone === "success"
      ? "border-[hsl(160,100%,37%)]/30 bg-[hsl(160,100%,37%)]/5"
      : tone === "warning"
        ? "border-[hsl(38,92%,50%)]/30 bg-[hsl(38,92%,50%)]/10"
        : tone === "destructive"
          ? "border-destructive/30 bg-destructive/10"
          : "border-border bg-muted/30";
  return (
    <div className={cn("mb-5 rounded-md border p-4", cls)}>{children}</div>
  );
}

function FeedRow({
  glyph,
  title,
  subtitle,
  actions,
}: {
  glyph: React.ReactNode;
  title: React.ReactNode;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 shrink-0">{glyph}</div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {subtitle && (
          <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
        )}
      </div>
      {actions && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {actions}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Formatters / translators
// ============================================================================

function formatLastSynced(iso: string | null | undefined): string {
  if (!iso) return "waiting for first sync";
  return formatDistanceToNow(new Date(iso), {
    addSuffix: true,
    locale: enAU,
  });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-AU", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function translateReason(
  state: "revoked" | "failed",
  rawError: string | null,
): string {
  const err = (rawError ?? "").toLowerCase();
  if (err.includes("invalidated")) {
    return "Connection interrupted — please reconnect";
  }
  if (err.includes("consent_required") || err.includes("consent required")) {
    return "Consent expired";
  }
  if (err.includes("timed out") || err.includes("timeout")) {
    return "Sync timed out — try again in a few minutes";
  }
  if (err.includes("manually disconnected")) return "Manually disconnected";
  if (state === "revoked") {
    return rawError ? truncate(rawError, 120) : "Manually disconnected";
  }
  return rawError
    ? truncate(rawError, 120)
    : "Connection failed — reconnect required";
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}
