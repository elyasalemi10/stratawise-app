"use client";

import { useCallback, useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { enAU } from "date-fns/locale";
import { toast } from "sonner";
import {
  disconnectBasiqConnection,
  getBasiqConnectionDetails,
  initiateReauth,
} from "@/lib/actions/basiq";
import type { BasiqConnectionDetail } from "@/lib/validations/basiq";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";

// ============================================================================
// Manage bank feed dialog
// ----------------------------------------------------------------------------
// Opened from the per-account feed panel (states B and C). Shows connection
// metadata, linked accounts, and the Reauthorise / Disconnect actions.
// Disconnect is guarded by a second AlertDialog confirmation. Both actions
// trigger onChanged so the caller can reload its feed-state data.
// ============================================================================

export function ManageBankFeedDialog({
  open,
  onOpenChange,
  connectionId,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  connectionId: string;
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState<BasiqConnectionDetail | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, setPending] = useState(false);

  const load = useCallback(async () => {
    const d = await getBasiqConnectionDetails(connectionId);
    setDetail(d);
  }, [connectionId]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open) return;
    setDetail(null);
    load();
  }, [open, load]);
  /* eslint-enable react-hooks/set-state-in-effect */

  async function onReauthorise() {
    setPending(true);
    const res = await initiateReauth(connectionId);
    setPending(false);
    if ("error" in res && res.error) {
      toast.error(res.error);
      return;
    }
    if (res.success) window.location.assign(res.success.consentUrl);
  }

  async function onDisconnect() {
    setPending(true);
    const res = await disconnectBasiqConnection(connectionId);
    setPending(false);
    if ("error" in res && res.error) {
      toast.error(res.error);
      return;
    }
    toast.success("Bank feed disconnected.");
    setConfirmOpen(false);
    onOpenChange(false);
    onChanged();
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Manage bank feed</DialogTitle>
          </DialogHeader>

          {!detail ? (
            <ManageSkeleton />
          ) : (
            <div className="space-y-4 text-sm">
              <section>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Connection
                </p>
                <p className="mt-1 font-medium text-foreground">
                  {detail.institutionName}
                </p>
              </section>

              <section className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                <MetaRow label="Connected on" value={formatDate(detail.consentGrantedAt)} />
                <MetaRow
                  label="Expires on"
                  value={
                    detail.consentExpiresAt
                      ? `${formatDate(detail.consentExpiresAt)}${
                          daysFromNow(detail.consentExpiresAt) !== null
                            ? ` (${daysFromNow(detail.consentExpiresAt)} days)`
                            : ""
                        }`
                      : "—"
                  }
                />
                <MetaRow
                  label="Last synced"
                  value={
                    detail.lastSyncAt
                      ? formatDistanceToNow(new Date(detail.lastSyncAt), {
                          addSuffix: true,
                          locale: enAU,
                        })
                      : "waiting for first sync"
                  }
                />
                <MetaRow
                  label="Nominated rep"
                  value={detail.nominatedRepresentativeName ?? "—"}
                />
              </section>

              <section>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Linked bank accounts
                </p>
                {detail.linkedBankAccounts.length === 0 ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    None currently linked.
                  </p>
                ) : (
                  <ul className="mt-1 space-y-1">
                    {detail.linkedBankAccounts.map((a) => (
                      <li
                        key={a.id}
                        className="text-sm text-foreground"
                      >
                        {a.accountName}{" "}
                        <span className="text-muted-foreground">
                          ({fundLabel(a.fundType)})
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {detail.lastSyncError && (
                <section>
                  <p className="text-xs font-medium uppercase tracking-wide text-destructive">
                    Last error
                  </p>
                  <p className="mt-1 break-words text-xs text-muted-foreground">
                    {detail.lastSyncError}
                  </p>
                </section>
              )}
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onReauthorise}
              disabled={pending || !detail}
            >
              Reauthorise
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => setConfirmOpen(true)}
              disabled={pending || !detail}
            >
              Disconnect
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect bank feed?</AlertDialogTitle>
            <AlertDialogDescription>
              This stops future transactions from syncing. Historical data
              stays. Are you sure?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={onDisconnect}
              disabled={pending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Disconnect
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function fundLabel(f: "administrative" | "capital_works"): string {
  return f === "administrative" ? "Administrative fund" : "Capital works fund";
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm text-foreground">{value}</p>
    </div>
  );
}

function ManageSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-4 w-24" />
      <div className="grid grid-cols-2 gap-4">
        <Skeleton className="h-10" />
        <Skeleton className="h-10" />
        <Skeleton className="h-10" />
        <Skeleton className="h-10" />
      </div>
      <Skeleton className="h-12 w-full" />
    </div>
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-AU", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function daysFromNow(iso: string): number | null {
  const diff = new Date(iso).getTime() - Date.now();
  return Math.floor(diff / (24 * 60 * 60 * 1000));
}
