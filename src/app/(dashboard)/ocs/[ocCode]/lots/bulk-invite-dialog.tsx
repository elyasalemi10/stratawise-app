"use client";

import { useEffect, useState } from "react";
import { Loader2, MailCheck } from "lucide-react";
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
import { bulkInviteLotOwners, getLotInvitationStatus } from "../manage/invitation-actions";
import type { LotWithFinancials } from "@/lib/actions/oc";

// Bulk-invite confirmation dialog. Fired from the /lots Tools dropdown.
//
// On open, it inspects the in-memory `lots` list + a fresh
// getLotInvitationStatus call to figure out who's eligible:
//   - Has an email on file (no email = no invitation possible)
//   - Doesn't have an existing accepted invite
// Owners with a pending or noted invite still get a fresh send (counts as
// a resend, which is fine — the action reuses the open invitation row).

interface Props {
  open: boolean;
  onClose: () => void;
  ocId: string;
  lots: LotWithFinancials[];
}

export function BulkInviteDialog({ open, onClose, ocId, lots }: Props) {
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [eligible, setEligible] = useState<LotWithFinancials[]>([]);
  const [noEmailCount, setNoEmailCount] = useState(0);
  const [alreadyAcceptedCount, setAlreadyAcceptedCount] = useState(0);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    const lotIds = lots.map((l) => l.id);
    if (lotIds.length === 0) {
      setEligible([]);
      setNoEmailCount(0);
      setAlreadyAcceptedCount(0);
      setLoading(false);
      return;
    }
    getLotInvitationStatus(ocId, lotIds).then((statusMap) => {
      const map = statusMap instanceof Map ? statusMap : new Map(Object.entries(statusMap as Record<string, string>));
      const accepted = new Set<string>();
      map.forEach((v, k) => { if (v === "accepted") accepted.add(k); });

      const elig: LotWithFinancials[] = [];
      let noEmail = 0;
      let already = 0;
      for (const lot of lots) {
        if (accepted.has(lot.id)) { already++; continue; }
        if (!lot.owner_contact_email?.trim()) { noEmail++; continue; }
        if (!lot.owner_display_name?.trim()) { noEmail++; continue; }
        elig.push(lot);
      }
      setEligible(elig);
      setNoEmailCount(noEmail);
      setAlreadyAcceptedCount(already);
      setLoading(false);
    });
  }, [open, ocId, lots]);

  async function send() {
    setSending(true);
    const payload = eligible.map((l) => ({
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

  const eligibleCount = eligible.length;
  const totalLots = lots.length;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !sending) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Bulk invite owners</DialogTitle>
          <DialogDescription>
            Sends an invitation email to every eligible lot owner with an email on file.
            Owners who&apos;ve already accepted are skipped. Pending invites get refreshed.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
            Checking lot statuses…
          </div>
        ) : (
          <div className="space-y-2 text-sm">
            <div className="rounded-md border border-border bg-card p-3 flex items-center gap-3">
              <MailCheck className="h-5 w-5 text-primary shrink-0" />
              <div className="flex-1">
                <p className="font-semibold text-foreground">
                  {eligibleCount} of {totalLots} lot{totalLots === 1 ? "" : "s"} will be invited
                </p>
                {(noEmailCount > 0 || alreadyAcceptedCount > 0) && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {noEmailCount > 0 && <>{noEmailCount} skipped (no email / name)</>}
                    {noEmailCount > 0 && alreadyAcceptedCount > 0 && " · "}
                    {alreadyAcceptedCount > 0 && <>{alreadyAcceptedCount} already accepted</>}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="secondary" onClick={onClose} disabled={sending}>Cancel</Button>
          <Button
            onClick={send}
            disabled={sending || loading || eligibleCount === 0}
          >
            {sending && <Loader2 className="size-4 animate-spin" />}
            {sending ? "Sending…" : `Send ${eligibleCount > 0 ? eligibleCount : ""} invitation${eligibleCount === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
