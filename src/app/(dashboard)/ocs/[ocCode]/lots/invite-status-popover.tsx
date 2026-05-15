"use client";

import { useEffect, useState } from "react";
import { Calendar, Check, Loader2, Mail, MailOpen, Pencil, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { InviteDialog } from "../manage/invite-dialog";
import { getLotInvitation } from "../manage/invitation-actions";

// Pill-triggered popover that shows the invite timeline + a single primary
// action (Invite / Resend / nothing-to-do). Click the pill on a /lots row
// to open; click outside to dismiss. Click bubbling into the row's own
// onClick is stopped at the trigger so this doesn't accidentally navigate
// to the lot detail page.

type Status = "not_invited" | "noted" | "pending" | "accepted";

interface Props {
  ocId: string;
  lotId: string;
  lotNumber: number;
  status: Status;
}

function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

function pillFor(status: Status) {
  if (status === "accepted") return <Badge variant="success">Accepted</Badge>;
  if (status === "pending") return <Badge variant="warning">Pending</Badge>;
  if (status === "noted") return <Badge variant="info">Owner noted</Badge>;
  return <Badge variant="neutral">Not invited</Badge>;
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

export function InviteStatusPopover({ ocId, lotId, lotNumber, status }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);

  // Fetch the latest invitation row only when the popover first opens —
  // keeps the /lots page snappy when there are dozens of rows. Refreshes
  // each time the popover reopens so a recent resend reflects immediately.
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    getLotInvitation(ocId, lotId).then((inv) => {
      setInvitation(inv);
      setLoading(false);
    });
  }, [open, ocId, lotId]);

  const isAccepted = status === "accepted";
  const isPending = status === "pending";

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); }}
              aria-label="View invite status"
              className="inline-flex cursor-pointer items-center"
            >
              {pillFor(status)}
            </button>
          }
        />
        <PopoverContent
          align="start"
          sideOffset={6}
          className="w-80 p-3"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="space-y-3">
            {/* Header — status + key contact line */}
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Lot {lotNumber}
                </p>
                <p className="mt-0.5 text-sm font-semibold text-foreground truncate">
                  {invitation?.name || (status === "not_invited" ? "No owner on file" : "")}
                </p>
                {invitation?.email && (
                  <p className="text-xs text-muted-foreground truncate" title={invitation.email}>
                    {invitation.email}
                  </p>
                )}
              </div>
              {pillFor(status)}
            </div>

            {/* Timeline — only meaningful events get rendered. Each event is
                a small row with icon + label + date. */}
            {loading ? (
              <div className="flex items-center justify-center py-3 text-xs text-muted-foreground">
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                Loading timeline…
              </div>
            ) : (
              <ol className="space-y-2 border-l border-border pl-3">
                {invitation && (
                  <TimelineRow
                    icon={<Pencil className="h-3 w-3" />}
                    label="Contact captured"
                    date={formatDate(invitation.created_at)}
                  />
                )}
                {invitation && isPending && (
                  <TimelineRow
                    icon={<Mail className="h-3 w-3" />}
                    label="Invitation sent"
                    date={formatDate(invitation.created_at)}
                  />
                )}
                {invitation && isAccepted && (
                  <TimelineRow
                    icon={<Check className="h-3 w-3 text-[hsl(160,100%,37%)]" />}
                    label="Accepted"
                    date=""
                    sub="On the lot owner portal"
                  />
                )}
                {invitation && isPending && invitation.expires_at && (
                  <TimelineRow
                    icon={<Calendar className="h-3 w-3" />}
                    label="Expires"
                    date={formatDate(invitation.expires_at)}
                  />
                )}
                {!invitation && (
                  <TimelineRow
                    icon={<MailOpen className="h-3 w-3" />}
                    label="No invitation yet"
                    date=""
                    sub="Add the owner's contact details to send one"
                  />
                )}
              </ol>
            )}

            {/* Primary action — single button per status. Accepted owners
                get nothing actionable from the popover. */}
            <div className="flex justify-end gap-2 pt-1">
              {!isAccepted && (
                <Button
                  size="sm"
                  onClick={() => { setInviteDialogOpen(true); setOpen(false); }}
                >
                  {invitation ? (
                    <>
                      <Mail className="mr-1.5 h-3 w-3" />
                      {isPending ? "Resend invitation" : "Send invitation"}
                    </>
                  ) : (
                    <>
                      <Pencil className="mr-1.5 h-3 w-3" />
                      Add owner
                    </>
                  )}
                </Button>
              )}
              {isAccepted && (
                <p className="text-xs text-muted-foreground inline-flex items-center">
                  <X className="mr-1 h-3 w-3 opacity-0" />
                  Already on the portal — no action needed.
                </p>
              )}
            </div>
          </div>
        </PopoverContent>
      </Popover>

      <InviteDialog
        open={inviteDialogOpen}
        onClose={() => setInviteDialogOpen(false)}
        ocId={ocId}
        lotId={lotId}
        lotNumber={lotNumber}
        prefillEmail={invitation?.email ?? undefined}
        prefillName={invitation?.name ?? undefined}
        prefillPhone={invitation?.phone ?? undefined}
      />
    </>
  );
}

function TimelineRow({
  icon, label, date, sub,
}: {
  icon: React.ReactNode;
  label: string;
  date: string;
  sub?: string;
}) {
  return (
    <li className="relative -ml-[18px] flex items-start gap-3">
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground">
        {icon}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-xs font-medium text-foreground">{label}</span>
          {date && <span className="text-[10px] tabular-nums text-muted-foreground">{date}</span>}
        </div>
        {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
      </div>
    </li>
  );
}
