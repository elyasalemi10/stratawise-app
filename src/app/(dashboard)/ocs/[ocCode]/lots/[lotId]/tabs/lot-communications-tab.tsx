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
import { EditPopover } from "@/components/shared/edit-popover";
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
  Send,
  PhoneCall,
} from "lucide-react";
import {
  logPhoneCall,
  sendLotSms,
  sendLotEmail,
  type LotCommunicationRow,
} from "@/lib/actions/lot-communications";

// Communications tab (Item 15). Three primary actions in a top button row, a
// running ledger of past communications below.
//   - Log phone call: free-text notes, direction, duration
//   - Send message: opens a sub-popover that chooses Email or SMS
//   - SMS sends require explicit confirmation (billable cost)
// Email FROM resolves to `<manager-username>@<brand-domain>`.

interface Props {
  ocId: string;
  lotId: string;
  ownerEmail: string | null;
  ownerPhone: string | null;
  ownerName: string | null;
  initialCommunications: LotCommunicationRow[];
}

export function LotCommunicationsTab(props: Props) {
  const router = useRouter();
  const { ocId, lotId, ownerEmail, ownerPhone, ownerName, initialCommunications } = props;

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Reach out</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Logged automatically with the owner&apos;s contact details. SMS costs apply per send.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <LogCallPopover
                ocId={ocId}
                lotId={lotId}
                ownerPhone={ownerPhone}
                onSaved={() => router.refresh()}
              />
              <SendEmailPopover
                ocId={ocId}
                lotId={lotId}
                ownerEmail={ownerEmail}
                ownerName={ownerName}
                onSaved={() => router.refresh()}
              />
              <SendSmsPopover
                ocId={ocId}
                lotId={lotId}
                ownerPhone={ownerPhone}
                onSaved={() => router.refresh()}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5">
          <h3 className="text-sm font-semibold text-foreground mb-3">Communication history</h3>
          {initialCommunications.length === 0 ? (
            <p className="text-sm text-muted-foreground">No communications logged for this lot yet.</p>
          ) : (
            <ol className="divide-y divide-border">
              {initialCommunications.map((row) => (
                <CommunicationRow key={row.id} row={row} />
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Communication-history row ─────────────────────────────────────────────

function CommunicationRow({ row }: { row: LotCommunicationRow }) {
  const icon =
    row.channel === "email" ? (
      <Mail className="h-4 w-4 text-muted-foreground" />
    ) : row.channel === "sms" ? (
      <MessageSquare className="h-4 w-4 text-muted-foreground" />
    ) : (
      <PhoneIcon className="h-4 w-4 text-muted-foreground" />
    );
  const recipient = row.recipient_email ?? row.recipient_phone ?? "";
  return (
    <li className="py-3 first:pt-0 last:pb-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {icon}
            <p className="text-sm font-medium text-foreground">
              {row.channel === "voice"
                ? row.direction === "inbound"
                  ? "Inbound call"
                  : "Outbound call"
                : row.subject ?? "Message"}
            </p>
            <StatusPill status={row.status} />
          </div>
          {row.body_preview && (
            <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{row.body_preview}</p>
          )}
          <p className="mt-1 text-xs text-muted-foreground">
            {recipient}
            {row.duration_seconds !== null && row.duration_seconds !== undefined && (
              <> · {Math.floor(row.duration_seconds / 60)} min</>
            )}
            {row.actor_name && <> · by {row.actor_name}</>}
          </p>
        </div>
        <span className="text-xs text-muted-foreground shrink-0 tabular-nums">
          {new Date(row.created_at).toLocaleString("en-AU", {
            day: "numeric",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      </div>
    </li>
  );
}

function StatusPill({ status }: { status: string }) {
  const tone =
    status === "sent" || status === "delivered" || status === "logged"
      ? "bg-secondary text-foreground"
      : status === "failed" || status === "bounced"
        ? "bg-destructive/10 text-destructive"
        : "bg-cool-muted text-cool-muted-foreground";
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${tone}`}>
      {status}
    </span>
  );
}

// ─── Popovers ──────────────────────────────────────────────────────────────

function LogCallPopover({
  ocId,
  lotId,
  ownerPhone,
  onSaved,
}: {
  ocId: string;
  lotId: string;
  ownerPhone: string | null;
  onSaved: () => void;
}) {
  const [phone, setPhone] = React.useState(ownerPhone ?? "");
  const [direction, setDirection] = React.useState<"outbound" | "inbound">("outbound");
  const [durationMinutes, setDurationMinutes] = React.useState<string>("");
  const [notes, setNotes] = React.useState("");

  return (
    <EditPopover
      label="Log phone call"
      renderTrigger={() => (
        <Button variant="secondary" size="sm">
          <PhoneCall className="mr-1.5 h-3.5 w-3.5" />
          Log call
        </Button>
      )}
      onSave={async () => {
        if (!notes.trim()) return { ok: false as const, error: "Please add a short note." };
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
        return res.ok ? { ok: true as const } : { ok: false as const, error: res.error };
      }}
    >
      <Label>Direction</Label>
      <Select value={direction} onValueChange={(v) => setDirection(v as "outbound" | "inbound")}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="outbound">Outbound (I called them)</SelectItem>
          <SelectItem value="inbound">Inbound (they called me)</SelectItem>
        </SelectContent>
      </Select>
      <Label className="pt-1">Phone number</Label>
      <PhoneInput value={phone} onChange={setPhone} />
      <Label className="pt-1">Duration (minutes)</Label>
      <NumberInput
        value={durationMinutes}
        onChange={setDurationMinutes}
        placeholder="Duration in minutes"
        allowDecimal
      />
      <Label className="pt-1">Notes</Label>
      <Textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="What did you talk about?"
        rows={4}
      />
    </EditPopover>
  );
}

function SendEmailPopover({
  ocId,
  lotId,
  ownerEmail,
  ownerName,
  onSaved,
}: {
  ocId: string;
  lotId: string;
  ownerEmail: string | null;
  ownerName: string | null;
  onSaved: () => void;
}) {
  const [to, setTo] = React.useState(ownerEmail ?? "");
  const [subject, setSubject] = React.useState("");
  const [body, setBody] = React.useState("");

  return (
    <EditPopover
      label="Send email"
      renderTrigger={() => (
        <Button size="sm">
          <Mail className="mr-1.5 h-3.5 w-3.5" />
          Send email
        </Button>
      )}
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
        });
        if (res.ok) onSaved();
        return res.ok ? { ok: true as const } : { ok: false as const, error: res.error };
      }}
    >
      <p className="text-xs text-muted-foreground">
        Sent from your personal StrataWise email address. {ownerName ? `To ${ownerName}.` : ""}
      </p>
      <Label>To</Label>
      <Input type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="To" />
      <Label className="pt-1">Subject</Label>
      <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" />
      <Label className="pt-1">Message</Label>
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Write your message…"
        rows={6}
      />
    </EditPopover>
  );
}

function SendSmsPopover({
  ocId,
  lotId,
  ownerPhone,
  onSaved,
}: {
  ocId: string;
  lotId: string;
  ownerPhone: string | null;
  onSaved: () => void;
}) {
  const [phone, setPhone] = React.useState(ownerPhone ?? "");
  const [body, setBody] = React.useState("");

  return (
    <EditPopover
      label="Send SMS"
      saveLabel="Send"
      renderTrigger={() => (
        <Button variant="secondary" size="sm">
          <Send className="mr-1.5 h-3.5 w-3.5" />
          Send SMS
        </Button>
      )}
      requireConfirmation
      confirmationMessage="SMS sends are billable. Send anyway?"
      onSave={async () => {
        if (!phone.trim()) return { ok: false as const, error: "Recipient mobile is required." };
        if (!body.trim()) return { ok: false as const, error: "Message body is required." };
        const res = await sendLotSms({
          oc_id: ocId,
          lot_id: lotId,
          recipient_phone: phone,
          body,
          confirmed: true,
        });
        if (res.ok) onSaved();
        return res.ok ? { ok: true as const } : { ok: false as const, error: res.error };
      }}
    >
      <p className="text-xs text-muted-foreground">
        We&apos;ll text the owner from your StrataWise sender ID. Each SMS is billable.
      </p>
      <Label>To</Label>
      <PhoneInput value={phone} onChange={setPhone} />
      <Label className="pt-1">Message ({body.length}/320)</Label>
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value.slice(0, 320))}
        placeholder="Write your SMS…"
        rows={4}
      />
    </EditPopover>
  );
}
