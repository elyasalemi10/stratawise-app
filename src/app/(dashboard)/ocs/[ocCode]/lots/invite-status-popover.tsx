"use client";

import { useEffect, useState } from "react";
import {
  Calendar,
  Check,
  ExternalLink,
  Loader2,
  Mail,
  MailOpen,
  Pencil,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useOCCode } from "@/lib/oc-context";
import {
  getLotInvitationHistory,
  inviteLotOwner,
} from "../manage/invitation-actions";

// Invite-status pill that opens a Dialog popup (matching the record-settlement
// pattern). The dialog renders:
//   - the full invite history (every send / acceptance / expiry / revoke)
//   - an inline send-invite form for the most-recent contact
//   - a quick link to the lot's Owner tab for Add owner / full edits

type Status = "not_invited" | "noted" | "pending" | "accepted";

interface Props {
  ocId: string;
  lotId: string;
  lotNumber: number;
  status: Status;
  // Owner contact prefill so the manager can invite from this popover
  // even when no `invitations` row exists yet (the owner was created via
  // the lot edit form, which writes lot_owners directly).
  ownerName?: string | null;
  ownerEmail?: string | null;
  ownerPhone?: string | null;
}

interface Invitation {
  id: string;
  email: string | null;
  name: string | null;
  phone: string | null;
  status: "noted" | "pending" | "accepted" | "expired" | "revoked";
  created_at: string;
  expires_at: string | null;
}

function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function pillFor(status: Status) {
  if (status === "accepted") return <Badge variant="success">Accepted</Badge>;
  if (status === "pending") return <Badge variant="warning">Pending</Badge>;
  if (status === "noted") return <Badge variant="info">Owner noted</Badge>;
  return (
    <Badge
      variant="neutral"
      className="bg-card border border-border text-muted-foreground"
    >
      Not invited
    </Badge>
  );
}

function rowIconFor(status: Invitation["status"]) {
  switch (status) {
    case "accepted":
      return <Check className="h-3 w-3 text-[hsl(160,100%,37%)]" />;
    case "pending":
      return <Mail className="h-3 w-3 text-foreground" />;
    case "expired":
      return <Calendar className="h-3 w-3 text-muted-foreground" />;
    case "revoked":
      return <X className="h-3 w-3 text-destructive" />;
    case "noted":
    default:
      return <Pencil className="h-3 w-3 text-muted-foreground" />;
  }
}

function rowLabelFor(status: Invitation["status"]): string {
  switch (status) {
    case "accepted":
      return "Accepted";
    case "pending":
      return "Invitation sent";
    case "expired":
      return "Invitation expired";
    case "revoked":
      return "Invitation revoked";
    case "noted":
    default:
      return "Contact captured";
  }
}

