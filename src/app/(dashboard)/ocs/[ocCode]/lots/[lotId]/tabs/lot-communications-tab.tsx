"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PhoneInput } from "@/components/shared/phone-input";
import { NumberInput } from "@/components/ui/number-input";
import { EditSheet } from "@/components/shared/edit-sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Mail,
  Phone as PhoneIcon,
  MessageSquare,
  Paperclip,
  X,
  PhoneCall,
  Send,
  ChevronDown,
} from "lucide-react";
import { toast } from "sonner";
import {
  logPhoneCall,
  sendLotSms,
  sendLotEmail,
  type LotCommunicationRow,
} from "@/lib/actions/lot-communications";
import { getManagerSendAddress } from "@/lib/actions/manager-username";

// Communications tab: one "Actions" dropdown that opens a drawer per action
// (Send email / Send SMS / Log phone call). History below renders one row per
// past communication; clicking a row opens a read-only detail dialog with the
// full subject / body / metadata instead of dumping everything inline.

interface Props {
  ocId: string;
  lotId: string;
  ownerEmail: string | null;
  ownerPhone: string | null;
  ownerName: string | null;
  initialCommunications: LotCommunicationRow[];
}

type DrawerName = null | "email" | "sms" | "call";

export function LotCommunicationsTab(props: Props) {
  const router = useRouter();
  const { ocId, lotId, ownerEmail, ownerPhone, ownerName, initialCommunications } = props;
  const [open, setOpen] = React.useState<DrawerName>(null);
  const [detail, setDetail] = React.useState<LotCommunicationRow | null>(null);

  return (
    <div className="space-y-6">
      {/* Actions dropdown — replaces the old "Reach out" three-button bar. */}
      <Card>
        <CardContent className="pt-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-foreground">
                Reach out
              </h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Every send is logged against this lot. SMS sends are billable.
              </p>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button size="sm">
                    Actions
                    <ChevronDown className="ml-1.5 h-3.5 w-3.5" />
                  </Button>
                }
              />
              <DropdownMenuContent align="end" sideOffset={6}>
                <DropdownMenuItem onClick={() => setOpen("email")}>
                  <Mail className="mr-2 h-4 w-4 text-[color:var(--brand-gold)]" />
                  Send email
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setOpen("sms")}>
                  <Send className="mr-2 h-4 w-4 text-[color:var(--brand-gold)]" />
                  Send SMS
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setOpen("call")}>
                  <PhoneCall className="mr-2 h-4 w-4 text-[color:var(--brand-gold)]" />
                  Log phone call
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardContent>
      </Card>

      {/* Communication history */}
      <Card>
        <CardContent className="pt-5">
          <h3 className="text-sm font-semibold text-foreground mb-3">
            Communication history
          </h3>
          {initialCommunications.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No communications logged for this lot yet.
            </p>
          ) : (
            <ol className="divide-y divide-border">
              {initialCommunications.map((row) => (
                <CommunicationRow
                  key={row.id}
                  row={row}
                  onClick={() => setDetail(row)}
                />
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      {/* Drawers — only the open one mounts. Mount/unmount on `open` so each
          drawer's local state resets between uses. */}
      {open === "email" && (
        <SendEmailDrawer
          ocId={ocId}
          lotId={lotId}
          ownerEmail={ownerEmail}
          ownerName={ownerName}
          onClose={() => setOpen(null)}
          onSaved={() => router.refresh()}
        />
      )}
      {open === "sms" && (
        <SendSmsDrawer
          ocId={ocId}
          lotId={lotId}
          ownerPhone={ownerPhone}
          onClose={() => setOpen(null)}
          onSaved={() => router.refresh()}
        />
      )}
      {open === "call" && (
        <LogCallDrawer
          ocId={ocId}
          lotId={lotId}
          ownerPhone={ownerPhone}
          onClose={() => setOpen(null)}
          onSaved={() => router.refresh()}
        />
      )}

      {detail && (
        <CommunicationDetailDialog
          row={detail}
          onClose={() => setDetail(null)}
        />
      )}
    </div>
  );
}

// ─── History row (compact; click to expand) ────────────────────────────────

function CommunicationRow({
  row,
  onClick,
}: {
  row: LotCommunicationRow;
  onClick: () => void;
}) {
  const Icon =
    row.channel === "email"
      ? Mail
      : row.channel === "sms"
        ? MessageSquare
        : PhoneIcon;
  const title =
    row.channel === "voice"
      ? row.direction === "inbound"
        ? "Inbound call"
        : "Outbound call"
      : row.subject || "Message";

  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-center justify-between gap-3 py-3 text-left transition-colors hover:bg-muted/50 cursor-pointer rounded-md px-2 -mx-2"
      >
        <div className="flex min-w-0 items-center gap-3">
          <Icon className="h-4 w-4 shrink-0 text-[color:var(--brand-gold)]" />
          <p className="truncate text-sm font-medium text-foreground">{title}</p>
          <StatusPill status={row.status} />
        </div>
        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
          {formatShortDate(row.created_at)}
        </span>
      </button>
    </li>
  );
}

function StatusPill({ status }: { status: string }) {
  const tone =
    status === "sent" || status === "delivered" || status === "logged"
      ? "bg-[color:var(--brand-gold)]/15 text-[color:var(--brand-gold)]"
      : status === "failed" || status === "bounced"
        ? "bg-destructive/10 text-destructive"
        : "bg-cool-muted text-cool-muted-foreground";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${tone}`}
    >
      {status}
    </span>
  );
}

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ─── Detail dialog ─────────────────────────────────────────────────────────

function CommunicationDetailDialog({
  row,
  onClose,
}: {
  row: LotCommunicationRow;
  onClose: () => void;
}) {
  const Icon =
    row.channel === "email"
      ? Mail
      : row.channel === "sms"
        ? MessageSquare
        : PhoneIcon;
  const title =
    row.channel === "voice"
      ? row.direction === "inbound"
        ? "Inbound call"
        : "Outbound call"
      : row.subject || "Message";
  const recipient = row.recipient_email ?? row.recipient_phone ?? "—";

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className="h-4 w-4 text-[color:var(--brand-gold)]" />
            {title}
          </DialogTitle>
        </DialogHeader>

        <dl className="space-y-2 text-sm">
          <DetailRow label="To" value={recipient} />
          <DetailRow label="Date" value={formatShortDate(row.created_at)} />
          <DetailRow label="Status" value={row.status} />
          {row.actor_name && <DetailRow label="From" value={row.actor_name} />}
          {row.duration_seconds !== null && row.duration_seconds !== undefined && (
            <DetailRow
              label="Duration"
              value={`${Math.floor(row.duration_seconds / 60)} min`}
            />
          )}
        </dl>

        {row.body_preview && (
          <div className="rounded-md border border-border bg-cool-muted p-3 text-sm leading-relaxed text-foreground whitespace-pre-wrap max-h-80 overflow-y-auto">
            {row.body_preview}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="text-right text-sm font-medium text-foreground break-all">
        {value}
      </dd>
    </div>
  );
}

// ─── Send email drawer ─────────────────────────────────────────────────────

interface AttachmentDraft {
  file: File;
  base64: string;
}

const MAX_ATTACHMENTS = 5;
const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024; // 8MB each

async function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      // result: "data:<mime>;base64,<payload>" — strip the prefix.
      const result = reader.result as string;
      const idx = result.indexOf(",");
      resolve(idx === -1 ? result : result.slice(idx + 1));
    };
    reader.readAsDataURL(file);
  });
}

function SendEmailDrawer({
  ocId,
  lotId,
  ownerEmail,
  ownerName,
  onClose,
  onSaved,
}: {
  ocId: string;
  lotId: string;
  ownerEmail: string | null;
  ownerName: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [to, setTo] = React.useState(ownerEmail ?? "");
  const [subject, setSubject] = React.useState("");
  const [body, setBody] = React.useState("");
  const [attachments, setAttachments] = React.useState<AttachmentDraft[]>([]);
  const [senderAddress, setSenderAddress] = React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    let cancelled = false;
    getManagerSendAddress()
      .then((res) => {
        if (!cancelled) setSenderAddress(res.address ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const ownerHasEmail = !!(ownerEmail && ownerEmail.trim());

  async function handleFiles(filesList: FileList | null) {
    if (!filesList || filesList.length === 0) return;
    const remaining = MAX_ATTACHMENTS - attachments.length;
    if (remaining <= 0) {
      toast.error(`You can attach up to ${MAX_ATTACHMENTS} files.`);
      return;
    }
    const incoming = Array.from(filesList).slice(0, remaining);
    const accepted: AttachmentDraft[] = [];
    for (const file of incoming) {
      if (file.size > MAX_ATTACHMENT_BYTES) {
        toast.error(`${file.name} is over 8MB.`);
        continue;
      }
      try {
        const base64 = await readFileAsBase64(file);
        accepted.push({ file, base64 });
      } catch {
        toast.error(`Could not read ${file.name}.`);
      }
    }
    if (accepted.length > 0) {
      setAttachments((prev) => [...prev, ...accepted]);
    }
  }

  function removeAttachment(idx: number) {
    setAttachments((prev) => prev.filter((_, i) => i !== idx));
  }

  return (
    <EditSheet
      label="Send email"
      description={ownerName ? `To ${ownerName}` : "Choose where this email should go"}
      headerKicker={null}
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      renderTrigger={() => <span />}
      saveLabel="Send email"
      onSave={async () => {
        if (!to.trim()) return { ok: false as const, error: "Recipient email is required." };
        if (!subject.trim()) return { ok: false as const, error: "Subject is required." };
        if (!body.trim()) return { ok: false as const, error: "Message body is required." };
        const res = await sendLotEmail({
          oc_id: ocId,
          lot_id: lotId,
          recipient_email: to.trim(),
          subject: subject.trim(),
          body,
          attachments: attachments.map((a) => ({
            filename: a.file.name,
            contentType: a.file.type || "application/octet-stream",
            base64: a.base64,
          })),
        });
        if (res.ok) onSaved();
        return res.ok
          ? { ok: true as const }
          : { ok: false as const, error: res.error };
      }}
    >
      <div className="rounded-md border border-border bg-cool-muted px-3 py-2 text-xs text-cool-muted-foreground">
        <p>
          Sending from{" "}
          <span className="font-medium text-foreground">
            {senderAddress ?? "your StrataWise email address"}
          </span>
          .
        </p>
        <p className="mt-1">Replies come back to your inbox.</p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="comm-to">To</Label>
        <Input
          id="comm-to"
          type="email"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder="Recipient email"
        />
        {!ownerHasEmail && (
          <p className="text-xs text-destructive">
            This owner doesn&apos;t have an email on file — type one above to
            send anyway. It won&apos;t be saved to the owner&apos;s details.
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="comm-subject">Subject</Label>
        <Input
          id="comm-subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Subject"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="comm-body">Message</Label>
        <Textarea
          id="comm-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write your message…"
          rows={8}
          className="max-h-72 resize-none overflow-y-auto"
        />
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label>Attachments</Label>
          <span className="text-xs text-muted-foreground">
            {attachments.length}/{MAX_ATTACHMENTS} · max 8MB each
          </span>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={attachments.length >= MAX_ATTACHMENTS}
        >
          <Paperclip className="mr-1.5 h-3.5 w-3.5" />
          Add files
        </Button>
        {attachments.length > 0 && (
          <ul className="space-y-1.5 pt-1">
            {attachments.map((a, idx) => (
              <li
                key={`${a.file.name}-${idx}`}
                className="flex items-center justify-between gap-2 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs"
              >
                <span className="truncate text-foreground">{a.file.name}</span>
                <button
                  type="button"
                  onClick={() => removeAttachment(idx)}
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                  aria-label={`Remove ${a.file.name}`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </EditSheet>
  );
}

// ─── Send SMS drawer ────────────────────────────────────────────────────────

function SendSmsDrawer({
  ocId,
  lotId,
  ownerPhone,
  onClose,
  onSaved,
}: {
  ocId: string;
  lotId: string;
  ownerPhone: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [phone, setPhone] = React.useState(ownerPhone ?? "");
  const [body, setBody] = React.useState("");
  const ownerHasPhone = !!(ownerPhone && ownerPhone.trim());

  return (
    <EditSheet
      label="Send SMS"
      description="Sent via Mobile Message. Each send is billable."
      headerKicker={null}
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      renderTrigger={() => <span />}
      saveLabel="Send SMS"
      requireConfirmation
      confirmationMessage="SMS sends are billable. Send anyway?"
      onSave={async () => {
        if (!phone.trim())
          return { ok: false as const, error: "Recipient mobile is required." };
        if (!body.trim())
          return { ok: false as const, error: "Message body is required." };
        const res = await sendLotSms({
          oc_id: ocId,
          lot_id: lotId,
          recipient_phone: phone,
          body,
          confirmed: true,
        });
        if (res.ok) onSaved();
        return res.ok
          ? { ok: true as const }
          : { ok: false as const, error: res.error };
      }}
    >
      <div className="space-y-1.5">
        <Label>To</Label>
        <PhoneInput value={phone} onChange={setPhone} />
        {!ownerHasPhone && (
          <p className="text-xs text-destructive">
            This owner doesn&apos;t have a mobile on file — enter one above to
            send. It won&apos;t be saved to the owner&apos;s details.
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label>Message ({body.length}/320)</Label>
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value.slice(0, 320))}
          placeholder="Write your SMS…"
          rows={6}
          className="max-h-60 resize-none overflow-y-auto"
        />
      </div>
    </EditSheet>
  );
}

// ─── Log call drawer ────────────────────────────────────────────────────────

function LogCallDrawer({
  ocId,
  lotId,
  ownerPhone,
  onClose,
  onSaved,
}: {
  ocId: string;
  lotId: string;
  ownerPhone: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [phone, setPhone] = React.useState(ownerPhone ?? "");
  const [direction, setDirection] = React.useState<"outbound" | "inbound">(
    "outbound",
  );
  const [durationMinutes, setDurationMinutes] = React.useState<string>("");
  const [notes, setNotes] = React.useState("");

  return (
    <EditSheet
      label="Log phone call"
      description="Record a call you've already had with this owner."
      headerKicker={null}
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      renderTrigger={() => <span />}
      saveLabel="Save call log"
      onSave={async () => {
        if (!notes.trim())
          return { ok: false as const, error: "Please add a short note." };
        const durationSeconds = durationMinutes.trim()
          ? Math.round(parseFloat(durationMinutes) * 60)
          : null;
        const res = await logPhoneCall({
          oc_id: ocId,
          lot_id: lotId,
          recipient_phone: phone || "Unknown",
          direction,
          duration_seconds: durationSeconds,
          notes,
        });
        if (res.ok) onSaved();
        return res.ok
          ? { ok: true as const }
          : { ok: false as const, error: res.error };
      }}
    >
      <div className="space-y-1.5">
        <Label>Direction</Label>
        <Select
          value={direction}
          onValueChange={(v) => setDirection(v as "outbound" | "inbound")}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="outbound">Outbound (I called them)</SelectItem>
            <SelectItem value="inbound">Inbound (they called me)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label>Phone number</Label>
        <PhoneInput value={phone} onChange={setPhone} />
      </div>

      <div className="space-y-1.5">
        <Label>Duration (minutes)</Label>
        <NumberInput
          value={durationMinutes}
          onChange={setDurationMinutes}
          placeholder="Duration in minutes"
          allowDecimal
        />
      </div>

      <div className="space-y-1.5">
        <Label>Notes</Label>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="What did you talk about?"
          rows={6}
          className="max-h-60 resize-none overflow-y-auto"
        />
      </div>
    </EditSheet>
  );
}
