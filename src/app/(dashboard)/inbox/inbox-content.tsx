"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Inbox,
  Check,
  FileText,
  Shield,
  CalendarDays,
  Mail,
  Info,
  ArrowLeft,
  Reply,
  Loader2,
  Link as LinkIcon,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EditSheet } from "@/components/shared/edit-sheet";
import { EmptyState } from "@/components/shared/empty-state";
import { toast } from "sonner";
import { formatDateLong } from "@/lib/utils";
import {
  markAsRead,
  markAllAsRead,
  type Notification,
} from "@/lib/actions/notifications";
import {
  getInboxEmail,
  replyToInboxEmail,
  associateInboxEmailToLot,
  listOcsForAssociate,
  listLotsForAssociate,
  type InboxEmailDetail,
  type OcPickerOption,
  type LotPickerOption,
} from "@/lib/actions/inbox-email";

const TYPE_ICONS: Record<string, typeof FileText> = {
  levy_issued: FileText,
  insurance_expiry: Shield,
  meeting_notice: CalendarDays,
  invitation: Mail,
  payment_received: FileText,
  email_reply: Mail,
  system: Info,
};

const TYPE_COLORS: Record<string, string> = {
  levy_issued: "bg-blue-50 text-blue-600",
  insurance_expiry: "bg-amber-50 text-amber-600",
  meeting_notice: "bg-purple-50 text-purple-600",
  invitation: "bg-green-50 text-green-600",
  payment_received: "bg-emerald-50 text-emerald-600",
  email_reply: "bg-[color:var(--brand-gold)]/15 text-[color:var(--brand-gold)]",
  system: "bg-muted text-muted-foreground",
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatDateLong(dateStr);
}

