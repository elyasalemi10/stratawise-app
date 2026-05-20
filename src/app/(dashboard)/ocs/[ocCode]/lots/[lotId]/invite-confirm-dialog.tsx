"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { inviteLotOwner } from "../../manage/invitation-actions";

// Lightweight confirm dialog for the "Invite owner" menu item.
//
// The user already created the owner record (name + email + phone are
// on the lot). Previously clicking "Invite owner" reopened the full
// owner-edit form, which felt like starting from scratch. Now it shows
// "Send invitation to: owner@example.com [edit]" with a Send button.
// "Edit" hands control back to the parent so it can open the existing
// InviteDialog edit form; once that closes, the parent reopens this
// confirm with the updated email.

interface Props {
  open: boolean;
  onClose: () => void;
  ocId: string;
  lotId: string;
  lotNumber: number;
  ownerName: string | null;
  ownerEmail: string | null;
  ownerPhone: string | null;
  onEditDetails: () => void;
  onSent?: () => void;
}

export function InviteConfirmDialog({
  open,
  onClose,
  ocId,
  lotId,
  lotNumber,
  ownerName,
  ownerEmail,
  ownerPhone,
  onEditDetails,
  onSent,
}: Props) {
  const [sending, setSending] = useState(false);

  async function handleSend() {
    if (!ownerEmail) {
      toast.error("Add an owner email first.");
      onEditDetails();
      onClose();
      return;
    }
    if (!ownerName) {
      toast.error("Add an owner name first.");
      onEditDetails();
      onClose();
      return;
    }
    setSending(true);
    const res = await inviteLotOwner(ocId, lotId, {
      email: ownerEmail.trim(),
      name: ownerName.trim(),
      phone: ownerPhone?.trim() || undefined,
    });
    setSending(false);
    if ("error" in res && res.error) {
      toast.error(res.error);
      return;
    }
    toast.success(`Invitation sent to ${ownerEmail.trim()}.`);
    onSent?.();
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Invite owner — Lot {lotNumber}</DialogTitle>
          <DialogDescription>
            We&apos;ll email the owner an invitation link to set up their portal account.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded-md border border-border bg-cool-muted px-3 py-2.5 text-sm">
            <p className="text-xs uppercase tracking-wide text-cool-muted-foreground">
              Sending to
            </p>
            {/* Email + edit link sit on the same row — the link to the
                right of the address rather than dropped underneath it.
                On narrow widths they wrap rather than overflow. */}
            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
              <p className="inline-flex items-center gap-2 font-medium text-foreground">
                <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                {ownerEmail ? (
                  <span className="break-all">{ownerEmail}</span>
                ) : (
                  <span className="italic text-muted-foreground">no email on file</span>
                )}
              </p>
              <button
                type="button"
                onClick={() => { onClose(); onEditDetails(); }}
                className="text-xs font-medium text-[color:var(--brand-gold)] hover:underline whitespace-nowrap"
              >
                Edit owner details
              </button>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose} disabled={sending}>
            Cancel
          </Button>
          <Button onClick={handleSend} disabled={sending || !ownerEmail || !ownerName}>
            {sending && <Loader2 className="size-3.5 animate-spin" />}
            Send invitation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
