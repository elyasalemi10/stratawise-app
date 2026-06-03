"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  CalendarDays, MapPin, Video, FileText, Send, Loader2, Trash2, Download, ChevronLeft,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import Link from "next/link";
import { sendMeetingNotice, cancelMeeting, type MeetingDetail } from "@/lib/actions/meetings";
import {
  MEETING_TYPE_LABELS, MEETING_PLATFORM_LABELS,
  type MeetingType, type MeetingStatus, type MeetingPlatform,
} from "@/lib/validations/meetings";
import type { NotifyOwnerOption } from "@/lib/actions/recurring-jobs";

const STATUS_LABEL: Record<MeetingStatus, string> = {
  draft: "Draft", notice_sent: "Notice sent", in_progress: "In progress", completed: "Completed", cancelled: "Cancelled",
};
const STATUS_VARIANT: Record<MeetingStatus, "neutral" | "info" | "warning" | "success" | "destructive"> = {
  draft: "neutral", notice_sent: "info", in_progress: "warning", completed: "success", cancelled: "destructive",
};

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString("en-AU", {
    weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "numeric", minute: "2-digit",
  });
}

export function MeetingDetailContent({
  ocCode,
  meeting,
  owners,
  readOnly,
}: {
  ocCode: string;
  meeting: MeetingDetail;
  owners: NotifyOwnerOption[];
  readOnly: boolean;
}) {
  const router = useRouter();
  const [sendOpen, setSendOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const isOnline = meeting.meeting_format === "online";
  const platformLabel = meeting.online_platform
    ? MEETING_PLATFORM_LABELS[meeting.online_platform as MeetingPlatform]
    : "Online meeting";

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/ocs/${ocCode}/meetings`}
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" /> Meetings
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">{meeting.title}</h1>
            <Badge variant={STATUS_VARIANT[meeting.status]} className="rounded-full">{STATUS_LABEL[meeting.status]}</Badge>
          </div>
          {!readOnly && meeting.status !== "cancelled" && (
            <div className="flex gap-2">
              <Button onClick={() => setSendOpen(true)} className="cursor-pointer" disabled={!meeting.notice_pdf_url}>
                <Send className="size-4" />
                Send notice
              </Button>
              <Button variant="secondary" className="cursor-pointer" onClick={() => setCancelOpen(true)}>
                <Trash2 className="size-4" />
                Cancel meeting
              </Button>
            </div>
          )}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {MEETING_TYPE_LABELS[meeting.meeting_type as MeetingType]}
          {meeting.reference_number ? ` · ${meeting.reference_number}` : ""}
          {meeting.notice_sent_at ? ` · Notice sent ${new Date(meeting.notice_sent_at).toLocaleDateString("en-AU")}` : ""}
        </p>
      </div>

      <Card>
        <CardContent className="space-y-3 pt-5 text-sm">
          <div className="flex items-center gap-2 text-foreground">
            <CalendarDays className="h-4 w-4 text-muted-foreground" /> {formatWhen(meeting.date_time)}
          </div>
          {isOnline ? (
            <div className="flex items-center gap-2 text-foreground">
              <Video className="h-4 w-4 text-muted-foreground" />
              {platformLabel}
              {meeting.virtual_meeting_link && (
                <a href={meeting.virtual_meeting_link} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                  {meeting.virtual_meeting_link}
                </a>
              )}
            </div>
          ) : meeting.location ? (
            <div className="flex items-center gap-2 text-foreground">
              <MapPin className="h-4 w-4 text-muted-foreground" /> {meeting.location}
            </div>
          ) : null}
          {meeting.notice_pdf_url && (
            <div className="flex items-center gap-3 pt-1">
              <a
                href={`/api/meeting-docs/${meeting.id}?view=true`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-primary hover:underline"
              >
                <FileText className="h-4 w-4" /> View notice
              </a>
              <a
                href={`/api/meeting-docs/${meeting.id}`}
                className="inline-flex items-center gap-1.5 text-primary hover:underline"
              >
                <Download className="h-4 w-4" /> Download
              </a>
            </div>
          )}
        </CardContent>
      </Card>

      {meeting.agenda.length > 0 && (
        <Card>
          <CardContent className="pt-5">
            <h2 className="mb-3 text-base font-semibold text-foreground">Agenda</h2>
            <ol className="space-y-3">
              {meeting.agenda.map((a) => (
                <li key={a.id} className="flex gap-3">
                  <span className="text-sm font-semibold text-primary">{a.position}.</span>
                  <div>
                    <div className="text-sm font-medium text-foreground">{a.title}</div>
                    {a.motion && <p className="mt-0.5 text-sm text-muted-foreground">{a.motion}</p>}
                  </div>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}

      <SendNoticeDialog
        open={sendOpen}
        onClose={() => setSendOpen(false)}
        meetingId={meeting.id}
        owners={owners}
        onSent={() => { setSendOpen(false); router.refresh(); }}
      />

      <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this meeting?</AlertDialogTitle>
            <AlertDialogDescription>
              The meeting is marked cancelled. Owners are not notified automatically.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep meeting</AlertDialogCancel>
            <CancelConfirm meetingId={meeting.id} onDone={() => { setCancelOpen(false); router.refresh(); }} />
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function CancelConfirm({ meetingId, onDone }: { meetingId: string; onDone: () => void }) {
  const [pending, startTransition] = useTransition();
  return (
    <AlertDialogAction
      onClick={() => startTransition(async () => {
        const res = await cancelMeeting(meetingId);
        if (res.error) { toast.error(res.error); return; }
        toast.success("Meeting cancelled");
        onDone();
      })}
      disabled={pending}
    >
      {pending && <Loader2 className="size-4 animate-spin" />}
      Cancel meeting
    </AlertDialogAction>
  );
}

function SendNoticeDialog({
  open,
  onClose,
  meetingId,
  owners,
  onSent,
}: {
  open: boolean;
  onClose: () => void;
  meetingId: string;
  owners: NotifyOwnerOption[];
  onSent: () => void;
}) {
  const [scope, setScope] = useState<"all_owners" | "specific">("all_owners");
  const [selected, setSelected] = useState<Set<string>>(new Set(owners.map((o) => o.lot_owner_id)));
  const [pending, setPending] = useState(false);

  function toggle(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  }

  async function onSubmit() {
    setPending(true);
    const res = await sendMeetingNotice({
      meeting_id: meetingId,
      notify_scope: scope,
      notify_lot_owner_ids: scope === "specific" ? Array.from(selected) : [],
    });
    if (res.error) { setPending(false); toast.error(res.error); return; }
    toast.success("Notice sending in the background");
    onSent();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !pending) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Send meeting notice</DialogTitle>
          <DialogDescription>The notice PDF is emailed to the chosen owners (post-only owners are excluded).</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2">
            {(["all_owners", "specific"] as const).map((s) => (
              <label key={s} className="flex cursor-pointer items-center gap-2.5 text-sm">
                <input type="radio" name="scope" checked={scope === s} onChange={() => setScope(s)} className="size-4 accent-[color:var(--primary)]" />
                <span className="text-foreground">{s === "all_owners" ? "All lot owners" : "Specific lot owners"}</span>
              </label>
            ))}
          </div>
          {owners.length === 0 && (
            <p className="text-sm text-muted-foreground">No owners with an email on file (post-only owners are excluded).</p>
          )}
          {scope === "specific" && owners.length > 0 && (
            <div className="max-h-56 space-y-1.5 overflow-y-auto rounded-md border border-border p-2">
              {owners.map((o) => (
                <div key={o.lot_owner_id} className="flex items-center gap-2.5">
                  <Checkbox checked={selected.has(o.lot_owner_id)} onCheckedChange={(v) => toggle(o.lot_owner_id, v === true)} />
                  <span className="text-sm text-foreground">{o.name}</span>
                  <span className="text-xs text-muted-foreground">{o.lot_label}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => { if (!pending) onClose(); }} disabled={pending}>Cancel</Button>
          <Button onClick={onSubmit} disabled={pending || owners.length === 0} className="cursor-pointer">
            {pending && <Loader2 className="size-4 animate-spin" />}
            Send notice
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
