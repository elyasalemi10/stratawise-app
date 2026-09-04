"use client";

import { useEffect, useState } from "react";
import {
  Calendar,
  Check,
  Mail,
  Pencil,
  X,
} from "lucide-react";
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
import { cn } from "@/lib/utils";
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
  /** Fires the moment the send succeeds, so the parent can flip the pill
   *  to "Invited" before the status re-fetch comes back. */
  onInviteChanged?: (sentTo: string) => void;
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

const PILL: Record<Status, { variant: "success" | "warning" | "info" | "neutral"; label: string }> = {
  accepted: { variant: "success", label: "Accepted" },
  pending: { variant: "warning", label: "Invited" },
  noted: { variant: "info", label: "Owner noted" },
  not_invited: { variant: "neutral", label: "Not invited" },
};

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
  onInviteChanged,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState<Invitation[] | null>(null);

  // Kick off the history fetch in the background as soon as the
  // component mounts. The user might never open the popover, but if
  // they do , by the time they click, the data is already cached. We
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
  // Who this is about. Their name if we have it, otherwise the lot , "Invite
  // Lot 4 to StrataWise" still says who, which "Invite owner" did not.
  const inviteeLabel = (ownerName ?? "").trim() || `Lot ${lotNumber}`;
  // Sends, not history rows: a "contact captured" entry is not an invite.
  const sendCount = historyRows.filter(
    (h) => h.status === "pending" || h.status === "accepted" || h.status === "expired" || h.status === "revoked",
  ).length;
  const lastSent = historyRows.find((h) => h.status !== "noted") ?? null;

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
        data-row-hover-off
        className="group/pill relative inline-flex cursor-pointer items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
      >
        <Badge
          variant={PILL[status].variant}
          className={cn(
            "transition-[filter,box-shadow] group-hover/pill:brightness-95 group-hover/pill:ring-1 group-hover/pill:ring-border",
            status === "not_invited" && "border border-border bg-card text-muted-foreground",
          )}
        >
          {PILL[status].label}
        </Badge>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="sm:max-w-md"
          onClick={(e) => e.stopPropagation()}
        >
          <DialogHeader>
            <DialogTitle className="pr-6">
              {isAccepted
                ? `${inviteeLabel} is on StrataWise`
                : `Invite ${inviteeLabel} to StrataWise`}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {sendCount > 0 && (
              <p className="text-sm text-muted-foreground">
                {sendCount === 1 ? "Invited once" : `Invited ${sendCount} times`}
                {lastSent ? `, last on ${formatDate(lastSent.created_at)}` : ""}
                {lastSent?.email ? ` to ${lastSent.email}` : ""}.
              </p>
            )}

            {isAccepted ? (
              <p className="text-sm text-muted-foreground">
                They accepted their invitation and can sign in to manage this lot.
              </p>
            ) : (
              <InviteForm
                ocId={ocId}
                lotId={lotId}
                ownerName={inviteFormInitial?.name ?? ownerName ?? ""}
                initialEmail={inviteFormInitial?.email ?? ""}
                ownerPhone={inviteFormInitial?.phone ?? ""}
                onSent={(email) => {
                  setOpen(false);
                  onInviteChanged?.(email);
                  if (!onInviteChanged) router.refresh();
                }}
              />
            )}

            {/* Invite history , informational, collapsed below the action. */}
            {!loading && historyRows.length > 0 && (
              <div>
                <p className="text-xs font-medium tracking-normal text-muted-foreground mb-2">
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

// Confirm the address and send. Editable, because the case where there is
// no email on file is exactly the case where the manager is holding one ,
// sending them off to the Owner tab to paste it and come back was two
// navigations to do one thing.
function InviteForm({
  ocId,
  lotId,
  ownerName,
  initialEmail,
  ownerPhone,
  onSent,
  onFailed,
}: {
  ocId: string;
  lotId: string;
  ownerName: string;
  initialEmail: string;
  ownerPhone: string;
  onSent: (email: string) => void;
  onFailed?: () => void;
}) {
  const [email, setEmail] = useState(initialEmail);
  const [invalid, setInvalid] = useState(false);

  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  function sendInvite() {
    if (!valid) {
      setInvalid(true);
      toast.error("Enter a valid email address.");
      return;
    }
    const clean = email.trim();
    // Optimistic: the pill flips and the dialog closes on the click. Sending
    // is a queue write and an email, neither of which the manager waits for,
    // so a spinner here is a delay we are choosing to show them.
    onSent(clean);
    toast.success("Invitation sent", { description: `Sent to ${clean}.` });
    void inviteLotOwner(ocId, lotId, {
      email: clean,
      name: ownerName.trim() || "Owner",
      phone: ownerPhone.trim() || undefined,
    }).then((result) => {
      if (result.error) {
        // The optimistic pill was wrong. Say so plainly , the manager needs
        // to know this one did not go, not discover it a week later.
        toast.error(`Invitation to ${clean} failed: ${result.error}`);
        onFailed?.();
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="invite-email">Email</Label>
        <Input
          id="invite-email"
          type="email"
          value={email}
          onChange={(e) => { setEmail(e.target.value); if (invalid) setInvalid(false); }}
          aria-invalid={invalid || undefined}
          placeholder="Email address"
          autoFocus={!initialEmail}
        />
      </div>
      <div className="flex justify-end">
        {/* Greyed until the address is one we can actually send to , the
            button says whether this is going to work before it is pressed. */}
        <Button onClick={sendInvite} disabled={!valid}>
          Send invitation
        </Button>
      </div>
    </div>
  );
}
