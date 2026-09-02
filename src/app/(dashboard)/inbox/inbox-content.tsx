"use client";

import Image from "next/image";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  FileText,
  Shield,
  CalendarDays,
  Mail,
  Info,
  ArrowLeft,
  AlertTriangle,
  Loader2,
  Link as LinkIcon,
  Trash2,
  Paperclip,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatDateLong } from "@/lib/utils";
import {
  markAsRead,
  type Notification,
} from "@/lib/actions/notifications";
import {
  getInboxEmail,
  associateInboxEmailToLot,
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
// lookup) , NOT from the sender's email domain. A reply from any address still
// arrived via the Gmail webhook, so the Gmail glyph is what reflects "how it
// got here." Sender-domain inference was misleading (a gmail-pushed reply
// from joe@randomfirm.com was rendering as a generic mail icon).
type Provider = "gmail" | null;

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
  return <Mail className={cn(size === "md" ? "size-5" : "size-3.5", "text-muted-foreground")} />;
}

// Compact one-line preview text: strip the obvious markdown / HTML
// noise so notification rows don't read like `**Message not delivered**`.
// Used for list-row + bell-dropdown previews , the full body still
// gets the proper ReactMarkdown render in the detail pane.
function stripMarkdownForPreview(s: string | null | undefined): string {
  if (!s) return "";
  return s
    // Strip ** / __ bold / italic markers
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(\*|_)(.*?)\1/g, "$2")
    // Strip [text](href) link markdown → keep `text`
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    // Strip leading > quote / # heading markers
    .replace(/^\s*>+\s?/gm, "")
    .replace(/^\s*#{1,6}\s?/gm, "")
    // Strip backtick code fences
    .replace(/`+/g, "")
    // Collapse runs of whitespace + newlines into single spaces.
    .replace(/\s+/g, " ")
    .trim();
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
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

// The inbox is READ-ONLY on purpose.
//
// It used to carry a reply composer, which made it a worse Gmail: no
// threading, no search, no mobile app, and it only ever saw replies to mail
// we sent. Managers replied in their real mail client anyway , the "Open in
// Gmail" action conceded as much.
//
// What it is good at is the thing a mail client cannot do: showing inbound
// mail beside system notifications, and letting you attach a message to a
// lot so it lands on that lot's Communications tab. Read, link, move on.

export function InboxContent({
  notifications: initial,
  rowProviders,
  prefetchedEmails,
  allOwnerships,
}: {
  notifications: Notification[];
  rowProviders: Record<string, "gmail">;
  // Pre-fetched detail for the top N unread email_reply rows so opening
  // any of them is instant (no "Loading email…" flash). Anything not in
  // this map falls back to getInboxEmail() on demand.
  prefetchedEmails: Record<string, InboxEmailDetail>;
  // Eager-loaded ownership list for the firm , drives the link-to-lot
  // popover with zero per-keystroke server traffic.
  allOwnerships: PersonOwnershipOption[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [notifications, setNotifications] = useState(initial);
  const [openId, setOpenId] = useState<string | null>(null);
  // This component used to run its own 60s router.refresh() poll, plus a
  // visibility listener that refreshed on tab focus, plus a manual Refresh
  // button. All three are gone.
  //
  // The page is served by useCachedData now, which already polls every 30s,
  // already re-fetches the moment the tab becomes visible, and does it for
  // this page's key alone. router.refresh() clears the client Router Cache
  // for EVERY route, so the old poll was quietly making the whole app cold
  // once a minute for as long as the inbox sat open in a tab.

  // Keep the list in step with the prop, which the cache hook re-supplies
  // after each background re-fetch.
  useEffect(() => {
    setNotifications(initial);
  }, [initial]);

  // Sync the open notification with `?n=<id>`.
  const urlOpenId = searchParams.get("n");
  useEffect(() => {
    if (urlOpenId && urlOpenId !== openId) {
      setOpenId(urlOpenId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlOpenId]);

  const openNotification = notifications.find((n) => n.id === openId) ?? null;
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const unread = notifications.filter((n) => !n.read_at);
  const read = notifications.filter((n) => !!n.read_at);

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


  // Deleting an email now also removes it from the linked lot's
  // communications, so it goes behind a confirmation like every other
  // destructive action in the app.
  async function handleRemove(notificationId: string) {
    setDeleting(true);
    const res = await removeInboxEmail(notificationId);
    setDeleting(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setNotifications((prev) => prev.filter((n) => n.id !== notificationId));
    setDeleteTarget(null);
    if (openId === notificationId) {
      handleClose();
    }
    toast.success("Email deleted");
  }

  // No early return for the empty case. It used to bail out to a lone
  // centred EmptyState, which threw away the two-pane layout entirely: an
  // empty inbox looked like a different page from a full one, and the first
  // message to arrive rearranged the whole screen. The shell always renders;
  // the Unread and Read sections say they are empty in place.

  return (
    <div className="grid h-[calc(100vh-7rem)] grid-cols-1 gap-4 lg:grid-cols-[360px_1fr]">
      <Card
        className={cn(
          "flex flex-col overflow-hidden h-full lg:sticky lg:top-4",
          openNotification && "hidden lg:flex",
        )}
      >
        <CardContent className="p-0 flex flex-col min-h-0 flex-1">
          {/* No header bar. The unread count, the manual Refresh and
              "Mark all read" were all removed: the list already shows which
              rows are unread, and useCachedData re-fetches this page every
              30s and again the moment the tab regains focus, so a manual
              refresh button does nothing the page is not already doing. */}
          {/* Unread above Read, each under its own sticky heading.
              Reading a message does not remove it: it crosses the divide and
              stays available, which is the whole point of keeping mail here
              rather than treating the inbox as a queue you drain.

              Scroll-hidden , content fills the panel and you scroll by
              wheel / touchpad / arrow keys. No visible bar (matches the
              global no-scrollbar treatment for body / dashboard <main>). */}
          <div className="flex-1 min-h-0 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <InboxSection
              label="Unread"
              count={unread.length}
              rows={unread}
              emptyText="Nothing unread."
              openId={openId}
              rowProviders={rowProviders}
              onOpen={handleOpen}
            />
            <InboxSection
              label="Read"
              count={read.length}
              rows={read}
              emptyText="Nothing read yet."
              openId={openId}
              rowProviders={rowProviders}
              onOpen={handleOpen}
            />
          </div>
        </CardContent>
      </Card>

      <div className={cn("min-h-0 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden", !openNotification && "hidden lg:block")}>
        {openNotification ? (
          openNotification.type === "email_reply" ? (
            <EmailDetailPane
              key={openNotification.id}
              notification={openNotification}
              onBack={handleClose}
              onRemove={() => setDeleteTarget(openNotification.id)}
              prefetched={prefetchedEmails[openNotification.id] ?? null}
              allOwnerships={allOwnerships}
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
              <p>
                {notifications.length === 0
                  ? "Replies to mail you send land here, ready to link to a lot."
                  : "Pick an email from the list to read it."}
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => { if (!o && !deleting) setDeleteTarget(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              Delete this email?
            </AlertDialogTitle>
            <AlertDialogDescription>
              It is removed from your inbox and from the linked lot&apos;s
              communications, along with any attachments. The original stays in
              your mailbox. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && handleRemove(deleteTarget)}
              disabled={deleting}
            >
              {deleting && <Loader2 className="size-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── List section + row ───────────────────────────────────────────────────
//
// The left pane is two sections, Unread then Read, each with a sticky
// heading carrying its count. A section with nothing in it still renders its
// heading and a one-line note, so the divide is visible from the first frame
// and the layout does not reflow as mail moves across it.

export function InboxSection({
  label,
  count,
  rows,
  emptyText,
  openId,
  rowProviders,
  onOpen,
}: {
  label: string;
  count: number;
  rows: Notification[];
  emptyText: string;
  openId: string | null;
  rowProviders: Record<string, "gmail">;
  onOpen: (n: Notification) => void;
}) {
  return (
    <section>
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-muted/60 px-3 py-1.5 backdrop-blur-sm">
        <span className="text-xs font-medium text-foreground">{label}</span>
        <span className="text-xs tabular-nums text-muted-foreground">{count}</span>
      </div>
      {rows.length === 0 ? (
        <p className="border-b border-border px-3 py-4 text-xs text-muted-foreground">
          {emptyText}
        </p>
      ) : (
        <div className="divide-y divide-border">
          {rows.map((n) => (
            <InboxRow
              key={n.id}
              notification={n}
              isOpen={n.id === openId}
              provider={rowProviders[n.id] ?? null}
              onOpen={onOpen}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function InboxRow({
  notification: n,
  isOpen,
  provider,
  onOpen,
}: {
  notification: Notification;
  isOpen: boolean;
  provider: "gmail" | null;
  onOpen: (n: Notification) => void;
}) {
  const Icon = TYPE_ICONS[n.type] ?? Info;
  const isUnread = !n.read_at;
  const showProvider = n.type === "email_reply";

  return (
    <button
      type="button"
      onClick={() => onOpen(n)}
      className={cn(
        "flex w-full items-center gap-3 px-3 py-3 text-left transition-colors cursor-pointer",
        isOpen
          ? "bg-primary/10"
          : isUnread
            ? "bg-primary/5 hover:bg-primary/10"
            : "hover:bg-muted/30",
      )}
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center">
        {showProvider ? (
          <ProviderIcon provider={provider} size="md" />
        ) : (
          <Icon
            className={cn(
              "h-4 w-4",
              // Tint matches the previous chip background's accent so the row
              // still communicates type at a glance, just without the circle.
              (TYPE_COLORS[n.type] ?? TYPE_COLORS.system)
                .split(" ")
                .find((c) => c.startsWith("text-")) ?? "text-muted-foreground",
            )}
          />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p
            className={cn(
              "truncate text-sm",
              isUnread ? "font-semibold text-foreground" : "text-foreground",
            )}
          >
            {n.title}
          </p>
          <span className="ml-auto shrink-0 text-xs text-muted-foreground/60">
            {timeAgo(n.created_at)}
          </span>
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {stripMarkdownForPreview(n.message)}
        </p>
      </div>
      {isUnread && <div className="h-2 w-2 shrink-0 rounded-full bg-primary" />}
    </button>
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
          <Icon className={cn(
            "h-5 w-5 mt-0.5 shrink-0",
            (TYPE_COLORS[notification.type] ?? TYPE_COLORS.system).split(" ").find((c) => c.startsWith("text-")) ?? "text-muted-foreground",
          )} />
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
  prefetched,
  allOwnerships,
}: {
  notification: Notification;
  onBack: () => void;
  onRemove: () => Promise<void> | void;
  prefetched: InboxEmailDetail | null;
  allOwnerships: PersonOwnershipOption[];
}) {
  const communicationLogId = (notification.metadata?.communication_log_id ??
    null) as string | null;
  // Seed with the server-prefetched detail so the first paint shows the
  // body instead of a loading spinner. We still re-fetch in the background
  // so stale prefetches (e.g. assoc was set in another tab) overwrite.
  const [detail, setDetail] = useState<InboxEmailDetail | null>(prefetched);
  const [error, setError] = useState<string | null>(null);

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
        } else if (!prefetched) {
          // Only surface the error when we have nothing else to show.
          setError(res.error);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("getInboxEmail threw:", err);
        if (!prefetched) {
          setError("This email couldn't be loaded. Please refresh and try again.");
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  // Prefer the Gmail-internal messageId stashed on the notification , that
  // deep-links straight to the conversation. Falls back to a sender-keyed
  // search when older ingests didn't capture the id.
  const openInProviderUrl =
    provider === "gmail" && detail.gmail_message_id
      ? `https://mail.google.com/mail/u/0/#inbox/${detail.gmail_message_id}`
      : provider === "gmail"
        ? `https://mail.google.com/mail/u/0/#search/${encodeURIComponent(detail.sender_email)}`
        : null;

  return (
    <TooltipProvider delay={120}>
      <Card>
        <CardContent className="pt-5 space-y-4">
          <BackBar onBack={onBack} compact />

          {/* Header */}
          <div className="flex items-start justify-between gap-3 pb-4 border-b border-border">
            <div className="flex items-start gap-3 min-w-0">
              <ProviderIcon provider={provider} size="md" />
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
              <LinkToLotPicker
                ownerships={allOwnerships}
                linkedKey={
                  detail.oc_id && detail.lot_id
                    ? `${detail.oc_id}:${detail.lot_id}`
                    : null
                }
                onPick={async (option) => {
                  const res = await associateInboxEmailToLot({
                    communicationLogId: detail.id,
                    oc_id: option.oc_id,
                    lot_id: option.lot_id,
                  });
                  if (res.ok) {
                    // The detail panel renders the "Lot:" line from
                    // `oc_short_code`, `lot_label`, and `lot_link_label` ,
                    // not just `oc_id` / `lot_id`. Update all of them
                    // locally so the panel reflects the new link without a
                    // server round-trip; otherwise the line keeps reading
                    // "Not associated" until the page is reloaded.
                    setDetail((d) =>
                      d
                        ? {
                            ...d,
                            oc_id: option.oc_id,
                            lot_id: option.lot_id,
                            oc_name: option.oc_name,
                            oc_short_code: option.oc_short_code,
                            lot_label: option.lot_label,
                            lot_link_label: `${option.oc_name} · ${option.lot_label}`,
                          }
                        : d,
                    );
                    toast.success(`Linked to ${option.owner_name} · ${option.lot_label}`);
                  } else {
                    toast.error(res.error);
                  }
                }}
              />
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
                    <Image src="/logos/gmail.webp" alt="" width={18} height={18} className="size-4 object-contain" />
                    <span className="sr-only">Open in Gmail</span>
                  </TooltipTrigger>
                  <TooltipContent>
                    Open the original in Gmail.
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
                  <span className="sr-only">Delete email</span>
                </TooltipTrigger>
                <TooltipContent>
                  Deletes this email here AND from the lot&apos;s communications.
                  The original stays in
                  {provider === "gmail" ? " Gmail" : " your mailbox"}.
                </TooltipContent>
              </Tooltip>
            </div>
          </div>

          {/* Address fields , inline label-prefixed style */}
          <div className="space-y-1.5 text-sm">
            <p className="text-foreground">
              <span className="text-muted-foreground">From: </span>
              <span className="font-medium break-all">
                {detail.sender_email || ""}
              </span>
            </p>
            <p className="text-foreground">
              <span className="text-muted-foreground">To: </span>
              <span className="break-all">{detail.recipient_email}</span>
            </p>
            <p className="text-foreground flex items-center gap-2 flex-wrap">
              <span className="text-muted-foreground">Lot: </span>
              {detail.oc_short_code && detail.lot_id ? (
                <a
                  href={`/ocs/${detail.oc_short_code}/lots/${detail.lot_id}?tab=communications`}
                  className="inline-flex items-center gap-1 text-blue-600 underline-offset-4 hover:underline"
                >
                  {detail.lot_link_label ?? "View lot"}
                  <LinkIcon className="h-3 w-3" />
                </a>
              ) : (
                <span className="text-muted-foreground">Not associated</span>
              )}
            </p>
          </div>

        {/* Body , markdown-rendered. Emails from Gmail composers
            usually arrive as plain text but commonly contain markdown
            (auto-quoted links, bullet lists, *bold*) that managers expect
            to read formatted. remark-gfm picks up tables, autolinks, and
            strikethrough. */}
        <div className="rounded-md border border-border bg-cool-muted p-4 max-h-[40rem] overflow-y-auto text-sm leading-relaxed text-foreground prose prose-sm max-w-none prose-headings:text-foreground prose-strong:text-foreground prose-a:text-blue-600">
          {detail.body ? (
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {detail.body}
            </ReactMarkdown>
          ) : (
            <p className="text-muted-foreground">(empty)</p>
          )}
        </div>

        {/* The outbound message this reply answers.
            Presented exactly like the email above it: the same label-prefixed
            address lines and the same bordered body panel. It used to be a
            collapsed <details> with an ALL-CAPS summary, which read as a
            different kind of object entirely, and hid the one piece of
            context that makes the reply make sense. */}
        {detail.outbound && (
          <div className="space-y-3 border-t border-border pt-4">
            <p className="text-sm font-semibold text-foreground">Replying To</p>

            <div className="space-y-1.5 text-sm">
              <p className="text-foreground">
                <span className="text-muted-foreground">Subject: </span>
                <span className="font-medium break-all">
                  {detail.outbound.subject ?? ""}
                </span>
              </p>
              {detail.outbound.sent_at && (
                <p className="text-foreground">
                  <span className="text-muted-foreground">Sent: </span>
                  <span>{formatDateLong(detail.outbound.sent_at)}</span>
                </p>
              )}
            </div>

            <div className="rounded-md border border-border bg-cool-muted p-4 max-h-[40rem] overflow-y-auto text-sm leading-relaxed text-foreground prose prose-sm max-w-none prose-headings:text-foreground prose-strong:text-foreground prose-a:text-blue-600">
              {detail.outbound.body ? (
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {detail.outbound.body}
                </ReactMarkdown>
              ) : (
                <p className="text-muted-foreground">(empty)</p>
              )}
            </div>
          </div>
        )}

        {detail.attachments.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-sm font-semibold text-foreground">Attachments</p>
            <ul className="space-y-1">
              {detail.attachments.map((att) => (
                <li key={att.id}>
                  <a
                    href={`/api/inbox-attachments/${att.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    download={att.filename}
                    className="flex items-center justify-between gap-2 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs hover:bg-muted/40 cursor-pointer"
                  >
                    <span className="inline-flex items-center gap-2 min-w-0">
                      <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate text-foreground">{att.filename}</span>
                    </span>
                    <span className="shrink-0 text-muted-foreground tabular-nums">
                      {formatBytes(att.size_bytes)}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
        </CardContent>

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

// ─── Associate drawer (people search) ───────────────────────────────────
//
// Combobox of OWNERSHIPS , searchable by owner name, OC name, lot label,
// or email. Multi-lot owners surface as multiple rows. Selection writes
// (oc_id, lot_id) onto the inbound row so it appears on the lot's
// Communications tab; we don't store anything about the OWNER because
// documents/comms are lot-keyed in this codebase.

// LinkToLotPicker , the shadcn <Combobox>, not a hand-rolled one.
//
// This was a Popover wrapping a raw cmdk Command with its own filter, its
// own empty state and a fake 200ms spinner that pulsed after every keystroke
// to make a synchronous array filter look like a network call. All of that
// is what the shared component already does, correctly and consistently with
// every other picker in the app, so none of it is here any more.
//
// Every ownership for the firm is eager-loaded server-side and passed in via
// `ownerships`, so the combobox filters locally with no network hit. Item
// values are the composite ownership key; `keywords` carries the human text
// so typing an owner name, a lot label or a plan number finds the row even
// though the value itself is an id.
//
// When already linked the trigger reads the linked lot ("Joe Smith · Lot
// 12") instead of "Link to lot", so the current state is visible without
// opening it.
function LinkToLotPicker({
  ownerships,
  linkedKey,
  onPick,
}: {
  ownerships: PersonOwnershipOption[];
  linkedKey: string | null;
  onPick: (option: PersonOwnershipOption) => Promise<void> | void;
}) {
  const linked = linkedKey
    ? ownerships.find((p) => p.key === linkedKey) ?? null
    : null;

  return (
    <Combobox
      items={ownerships}
      value={linkedKey ?? ""}
      onValueChange={(key) => {
        const picked = ownerships.find((p) => p.key === key);
        if (picked) void onPick(picked);
      }}
    >
      <ComboboxInput
        className="h-9 max-w-64"
        placeholder="Link to lot"
        display={linked ? `${linked.owner_name} · ${linked.lot_label}` : undefined}
      />
      <ComboboxContent className="w-96">
        <ComboboxEmpty>No matching owners.</ComboboxEmpty>
        <ComboboxList>
          {(p: PersonOwnershipOption) => (
            <ComboboxItem
              key={p.key}
              value={p.key}
              keywords={[p.owner_name, p.lot_label, p.oc_name, p.oc_short_code, p.owner_email ?? ""]}
              className="py-2"
            >
              {/* Two lines, name first. You are looking for a PERSON here ,
                  the email came from someone, and their name is what you
                  recognise. The lot and which OC it is in answer the next
                  question, so they sit underneath rather than competing for
                  the same line. The one-line version put all three in a row
                  and truncated the name, which is the one part that had to
                  survive. */}
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate text-sm font-medium text-foreground">
                  {p.owner_name}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {p.lot_label} · {p.oc_name}
                </span>
              </span>
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
