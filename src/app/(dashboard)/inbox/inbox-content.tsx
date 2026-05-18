"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
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
  Trash2,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { EditSheet } from "@/components/shared/edit-sheet";
import { EmptyState } from "@/components/shared/empty-state";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
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
  searchPeopleForAssociate,
  removeInboxEmail,
  type InboxEmailDetail,
  type PersonOwnershipOption,
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

// Provider hint comes from the SERVER (inbox metadata + gmail_mailbox_subscriptions
// lookup) — NOT from the sender's email domain. A reply from any address still
// arrived via the Gmail webhook, so the Gmail glyph is what reflects "how it
// got here." Sender-domain inference was misleading (a gmail-pushed reply
// from joe@randomfirm.com was rendering as a generic mail icon).
type Provider = "gmail" | "outlook" | null;

function ProviderIcon({
  provider,
  size = "sm",
}: {
  provider: Provider;
  size?: "sm" | "md";
}) {
  const px = size === "md" ? 20 : 14;
  const klass = cn(size === "md" ? "size-5" : "size-3.5", "object-contain");
  if (provider === "gmail") {
    return <Image src="/logos/gmail.webp" alt="Gmail" width={px} height={px} className={klass} />;
  }
  if (provider === "outlook") {
    return <Image src="/logos/outlook.webp" alt="Outlook" width={px} height={px} className={klass} />;
  }
  return <Mail className={cn(size === "md" ? "size-5" : "size-3.5", "text-muted-foreground")} />;
}

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
  rowProviders,
}: {
  notifications: Notification[];
  rowProviders: Record<string, "gmail" | "outlook">;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [notifications, setNotifications] = useState(initial);
  const [openId, setOpenId] = useState<string | null>(null);

  // Sync the open notification with `?n=<id>`.
  const urlOpenId = searchParams.get("n");
  useEffect(() => {
    if (urlOpenId && urlOpenId !== openId) {
      setOpenId(urlOpenId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlOpenId]);

  const unreadCount = notifications.filter((n) => !n.read_at).length;
  const openNotification = notifications.find((n) => n.id === openId) ?? null;

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

  async function handleRemove(notificationId: string) {
    const res = await removeInboxEmail(notificationId);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setNotifications((prev) => prev.filter((n) => n.id !== notificationId));
    if (openId === notificationId) {
      handleClose();
    }
    toast.success("Removed from inbox");
  }

  if (notifications.length === 0) {
    return (
      <EmptyState
        icon={Inbox}
        title="All caught up"
        description="You'll receive notifications here for levy notices, owner replies, insurance alerts, meetings, and more."
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[360px_1fr]">
      <Card
        className={cn(
          "overflow-hidden",
          openNotification && "hidden lg:block",
        )}
      >
        <CardContent className="p-0">
          {unreadCount > 0 && (
            <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/40 px-3 py-2">
              <p className="text-xs text-muted-foreground">
                {unreadCount} unread
              </p>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleMarkAllRead}
                className="h-7 cursor-pointer text-xs"
              >
                <Check className="mr-1 size-3" />
                Mark all read
              </Button>
            </div>
          )}
          <div className="divide-y divide-border max-h-[calc(100vh-12rem)] overflow-y-auto">
            {notifications.map((n) => {
              const Icon = TYPE_ICONS[n.type] ?? Info;
              const isUnread = !n.read_at;
              const isOpen = n.id === openId;
              const provider = rowProviders[n.id] ?? null;
              const showProvider = n.type === "email_reply";

              return (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => handleOpen(n)}
                  className={cn(
                    "flex w-full items-center gap-3 px-3 py-3 text-left transition-colors cursor-pointer",
                    isOpen
                      ? "bg-primary/10"
                      : isUnread
                        ? "bg-primary/5 hover:bg-primary/10"
                        : "hover:bg-muted/30",
                  )}
                >
                  <div
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-full shrink-0",
                      showProvider
                        ? "bg-card border border-border"
                        : (TYPE_COLORS[n.type] ?? TYPE_COLORS.system),
                    )}
                  >
                    {showProvider ? (
                      <ProviderIcon provider={provider} size="md" />
                    ) : (
                      <Icon className="h-3.5 w-3.5" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p
                        className={cn(
                          "text-sm truncate",
                          isUnread
                            ? "font-semibold text-foreground"
                            : "text-foreground",
                        )}
                      >
                        {n.title}
                      </p>
                      <span className="ml-auto text-xs text-muted-foreground/60 shrink-0">
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

      <div className={cn(!openNotification && "hidden lg:block")}>
        {openNotification ? (
          openNotification.type === "email_reply" ? (
            <EmailDetailPane
              key={openNotification.id}
              notification={openNotification}
              onBack={handleClose}
              onRemove={() => handleRemove(openNotification.id)}
            />
          ) : (
            <GenericDetailPane
              notification={openNotification}
              onBack={handleClose}
              onRouteTo={(href) => router.push(href)}
            />
          )
        ) : (
          <Card>
            <CardContent className="flex h-full min-h-[20rem] flex-col items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
              <Mail className="size-10 text-muted-foreground/40" />
              <p>Pick an email from the list to read it.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

// ─── Generic (non-email) detail pane ──────────────────────────────────────

function GenericDetailPane({
  notification,
  onBack,
  onRouteTo,
}: {
  notification: Notification;
  onBack: () => void;
  onRouteTo: (href: string) => void;
}) {
  const Icon = TYPE_ICONS[notification.type] ?? Info;
  return (
    <Card>
      <CardContent className="pt-5">
        <BackBar onBack={onBack} compact />
        <div className="flex items-start gap-3 pb-4 border-b border-border">
          <div
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-full shrink-0",
              TYPE_COLORS[notification.type] ?? TYPE_COLORS.system,
            )}
          >
            <Icon className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h2 className="text-base font-semibold text-foreground">
              {notification.title}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {formatDateLong(notification.created_at)}
            </p>
          </div>
        </div>
        <div className="pt-4">
          <p className="text-sm text-foreground leading-relaxed">
            {notification.message}
          </p>
        </div>
        {notification.link && (
          <div className="pt-4 mt-4 border-t border-border">
            <Button
              variant="default"
              size="sm"
              onClick={() => onRouteTo(notification.link!)}
            >
              View details
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Email detail pane ────────────────────────────────────────────────────

function EmailDetailPane({
  notification,
  onBack,
  onRemove,
}: {
  notification: Notification;
  onBack: () => void;
  onRemove: () => Promise<void> | void;
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
    getInboxEmail(communicationLogId)
      .then((res) => {
        if (cancelled) return;
        if (res.ok) {
          setDetail(res.data);
        } else {
          setError(res.error);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("getInboxEmail threw:", err);
        setError("This email couldn't be loaded. Please refresh and try again.");
      });
    return () => {
      cancelled = true;
    };
  }, [communicationLogId]);

  if (error) {
    return (
      <Card>
        <CardContent className="pt-5 space-y-4">
          <BackBar onBack={onBack} compact />
          <EmptyState icon={Mail} title="Email unavailable" description={error} card={false} />
        </CardContent>
      </Card>
    );
  }

  if (!detail) {
    return (
      <Card>
        <CardContent className="pt-5 space-y-4">
          <BackBar onBack={onBack} compact />
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading email…
          </div>
        </CardContent>
      </Card>
    );
  }

  const provider = detail.inbox_provider;
  // Prefer the Gmail-internal messageId stashed on the notification — that
  // deep-links straight to the conversation. Falls back to a sender-keyed
  // search when older ingests didn't capture the id.
  const openInProviderUrl =
    provider === "gmail" && detail.gmail_message_id
      ? `https://mail.google.com/mail/u/0/#inbox/${detail.gmail_message_id}`
      : provider === "gmail"
        ? `https://mail.google.com/mail/u/0/#search/${encodeURIComponent(detail.sender_email)}`
        : provider === "outlook"
          ? `https://outlook.office.com/mail/0/${encodeURIComponent(detail.sender_email)}`
          : null;

  return (
    <TooltipProvider delay={120}>
      <Card>
        <CardContent className="pt-5 space-y-4">
          <BackBar onBack={onBack} compact />

          {/* Header */}
          <div className="flex items-start justify-between gap-3 pb-4 border-b border-border">
            <div className="flex items-start gap-3 min-w-0">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-card border border-border shrink-0">
                <ProviderIcon provider={provider} size="md" />
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
            <div className="flex items-center gap-1.5 shrink-0">
              <Button size="sm" onClick={() => setReplyOpen(true)}>
                <Reply className="mr-1.5 h-3.5 w-3.5" />
                Reply
              </Button>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setAssociateOpen(true)}
                    />
                  }
                >
                  <LinkIcon className="mr-1.5 h-3.5 w-3.5" />
                  {detail.oc_id ? "Change lot" : "Link to lot"}
                </TooltipTrigger>
                <TooltipContent>
                  {detail.oc_id
                    ? "Re-link this email to a different lot."
                    : "Tag this email to a lot so it shows on the lot's Communications tab."}
                </TooltipContent>
              </Tooltip>
              {openInProviderUrl && (
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        variant="secondary"
                        size="icon"
                        className="h-9 w-9"
                        onClick={() =>
                          window.open(openInProviderUrl, "_blank", "noopener,noreferrer")
                        }
                      />
                    }
                  >
                    {provider === "gmail" ? (
                      <Image src="/logos/gmail.webp" alt="" width={18} height={18} className="size-4 object-contain" />
                    ) : (
                      <Image src="/logos/outlook.webp" alt="" width={18} height={18} className="size-4 object-contain" />
                    )}
                    <span className="sr-only">Open in {provider === "gmail" ? "Gmail" : "Outlook"}</span>
                  </TooltipTrigger>
                  <TooltipContent>
                    Open the original in {provider === "gmail" ? "Gmail" : "Outlook"}.
                  </TooltipContent>
                </Tooltip>
              )}
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant="secondary"
                      size="icon"
                      className="h-9 w-9 text-destructive hover:text-destructive"
                      onClick={() => onRemove()}
                    />
                  }
                >
                  <Trash2 className="size-4" />
                  <span className="sr-only">Remove from inbox</span>
                </TooltipTrigger>
                <TooltipContent>
                  Removes from your StrataWise inbox only — the original stays in
                  {provider === "gmail" ? " Gmail" : provider === "outlook" ? " Outlook" : " your mailbox"}.
                </TooltipContent>
              </Tooltip>
            </div>
          </div>

          {/* Address fields — inline label-prefixed style */}
          <div className="space-y-1.5 text-sm">
            <p className="text-foreground">
              <span className="text-muted-foreground">From: </span>
              <span className="font-medium break-all">
                {detail.sender_email || "—"}
              </span>
            </p>
            <p className="text-foreground">
              <span className="text-muted-foreground">To: </span>
              <span className="break-all">{detail.recipient_email}</span>
            </p>
            <p className="text-foreground flex items-center gap-2 flex-wrap">
              <span className="text-muted-foreground">Lot: </span>
              {detail.oc_id && detail.lot_id ? (
                <a
                  href={`/ocs/${detail.oc_id}/lots/${detail.lot_id}?tab=communications`}
                  className="inline-flex items-center gap-1 text-blue-600 underline-offset-4 hover:underline"
                >
                  {detail.oc_name ?? "OC"} · {detail.lot_label ?? "Lot"}
                  <LinkIcon className="h-3 w-3" />
                </a>
              ) : (
                <span className="text-muted-foreground">Not associated</span>
              )}
            </p>
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

        <p className="text-xs text-muted-foreground">
          Attachments not yet supported on inbound replies.
        </p>
        </CardContent>

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
      </Card>
    </TooltipProvider>
  );
}

function BackBar({ onBack, compact = false }: { onBack: () => void; compact?: boolean }) {
  return (
    <div className={cn(compact ? "lg:hidden" : "")}>
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

// ─── Associate drawer (people search) ───────────────────────────────────
//
// Combobox of OWNERSHIPS — searchable by owner name, OC name, lot label,
// or email. Multi-lot owners surface as multiple rows. Selection writes
// (oc_id, lot_id) onto the inbound row so it appears on the lot's
// Communications tab; we don't store anything about the OWNER because
// documents/comms are lot-keyed in this codebase.

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
  const [query, setQuery] = useState("");
  const [people, setPeople] = useState<PersonOwnershipOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<PersonOwnershipOption | null>(null);

  // Debounced search. Empty query returns the first page (most recent
  // owners by name) so the dropdown is never blank on open.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    const t = window.setTimeout(() => {
      searchPeopleForAssociate(query)
        .then((rows) => {
          if (cancelled) return;
          setPeople(rows);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [query, open]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setPeople([]);
      setSelected(null);
    }
  }, [open]);

  if (!open) return null;
  return (
    <EditSheet
      label="Link this email to a lot"
      description="Search owners by name, lot, OC, or email. We'll attach the email to that owner's lot so it appears on the lot's Communications tab."
      headerKicker={null}
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      renderTrigger={() => <span />}
      saveLabel="Link to lot"
      successToast="Email linked"
      onSave={async () => {
        if (!selected) {
          return { ok: false as const, error: "Pick an owner to link to." };
        }
        const res = await associateInboxEmailToLot({
          communicationLogId,
          oc_id: selected.oc_id,
          lot_id: selected.lot_id,
        });
        if (res.ok) {
          onSaved(selected.oc_id, selected.lot_id);
        }
        return res.ok
          ? { ok: true as const }
          : { ok: false as const, error: res.error };
      }}
    >
      <div className="space-y-2">
        <Label>Owner</Label>
        <Command shouldFilter={false} className="rounded-md border border-border bg-card">
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder="Search owners, lots, OCs…"
          />
          <CommandList className="max-h-72">
            {loading && <div className="px-3 py-6 text-center text-xs text-muted-foreground">Searching…</div>}
            {!loading && people.length === 0 && (
              <CommandEmpty>No matching owners.</CommandEmpty>
            )}
            {!loading && people.length > 0 && (
              <CommandGroup>
                {people.map((p) => (
                  <CommandItem
                    key={p.key}
                    value={p.key}
                    onSelect={() => setSelected(p)}
                    className={cn(
                      "flex flex-col items-start gap-0.5",
                      selected?.key === p.key && "bg-primary/10",
                    )}
                  >
                    <p className="text-sm font-medium text-foreground">
                      {p.owner_name}
                      {p.owner_email && (
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          {p.owner_email}
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {p.oc_name} · {p.lot_label}
                    </p>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
        {selected && (
          <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-cool-muted px-3 py-2 text-xs">
            <span className="text-foreground">
              Linking to <span className="font-medium">{selected.owner_name}</span> ·{" "}
              {selected.oc_name} · {selected.lot_label}
            </span>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="text-muted-foreground hover:text-foreground cursor-pointer"
            >
              Clear
            </button>
          </div>
        )}
      </div>
    </EditSheet>
  );
}
