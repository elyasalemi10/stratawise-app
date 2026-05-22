"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarDays, Loader2, MapPin, Video, Plus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/shared/date-picker";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { createMeeting } from "@/lib/actions/meetings";
import {
  MEETING_TYPE_LABELS,
  type MeetingRecord,
  type MeetingStatus,
  type MeetingType,
} from "@/lib/validations/meetings";

const STATUS_LABEL: Record<MeetingStatus, string> = {
  draft: "Draft",
  notice_sent: "Notice sent",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

const STATUS_VARIANT: Record<MeetingStatus, "neutral" | "info" | "warning" | "success" | "destructive"> = {
  draft: "neutral",
  notice_sent: "info",
  in_progress: "warning",
  completed: "success",
  cancelled: "destructive",
};

// 30-minute time slots, 7:00am – 9:00pm — covers the realistic window for
// strata meetings without a native time input (banned).
const TIME_SLOTS = (() => {
  const out: { value: string; label: string }[] = [];
  for (let h = 7; h <= 21; h++) {
    for (const m of [0, 30]) {
      const hh = String(h).padStart(2, "0");
      const mm = String(m).padStart(2, "0");
      const ampm = h < 12 ? "am" : "pm";
      const h12 = h % 12 === 0 ? 12 : h % 12;
      out.push({ value: `${hh}:${mm}`, label: `${h12}:${mm} ${ampm}` });
    }
  }
  return out;
})();

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString("en-AU", {
    weekday: "short", day: "numeric", month: "short", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

export function MeetingsContent({
  ocId,
  meetings,
  readOnly,
}: {
  ocId: string;
  meetings: MeetingRecord[];
  readOnly: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {meetings.length} meeting{meetings.length === 1 ? "" : "s"}
        </p>
        {meetings.length > 0 && !readOnly && (
          <Button size="sm" onClick={() => setOpen(true)} className="cursor-pointer">
            <Plus className="mr-2 h-3.5 w-3.5" />
            Schedule meeting
          </Button>
        )}
      </div>

      {meetings.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="No meetings yet"
          description="Schedule an AGM, special general meeting, or committee meeting. Agendas, notices, and minutes build on each meeting."
          action={
            !readOnly ? (
              <Button size="sm" onClick={() => setOpen(true)}>
                <Plus className="mr-2 h-3.5 w-3.5" />
                Schedule meeting
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-3">
          {meetings.map((m) => (
            <Card key={m.id}>
              <CardContent className="pt-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold text-foreground">{m.title}</h3>
                      <Badge variant={STATUS_VARIANT[m.status]} className="rounded-full">
                        {STATUS_LABEL[m.status]}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {MEETING_TYPE_LABELS[m.meeting_type as MeetingType]}
                      {m.reference_number ? ` · ${m.reference_number}` : ""}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        <CalendarDays className="h-3.5 w-3.5" />
                        {formatWhen(m.date_time)}
                      </span>
                      {m.location && (
                        <span className="inline-flex items-center gap-1.5">
                          <MapPin className="h-3.5 w-3.5" />
                          {m.location}
                        </span>
                      )}
                      {m.virtual_meeting_link && (
                        <span className="inline-flex items-center gap-1.5">
                          <Video className="h-3.5 w-3.5" />
                          Online
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {!readOnly && (
        <ScheduleMeetingDialog
          open={open}
          onClose={() => setOpen(false)}
          ocId={ocId}
          onCreated={() => router.refresh()}
        />
      )}
    </div>
  );
}

function ScheduleMeetingDialog({
  open,
  onClose,
  ocId,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  ocId: string;
  onCreated: () => void;
}) {
  const [meetingType, setMeetingType] = useState<MeetingType>("agm");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("18:00");
  const [location, setLocation] = useState("");
  const [link, setLink] = useState("");
  const [pending, setPending] = useState(false);
  const [titleInvalid, setTitleInvalid] = useState(false);
  const [dateInvalid, setDateInvalid] = useState(false);

  // 14-day notice is required for AGM/SGM (Owners Corporations Act). Surface
  // it as a soft warning rather than a hard block — managers occasionally
  // record a meeting already agreed with owners at shorter notice.
  const noticeWarning = (() => {
    if (!date || meetingType === "committee") return null;
    const days = Math.ceil((new Date(`${date}T${time}:00`).getTime() - Date.now()) / 86_400_000);
    return days < 14 ? `AGM/SGM usually need 14 days' notice — this is ${days} day${days === 1 ? "" : "s"} away.` : null;
  })();

  function reset() {
    setMeetingType("agm");
    setTitle("");
    setDate("");
    setTime("18:00");
    setLocation("");
    setLink("");
    setTitleInvalid(false);
    setDateInvalid(false);
  }

  async function onSubmit() {
    const problems: string[] = [];
    if (!title.trim()) { problems.push("Title is required."); setTitleInvalid(true); }
    else setTitleInvalid(false);

    const when = date ? new Date(`${date}T${time}:00`) : null;
    if (!date || !when || Number.isNaN(when.getTime())) {
      problems.push("Pick a meeting date.");
      setDateInvalid(true);
    } else if (when.getTime() < Date.now()) {
      problems.push("Meeting date must be in the future.");
      setDateInvalid(true);
    } else {
      setDateInvalid(false);
    }

    if (problems.length) {
      toast.error(problems.length === 1 ? problems[0] : "Fix the highlighted fields.");
      return;
    }

    setPending(true);
    const result = await createMeeting({
      oc_id: ocId,
      meeting_type: meetingType,
      title: title.trim(),
      date_time: when!.toISOString(),
      location: location.trim() || null,
      virtual_meeting_link: link.trim() || null,
    });
    if (result.error) {
      setPending(false);
      toast.error(result.error);
      return;
    }
    toast.success("Meeting scheduled");
    reset();
    setPending(false);
    onClose();
    onCreated();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !pending) { reset(); onClose(); } }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Schedule meeting</DialogTitle>
          <DialogDescription>
            Create the meeting record. Agenda, notice distribution, and minutes
            are managed from the meeting once it&apos;s scheduled.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Meeting type <span className="text-destructive">*</span></Label>
            <Select value={meetingType} onValueChange={(v) => setMeetingType((v as MeetingType) ?? "agm")}>
              <SelectTrigger className="w-full">
                <SelectValue>{MEETING_TYPE_LABELS[meetingType]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="agm">Annual General Meeting</SelectItem>
                <SelectItem value="sgm">Special General Meeting</SelectItem>
                <SelectItem value="committee">Committee meeting</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="meeting-title">Title <span className="text-destructive">*</span></Label>
            <Input
              id="meeting-title"
              value={title}
              onChange={(e) => { setTitle(e.target.value); if (titleInvalid) setTitleInvalid(false); }}
              aria-invalid={titleInvalid || undefined}
              placeholder="Meeting title"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="meeting-date">Date <span className="text-destructive">*</span></Label>
              <DatePicker
                id="meeting-date"
                value={date}
                onChange={(v) => { setDate(v); if (dateInvalid) setDateInvalid(false); }}
                error={dateInvalid}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Time <span className="text-destructive">*</span></Label>
              <Select value={time} onValueChange={(v) => setTime(v ?? "18:00")}>
                <SelectTrigger className="w-full">
                  <SelectValue>{TIME_SLOTS.find((t) => t.value === time)?.label ?? time}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {TIME_SLOTS.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {noticeWarning && (
            <p className="text-xs text-amber-700">{noticeWarning}</p>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="meeting-location">Location</Label>
            <Input
              id="meeting-location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Where the meeting is held"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="meeting-link">Online meeting link</Label>
            <Input
              id="meeting-link"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="Video call link for remote attendees"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => { if (!pending) { reset(); onClose(); } }} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            Schedule meeting
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
