"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Landmark, Search } from "lucide-react";
import {
  listBasiqInstitutions,
  startBasiqConsent,
} from "@/lib/actions/basiq";
import type { BasiqInstitution } from "@/lib/validations/basiq";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// ============================================================================
// Shared institution picker — wizard step 4 and bank-account feed panel both
// use this. On pick: calls startBasiqConsent with the caller-supplied
// returnToPath, then navigates to the Consent UI URL. On failure, an inline
// error banner surfaces in the dialog without closing it.
// ============================================================================

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  ocId: string;
  /** Full path (with querystring) the user returns to after consent. */
  returnToPath: string;
  /** Optional initial value for the nominated-rep name — e.g. the manager's
   *  own name when the current profile is known. */
  defaultNominatedRep?: string;
}

export function InstitutionPicker({
  open,
  onOpenChange,
  ocId,
  returnToPath,
  defaultNominatedRep,
}: Props) {
  const [institutions, setInstitutions] = useState<
    BasiqInstitution[] | null
  >(null);
  const [filter, setFilter] = useState("");
  const [nominatedRep, setNominatedRep] = useState(defaultNominatedRep ?? "");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open) return;
    // Reset ephemeral modal state when it opens; the effect short-circuits
    // for every render where `open` is unchanged so there's no cascade.
    setFilter("");
    setError(null);
    setBusyId(null);
    setNominatedRep(defaultNominatedRep ?? "");
    let cancelled = false;
    listBasiqInstitutions().then((data) => {
      if (!cancelled) setInstitutions(data);
    });
    return () => {
      cancelled = true;
    };
  }, [open, defaultNominatedRep]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const filtered = useMemo(() => {
    const list = institutions ?? [];
    const f = filter.trim().toLowerCase();
    if (!f) return list;
    return list.filter(
      (i) =>
        i.name.toLowerCase().includes(f) ||
        (i.shortName ?? "").toLowerCase().includes(f),
    );
  }, [institutions, filter]);

  async function onPick(inst: BasiqInstitution) {
    if (!nominatedRep.trim()) {
      setError("Enter the nominated representative's name before continuing.");
      return;
    }
    setBusyId(inst.id);
    setError(null);
    const res = await startBasiqConsent({
      oc_id: ocId,
      institution_id: inst.id,
      nominated_rep_name: nominatedRep.trim(),
      return_to: returnToPath,
    });
    if ("error" in res || !res.success) {
      setBusyId(null);
      setError(
        ("error" in res && res.error) ||
          "Could not start the connection. Please try again.",
      );
      return;
    }
    window.location.assign(res.success.consentUrl);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Choose your bank</DialogTitle>
          <DialogDescription>
            You&apos;ll be redirected to your bank to complete consent. One
            consent covers every account you share at that bank.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <label
              htmlFor="nominated-rep"
              className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
            >
              Nominated representative name
            </label>
            <Input
              id="nominated-rep"
              value={nominatedRep}
              onChange={(e) => setNominatedRep(e.target.value)}
              placeholder="Full name as recorded with your bank"
              className="mt-1.5"
            />
          </div>

          <div>
            <label htmlFor="bank-search" className="sr-only">
              Search banks
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="bank-search"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Search banks…"
                className="pl-9"
              />
            </div>
          </div>

          {error && (
            <div
              className={cn(
                "flex items-start gap-2.5 rounded-md border border-destructive/30 bg-destructive/10 px-3.5 py-3",
              )}
            >
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span className="text-sm">{error}</span>
            </div>
          )}

          <div className="max-h-[320px] overflow-y-auto rounded-md border border-border">
            {institutions === null ? (
              <div className="grid grid-cols-2 gap-px bg-border">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 bg-card p-4"
                  >
                    <Skeleton className="h-8 w-8 rounded-md" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-3.5 w-16" />
                      <Skeleton className="h-3 w-28" />
                    </div>
                  </div>
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                {institutions.length === 0
                  ? "No banks available right now. Try again in a moment."
                  : "No banks match your search."}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-px bg-border">
                {filtered.map((inst) => {
                  const busy = busyId === inst.id;
                  return (
                    <button
                      key={inst.id}
                      type="button"
                      disabled={!!busyId}
                      onClick={() => onPick(inst)}
                      className="flex items-center gap-3 bg-card p-4 text-left transition-colors hover:bg-muted/30 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
                        <Landmark className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">
                          {inst.shortName ?? inst.name}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {inst.shortName && inst.shortName !== inst.name
                            ? inst.name
                            : " "}
                        </p>
                      </div>
                      {busy && (
                        <span className="text-xs font-medium text-primary">
                          Connecting…
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            Can&apos;t find your bank? Your OC&apos;s bank may not yet support
            Consumer Data Right sharing.
          </p>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={!!busyId}
          >
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