export function InboxContent({
  notifications: initial,
}: {
  notifications: Notification[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [notifications, setNotifications] = useState(initial);
  const [openId, setOpenId] = useState<string | null>(null);

  // Sync the open notification with `?n=<id>` so the bell + the route both
  // point at the same surface and reloads stay deep-linked.
  const urlOpenId = searchParams.get("n");
  useEffect(() => {
    if (urlOpenId && urlOpenId !== openId) {
      setOpenId(urlOpenId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlOpenId]);

  const unreadCount = notifications.filter((n) => !n.read_at).length;
  const openNotification = notifications.find((n) => n.id === openId);

  async function handleOpen(notification: Notification) {
    setOpenId(notification.id);
    const url = new URL(window.location.href);
    url.searchParams.set("n", notification.id);
    window.history.replaceState(null, "", url.toString());
    if (!notification.read_at) {
      await markAsRead(notification.id);
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === notification.id
            ? { ...n, read_at: new Date().toISOString() }
            : n,
        ),
      );
    }
  }

  function handleClose() {
    setOpenId(null);
    const url = new URL(window.location.href);
    url.searchParams.delete("n");
    window.history.replaceState(null, "", url.toString());
  }

  async function handleMarkAllRead() {
    await markAllAsRead();
    setNotifications((prev) =>
      prev.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })),
    );
  }

  // Single notification view
  if (openNotification) {
    if (openNotification.type === "email_reply") {
      return (
        <EmailNotificationView
          notification={openNotification}
          onBack={handleClose}
        />
      );
    }
    const Icon = TYPE_ICONS[openNotification.type] ?? Info;
    return (
      <div className="space-y-6">
        <div>
          <button
            type="button"
            onClick={handleClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
        </div>

        <Card>
          <CardContent className="pt-5">
            <div className="flex items-start gap-3 pb-4 border-b border-border">
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-full shrink-0 ${
                  TYPE_COLORS[openNotification.type] ?? TYPE_COLORS.system
                }`}
              >
                <Icon className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <h2 className="text-base font-semibold text-foreground">
                  {openNotification.title}
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {formatDateLong(openNotification.created_at)}
                </p>
              </div>
            </div>

            <div className="pt-4">
              <p className="text-sm text-foreground leading-relaxed">
                {openNotification.message}
              </p>
            </div>

            {openNotification.link && (
              <div className="pt-4 mt-4 border-t border-border">
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => router.push(openNotification.link!)}
                  className="cursor-pointer"
                >
                  View details
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // Notification list
  return (
    <div className="space-y-6">
      {unreadCount > 0 && (
        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={handleMarkAllRead}
            className="cursor-pointer"
          >
            <Check className="mr-2 h-3.5 w-3.5" />
            Mark all as read ({unreadCount})
          </Button>
        </div>
      )}

      {notifications.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="All caught up"
          description="You'll receive notifications here for levy notices, owner replies, insurance alerts, meetings, and more."
        />
      ) : (
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {notifications.map((n) => {
                const Icon = TYPE_ICONS[n.type] ?? Info;
                const isUnread = !n.read_at;

                return (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => handleOpen(n)}
                    className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors cursor-pointer ${
                      isUnread ? "bg-primary/5 hover:bg-primary/10" : "hover:bg-muted/30"
                    }`}
                  >
                    <div
                      className={`flex h-8 w-8 items-center justify-center rounded-full shrink-0 ${
                        TYPE_COLORS[n.type] ?? TYPE_COLORS.system
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p
                          className={`text-sm truncate ${
                            isUnread
                              ? "font-semibold text-foreground"
                              : "text-foreground"
                          }`}
                        >
                          {n.title}
                        </p>
                        <span className="text-xs text-muted-foreground/60 shrink-0">
                          {timeAgo(n.created_at)}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {n.message}
                      </p>
                    </div>
                    {isUnread && (
                      <div className="h-2 w-2 rounded-full bg-primary shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Email reply view ─────────────────────────────────────────────────────

function EmailNotificationView({
  notification,
  onBack,
}: {
  notification: Notification;
  onBack: () => void;
}) {
  const communicationLogId = (notification.metadata?.communication_log_id ??
    null) as string | null;
  const [detail, setDetail] = useState<InboxEmailDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [replyOpen, setReplyOpen] = useState(false);
  const [associateOpen, setAssociateOpen] = useState(false);

  useEffect(() => {
    if (!communicationLogId) {
      setError("This notification isn't linked to an email.");
      return;
    }
    let cancelled = false;
    getInboxEmail(communicationLogId).then((res) => {
      if (cancelled) return;
      if (res.ok) {
        setDetail(res.data);
      } else {
        setError(res.error);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [communicationLogId]);

  if (error) {
    return (
      <div className="space-y-6">
        <BackBar onBack={onBack} />
        <EmptyState icon={Mail} title="Email unavailable" description={error} />
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="space-y-6">
        <BackBar onBack={onBack} />
        <Card>
          <CardContent className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading email…
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <BackBar onBack={onBack} />

      <Card>
        <CardContent className="pt-5 space-y-4">
          {/* Header */}
          <div className="flex items-start justify-between gap-3 pb-4 border-b border-border">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[color:var(--brand-gold)]/15 text-[color:var(--brand-gold)] shrink-0">
                <Mail className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-foreground break-words">
                  {detail.subject || "(no subject)"}
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {formatDateLong(detail.sent_at ?? detail.created_at)}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button size="sm" onClick={() => setReplyOpen(true)}>
                <Reply className="mr-1.5 h-3.5 w-3.5" />
                Reply
              </Button>
            </div>
          </div>

          {/* Address fields */}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[auto_1fr] text-sm">
            <span className="text-xs uppercase tracking-wide text-muted-foreground sm:pt-0.5">
              From
            </span>
            <span className="font-medium text-foreground break-all">
              {detail.sender_email || "—"}
            </span>
            <span className="text-xs uppercase tracking-wide text-muted-foreground sm:pt-0.5">
              To
            </span>
            <span className="text-foreground break-all">
              {detail.recipient_email}
            </span>
            <span className="text-xs uppercase tracking-wide text-muted-foreground sm:pt-0.5">
              Lot
            </span>
            <span className="flex items-center gap-2 flex-wrap text-foreground">
              {detail.oc_id && detail.lot_id ? (
                <a
                  href={`/ocs/${detail.oc_id}/lots/${detail.lot_id}?tab=communications`}
                  className="inline-flex items-center gap-1 text-blue-600 underline-offset-4 hover:underline"
                >
                  {detail.oc_name ?? "OC"} · {detail.lot_label ?? "Lot"}
                  <LinkIcon className="h-3 w-3" />
                </a>
              ) : (
                <>
                  <span className="text-muted-foreground">Not associated</span>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setAssociateOpen(true)}
                  >
                    Associate with lot
                  </Button>
                </>
              )}
            </span>
          </div>

          {/* Body */}
          <div className="rounded-md border border-border bg-cool-muted p-4 max-h-[40rem] overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-foreground">
            {detail.body || "(empty)"}
          </div>

          {/* Original outbound thread, if matched */}
          {detail.outbound && (
            <details className="rounded-md border border-border bg-card">
              <summary className="cursor-pointer px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                In reply to —{" "}
                {detail.outbound.subject ?? "(no subject)"}
                {detail.outbound.sent_at && (
                  <> · {formatDateLong(detail.outbound.sent_at)}</>
                )}
              </summary>
              <div className="border-t border-border p-3 whitespace-pre-wrap text-sm text-muted-foreground">
                {detail.outbound.body || "(no body)"}
              </div>
            </details>
          )}

          {/* Attachments — Resend's inbound carries them, but we don't yet
              persist attachments to R2 from this route. The slot is here so
              future work landing the storage piece doesn't have to refactor
              the UI. */}
          <p className="text-xs text-muted-foreground">
            Attachments not yet supported on inbound replies.
          </p>
        </CardContent>
      </Card>

      <ReplyDrawer
        open={replyOpen}
        onClose={() => setReplyOpen(false)}
        detail={detail}
        onSent={() => setReplyOpen(false)}
      />

      <AssociateDrawer
        open={associateOpen}
        onClose={() => setAssociateOpen(false)}
        communicationLogId={detail.id}
        onSaved={(ocId, lotId) => {
          setAssociateOpen(false);
          setDetail((d) =>
            d
              ? {
                  ...d,
                  oc_id: ocId,
                  lot_id: lotId,
                }
              : d,
          );
        }}
      />
    </div>
  );
}

function BackBar({ onBack }: { onBack: () => void }) {
  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground cursor-pointer"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to inbox
      </button>
    </div>
  );
}

// ─── Reply drawer ────────────────────────────────────────────────────────

function ReplyDrawer({
  open,
  onClose,
  detail,
  onSent,
}: {
  open: boolean;
  onClose: () => void;
  detail: InboxEmailDetail;
  onSent: () => void;
}) {
  const [body, setBody] = useState("");

  useEffect(() => {
    if (!open) setBody("");
  }, [open]);

  if (!open) return null;
  return (
    <EditSheet
      label={`Reply to ${detail.sender_email || "owner"}`}
      description={
        detail.subject.toLowerCase().startsWith("re:")
          ? detail.subject
          : `Re: ${detail.subject}`
      }
      headerKicker={null}
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      renderTrigger={() => <span />}
      saveLabel="Send reply"
      successToast="Reply sent"
      onSave={async () => {
        if (!body.trim())
          return { ok: false as const, error: "Reply body is required." };
        const res = await replyToInboxEmail({
          communicationLogId: detail.id,
          body,
        });
        if (res.ok) onSent();
        return res.ok
          ? { ok: true as const }
          : { ok: false as const, error: res.error };
      }}
    >
      <div className="space-y-1.5">
        <Label>To</Label>
        <p className="rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-foreground break-all">
          {detail.sender_email}
        </p>
      </div>
      <div className="space-y-1.5">
        <Label>Reply</Label>
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write your reply…"
          rows={10}
          className="max-h-80 resize-none overflow-y-auto"
        />
      </div>
    </EditSheet>
  );
}

// ─── Associate drawer ────────────────────────────────────────────────────

function AssociateDrawer({
  open,
  onClose,
  communicationLogId,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  communicationLogId: string;
  onSaved: (ocId: string, lotId: string | null) => void;
}) {
  const [ocs, setOcs] = useState<OcPickerOption[]>([]);
  const [lots, setLots] = useState<LotPickerOption[]>([]);
  const [ocId, setOcId] = useState("");
  const [lotId, setLotId] = useState<string>("");

  useEffect(() => {
    if (!open) {
      setOcs([]);
      setLots([]);
      setOcId("");
      setLotId("");
      return;
    }
    listOcsForAssociate().then(setOcs);
  }, [open]);

  useEffect(() => {
    if (!ocId) {
      setLots([]);
      setLotId("");
      return;
    }
    listLotsForAssociate(ocId).then(setLots);
  }, [ocId]);

  const ocLabel = useMemo(
    () => ocs.find((o) => o.id === ocId)?.name ?? null,
    [ocs, ocId],
  );
  const lotLabel = useMemo(
    () => lots.find((l) => l.id === lotId)?.label ?? null,
    [lots, lotId],
  );

  if (!open) return null;
  return (
    <EditSheet
      label="Associate with lot"
      description="Pick the OC and lot this email relates to. The email will appear on the lot's Communications tab."
      headerKicker={null}
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      renderTrigger={() => <span />}
      saveLabel="Save association"
      successToast="Email associated"
      onSave={async () => {
        if (!ocId)
          return { ok: false as const, error: "Pick an Owners Corporation." };
        const res = await associateInboxEmailToLot({
          communicationLogId,
          oc_id: ocId,
          lot_id: lotId || null,
        });
        if (res.ok) {
          onSaved(ocId, lotId || null);
          toast.success("Email associated");
        }
        return res.ok
          ? { ok: true as const }
          : { ok: false as const, error: res.error };
      }}
    >
      <div className="space-y-1.5">
        <Label>
          Owners Corporation <span className="text-destructive">*</span>
        </Label>
        <Select value={ocId} onValueChange={(v) => setOcId(v ?? "")}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Choose an OC">{ocLabel}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {ocs.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label>Lot</Label>
        <Select
          value={lotId}
          onValueChange={(v) => setLotId(v ?? "")}
          disabled={!ocId || lots.length === 0}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder={ocId ? "Optional — choose a lot" : "Pick an OC first"}>
              {lotLabel}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {lots.map((l) => (
              <SelectItem key={l.id} value={l.id}>
                {l.label}
                {l.owner_name && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    {l.owner_name}
                  </span>
                )}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </EditSheet>
  );
}
