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

export function InviteStatusPopover({ ocId, lotId, lotNumber, status }: Props) {
  const ocCode = useOCCode();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState<Invitation[] | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    getLotInvitationHistory(ocId, lotId).then((rows) => {
      if (!cancelled) setHistory(rows);
    });
    return () => {
      cancelled = true;
      setHistory(null);
    };
  }, [open, ocId, lotId]);

  const loading = open && history === null;
  const historyRows = history ?? [];

  const latest = historyRows[0] ?? null;
  const isAccepted = status === "accepted";

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
            <DialogTitle className="flex items-center justify-between gap-2 pr-6">
              <span>
                Lot {lotNumber}
                {latest?.name ? ` — ${latest.name}` : ""}
              </span>
              {pillFor(status)}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Invite history */}
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">
                Invite history
              </p>
              {loading ? (
                <div className="flex items-center justify-center py-4 text-xs text-muted-foreground">
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                  Loading…
                </div>
              ) : historyRows.length === 0 ? (
                <div className="flex items-center gap-2 rounded-md border border-border bg-cool-muted p-3 text-xs text-cool-muted-foreground">
                  <MailOpen className="h-3.5 w-3.5" />
                  No invitation has been sent for this lot yet.
                </div>
              ) : (
                <ol className="space-y-2 max-h-56 overflow-y-auto pr-1">
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
                        {inv.status === "pending" && inv.expires_at && (
                          <p className="text-[11px] text-muted-foreground">
                            Expires {formatDate(inv.expires_at)}
                          </p>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </div>

            {/* Inline invite form — only when we have an email to invite. */}
            {!isAccepted && latest?.email && (
              <InviteForm
                ocId={ocId}
                lotId={lotId}
                lotNumber={lotNumber}
                initial={{
                  name: latest.name ?? "",
                  email: latest.email,
                  phone: latest.phone ?? "",
                }}
                onSent={() => {
                  setOpen(false);
                  router.refresh();
                }}
              />
            )}

            {/* Add owner / jump to Owner tab. Always available so the
                manager can hop into the full Owner UI from one click. */}
            <Link
              href={`/ocs/${ocCode}/lots/${lotId}?tab=owner`}
              className="inline-flex items-center text-sm font-medium text-blue-600 underline-offset-4 hover:underline"
              onClick={() => setOpen(false)}
            >
              Add owner / open Owner tab
              <ExternalLink className="ml-1 h-3.5 w-3.5" />
            </Link>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function InviteForm({
  ocId,
  lotId,
  lotNumber,
  initial,
  onSent,
}: {
  ocId: string;
  lotId: string;
  lotNumber: number;
  initial: { name: string; email: string; phone: string };
  onSent: () => void;
}) {
  const [name, setName] = useState(initial.name);
  const [email, setEmail] = useState(initial.email);
  const [phone, setPhone] = useState(initial.phone);
  const [sending, setSending] = useState(false);

  async function sendInvite() {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    if (!email.trim()) {
      toast.error("Add an email address before sending an invitation");
      return;
    }
    setSending(true);
    const result = await inviteLotOwner(ocId, lotId, {
      email: email.trim(),
      name: name.trim(),
      phone: phone.trim() || undefined,
    });
    setSending(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Invitation sent", { description: `Sent to ${email.trim()}.` });
    onSent();
  }

  return (
    <div className="space-y-3 rounded-md border border-border bg-cool-muted p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Send invitation — Lot {lotNumber}
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-xs">
            Full name <span className="text-destructive">*</span>
          </Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">
            Email <span className="text-destructive">*</span>
          </Label>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label className="text-xs">Phone</Label>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
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