export function InviteStatusPopover({
  ocId,
  lotId,
  lotNumber,
  status,
  ownerName,
  ownerEmail,
  ownerPhone,
}: Props) {
  const ocCode = useOCCode();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState<Invitation[] | null>(null);

  // Kick off the history fetch in the background as soon as the
  // component mounts. The user might never open the popover, but if
  // they do — by the time they click, the data is already cached. We
  // intentionally don't reset on close so a re-open is instant.
  useEffect(() => {
    let cancelled = false;
    getLotInvitationHistory(ocId, lotId)
      .then((rows) => {
        if (!cancelled) setHistory(rows);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [ocId, lotId]);

  const loading = open && history === null;
  const historyRows = history ?? [];

  const latest = historyRows[0] ?? null;
  const isAccepted = status === "accepted";

  // The InviteForm needs at least name + email to send. Prefer the most
  // recent invitation row (carries name/email/phone), then fall back to
  // the owner contact passed from the lots table for the case where the
  // owner exists in lot_owners but no invitation has been sent yet.
  const inviteFormInitial =
    latest?.email != null
      ? {
          name: latest.name ?? ownerName ?? "",
          email: latest.email,
          phone: latest.phone ?? ownerPhone ?? "",
        }
      : ownerEmail
        ? {
            name: ownerName ?? "",
            email: ownerEmail,
            phone: ownerPhone ?? "",
          }
        : null;

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        aria-label="View invite status"
        className="inline-flex cursor-pointer items-center"
      >
        {pillFor(status)}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="sm:max-w-md"
          onClick={(e) => e.stopPropagation()}
        >
          <DialogHeader>
            <DialogTitle className="pr-6">
              {isAccepted ? "Owner — " : "Invite owner — "}Lot {lotNumber}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Read-only owner + email confirm. No editable form, no
                "not invited" pill — the manager just confirms we've got
                the right address and hits Send. */}
            {!isAccepted && inviteFormInitial && (
              <ConfirmInviteBlock
                ocId={ocId}
                lotId={lotId}
                lotNumber={lotNumber}
                ownerName={inviteFormInitial.name}
                ownerEmail={inviteFormInitial.email}
                ownerPhone={inviteFormInitial.phone}
                onSent={() => {
                  setOpen(false);
                  router.refresh();
                }}
              />
            )}

            {/* No email yet → the only thing they can do is open the
                Owner tab to add one. */}
            {!isAccepted && !inviteFormInitial && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 rounded-md border border-border bg-cool-muted p-3 text-xs text-cool-muted-foreground">
                  <MailOpen className="h-3.5 w-3.5" />
                  No email on file for this lot — add one to send an invitation.
                </div>
                <Link
                  href={`/ocs/${ocCode}/lots/${lotId}?tab=owner`}
                  className="inline-flex items-center text-sm font-medium text-blue-600 underline-offset-4 hover:underline"
                  onClick={() => setOpen(false)}
                >
                  Add owner
                  <ExternalLink className="ml-1 h-3.5 w-3.5" />
                </Link>
              </div>
            )}

            {isAccepted && (
              <div className="flex items-center gap-2 rounded-md border border-border bg-cool-muted p-3 text-xs text-cool-muted-foreground">
                <Check className="h-3.5 w-3.5" />
                This owner has accepted their invitation.
              </div>
            )}

            {/* Invite history — informational, collapsed below the action. */}
            {!loading && historyRows.length > 0 && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">
                  Invite history
                </p>
                <ol className="space-y-2 max-h-44 overflow-y-auto pr-1">
                  {historyRows.map((inv) => (
                    <li
                      key={inv.id}
                      className="flex items-start gap-3 rounded-md border border-border bg-card px-3 py-2"
                    >
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border bg-card">
                        {rowIconFor(inv.status)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <p className="text-sm font-medium text-foreground">
                            {rowLabelFor(inv.status)}
                          </p>
                          <span className="text-[10px] tabular-nums text-muted-foreground">
                            {formatDate(inv.created_at)}
                          </span>
                        </div>
                        {inv.email && (
                          <p className="truncate text-xs text-muted-foreground" title={inv.email}>
                            {inv.email}
                          </p>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// Read-only confirm + send. Owner name + lot + email are shown
// uneditable; the manager just confirms the address and hits Send. To
// change any detail they use the Owner tab (the lot detail page), not
// this popover.
function ConfirmInviteBlock({
  ocId,
  lotId,
  lotNumber,
  ownerName,
  ownerEmail,
  ownerPhone,
  onSent,
}: {
  ocId: string;
  lotId: string;
  lotNumber: number;
  ownerName: string;
  ownerEmail: string;
  ownerPhone: string;
  onSent: () => void;
}) {
  const [sending, setSending] = useState(false);

  async function sendInvite() {
    setSending(true);
    const result = await inviteLotOwner(ocId, lotId, {
      email: ownerEmail.trim(),
      name: ownerName.trim() || "Owner",
      phone: ownerPhone.trim() || undefined,
    });
    if (result.error) {
      setSending(false);
      toast.error(result.error);
      return;
    }
    toast.success("Invitation sent", { description: `Sent to ${ownerEmail.trim()}.` });
    // Keep the spinner on through the parent's close + refresh.
    onSent();
  }

  return (
    <div className="space-y-3">
      <div className="rounded-md border border-border bg-cool-muted px-3 py-2.5 text-sm space-y-1.5">
        <div>
          <p className="text-xs uppercase tracking-wide text-cool-muted-foreground">Owner</p>
          <p className="font-medium text-foreground">{ownerName || "—"} · Lot {lotNumber}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-cool-muted-foreground">Email</p>
          <p className="inline-flex items-center gap-2 font-medium text-foreground">
            <Mail className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="break-all">{ownerEmail}</span>
          </p>
        </div>
      </div>
      <div className="flex justify-end">
        <Button size="sm" onClick={sendInvite} disabled={sending}>
          {sending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
          Send invitation
        </Button>
      </div>
    </div>
  );
}
