"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { bulkInviteLotOwners } from "../manage/invitation-actions";
import type { LotWithFinancials } from "@/lib/actions/oc";

// Bulk-invite confirmation dialog. Fired from the /lots Tools dropdown.
//
// Receives the invite-status map from the parent (LotsPageContent), which
// is the same map the LotsTab already loaded — no second fetch. We compute
// eligibility locally:
//   - Has email + name on file (no email = no invitation possible)
//   - Doesn't have an existing accepted invite
// Owners with a pending or noted invite still get a fresh send (counts as
// a resend, which is fine — the underlying action reuses the open invite).

interface Props {
  open: boolean;
  onClose: () => void;
  ocId: string;
  lots: LotWithFinancials[];
  /** Pre-loaded invite-status map, keyed by lot id. Same map LotsTab uses
   *  — passed in so we don't refetch when the dialog opens. */
  inviteStatusMap: Map<string, string>;
}

export function BulkInviteDialog({ open, onClose, ocId, lots, inviteStatusMap }: Props) {
  const [sending, setSending] = useState(false);
  const [eligible, setEligible] = useState<LotWithFinancials[]>([]);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [alreadyAcceptedCount, setAlreadyAcceptedCount] = useState(0);

  // Recompute eligibility from the parent-supplied map every time the
  // dialog opens. Synchronous — no fetch, no loading state. Owners with no
  // email (or no name) can't be invited, so they're left out of the list
  // entirely. All eligible owners start checked.
  useEffect(() => {
    if (!open) return;
    const accepted = new Set<string>();
    inviteStatusMap.forEach((v, k) => { if (v === "accepted") accepted.add(k); });

    const elig: LotWithFinancials[] = [];
    let already = 0;
    for (const lot of lots) {
      if (accepted.has(lot.id)) { already++; continue; }
      if (!lot.owner_contact_email?.trim()) continue;
      if (!lot.owner_display_name?.trim()) continue;
      elig.push(lot);
    }
    setEligible(elig);
    setChecked(new Set(elig.map((l) => l.id)));
    setAlreadyAcceptedCount(already);
  }, [open, lots, inviteStatusMap]);

  function toggle(lotId: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(lotId)) next.delete(lotId);
      else next.add(lotId);
      return next;
    });
  }

  const allChecked = eligible.length > 0 && checked.size === eligible.length;

  async function send() {
    setSending(true);
    const payload = eligible
      .filter((l) => checked.has(l.id))
      .map((l) => ({
        lotId: l.id,
        email: l.owner_contact_email!,
        name: l.owner_display_name!,
        phone: l.owner_contact_phone ?? undefined,
      }));
    const r = await bulkInviteLotOwners(ocId, payload);
    setSending(false);
    if (r.failed > 0) {
      toast.error(`${r.sent} sent, ${r.failed} failed. ${r.errors[0] ?? ""}`);
    } else {
      toast.success(`${r.sent} invitation${r.sent === 1 ? "" : "s"} sent.`);
    }
    onClose();
  }

  const checkedCount = checked.size;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !sending) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Invite owners</DialogTitle>
          <DialogDescription>
            Pick the owners to email an invitation. Owners with no email on file
            aren&apos;t shown. Owners who&apos;ve already accepted are skipped.
          </DialogDescription>
        </DialogHeader>

        {eligible.length === 0 ? (
          <p className="rounded-md border border-border bg-card p-4 text-sm text-muted-foreground">
            {alreadyAcceptedCount > 0
              ? `Every owner with an email on file has already accepted. (${alreadyAcceptedCount} accepted.)`
              : "None of these owners have an email on file yet — add an email to a lot's owner to invite them."}
          </p>
        ) : (
          <>
            <div className="flex items-center justify-between border-b border-border pb-2">
              <button
                type="button"
                onClick={() =>
                  setChecked(allChecked ? new Set() : new Set(eligible.map((l) => l.id)))
                }
                className="text-xs font-medium text-primary hover:underline cursor-pointer"
              >
                {allChecked ? "Deselect all" : "Select all"}
              </button>
              <span className="text-xs text-muted-foreground">
                {checkedCount} of {eligible.length} selected
              </span>
            </div>
            {/* Fixed height of ~5.5 rows so the list visibly clips its last
                row — a cue that it scrolls when there are more owners. */}
            <div className="max-h-[308px] space-y-1 overflow-y-auto rounded-md border border-border bg-card p-1">
              {eligible.map((lot) => (
                <div
                  key={lot.id}
                  className="flex items-start gap-3 rounded-md px-2 py-2 hover:bg-muted/50"
                >
                  <Checkbox
                    checked={checked.has(lot.id)}
                    onCheckedChange={() => toggle(lot.id)}
                    className="bg-card mt-0.5"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {lot.owner_display_name}
                      <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                        Lot {lot.lot_number}
                      </span>
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {lot.owner_contact_email}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        <DialogFooter>
          <Button variant="secondary" onClick={onClose} disabled={sending}>Cancel</Button>
          <Button onClick={send} disabled={sending || checkedCount === 0}>
            {sending && <Loader2 className="size-4 animate-spin" />}
            Send {checkedCount > 0 ? checkedCount : ""} invitation{checkedCount === 1 ? "" : "s"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
