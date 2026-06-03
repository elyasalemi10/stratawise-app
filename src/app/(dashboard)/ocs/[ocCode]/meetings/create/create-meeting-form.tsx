"use client";

import { useLayoutEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Loader2, FileText, CalendarDays, ListChecks, Send, Plus, Trash2,
  ArrowUp, ArrowDown, Eye, MapPin, Video, type LucideIcon,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/shared/date-picker";
import { TimeDropdowns } from "@/components/shared/time-dropdowns";
import { PlacesAutocomplete } from "@/components/shared/places-autocomplete";
import { cn } from "@/lib/utils";
import { createMeetingWithNotice, previewMeetingNotice } from "@/lib/actions/meetings";
import {
  MEETING_TYPE_LABELS, MEETING_PLATFORM_LABELS, detectMeetingPlatform,
  type MeetingType, type MeetingFormat,
} from "@/lib/validations/meetings";

type Step = "type" | "details" | "agenda" | "review";

const STEPS: Array<{ key: Step; number: number; label: string; icon: LucideIcon }> = [
  { key: "type", number: 1, label: "Type", icon: FileText },
  { key: "details", number: 2, label: "Details", icon: CalendarDays },
  { key: "agenda", number: 3, label: "Agenda", icon: ListChecks },
  { key: "review", number: 4, label: "Review", icon: Send },
];

function StepIndicator({ current }: { current: Step }) {
  const currentNumber = STEPS.find((s) => s.key === current)?.number ?? 1;
  return (
    <div className="mb-6 flex flex-wrap items-start justify-center gap-x-5 gap-y-4">
      {STEPS.map((s, i) => {
        const isDone = s.number < currentNumber;
        const isCurrent = s.number === currentNumber;
        const Icon = s.icon;
        return (
          <div key={s.key} className="flex items-start gap-4">
            <div className="flex flex-col items-center gap-2">
              <div className={cn(
                "flex h-12 w-12 shrink-0 items-center justify-center rounded-full transition-colors",
                (isDone || isCurrent) && "bg-primary text-primary-foreground",
                !isDone && !isCurrent && "border-2 border-dashed border-border bg-background text-muted-foreground",
              )}>
                <Icon className="h-5 w-5" strokeWidth={2} />
              </div>
              <span className={cn(
                "text-sm whitespace-nowrap",
                isCurrent && "font-semibold text-foreground",
                isDone && "font-medium text-primary",
                !isDone && !isCurrent && "text-muted-foreground",
              )}>{s.label}</span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={cn("mt-6 h-px w-10 shrink-0 border-t-2", isDone ? "border-solid border-primary" : "border-dashed border-border")} />
            )}
          </div>
        );
      })}
    </div>
  );
}

type AgendaRow = { id: string; title: string; motion: string };

export function CreateMeetingForm({
  ocId,
  ocCode,
  ocName,
}: {
  ocId: string;
  ocCode: string;
  ocName: string;
  owners?: unknown; // unused now (sending moved to the detail page)
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("type");

  const [meetingType, setMeetingType] = useState<MeetingType>("agm");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("18:00");
  const [format, setFormat] = useState<MeetingFormat>("in_person");
  const [location, setLocation] = useState("");
  const [link, setLink] = useState("");
  const [agenda, setAgenda] = useState<AgendaRow[]>([]);
  const idCounter = useRef(0);

  const [dateInvalid, setDateInvalid] = useState(false);
  const [linkInvalid, setLinkInvalid] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [pending, startTransition] = useTransition();

  // Minimum notice: 14 days for general meetings (AGM/SGM).
  const minDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return d.toISOString().slice(0, 10);
  }, []);

  const detectedPlatform = link.trim() ? detectMeetingPlatform(link.trim()) : null;

  function buildPayload() {
    const when = new Date(`${date}T${time}:00`);
    return {
      oc_id: ocId,
      meeting_type: meetingType,
      title: title.trim() || null,
      date_time: when.toISOString(),
      meeting_format: format,
      location: format === "in_person" ? (location.trim() || null) : null,
      virtual_meeting_link: format === "online" ? (link.trim() || null) : null,
      online_platform: format === "online" && link.trim() ? detectMeetingPlatform(link.trim()) : null,
      agenda: agenda.filter((a) => a.title.trim()).map((a) => ({ title: a.title.trim(), motion: a.motion.trim() || null })),
    };
  }

  function goNextFromDetails() {
    const problems: string[] = [];
    const when = date ? new Date(`${date}T${time}:00`) : null;
    if (!date || !when || Number.isNaN(when.getTime())) {
      problems.push("Pick a meeting date."); setDateInvalid(true);
    } else if (date < minDate) {
      problems.push("Meetings need at least 14 days' notice.");
      setDateInvalid(true);
    } else setDateInvalid(false);

    if (format === "online" && !link.trim()) {
      problems.push("Add the online meeting link."); setLinkInvalid(true);
    } else setLinkInvalid(false);

    if (problems.length) { toast.error(problems.length === 1 ? problems[0] : "Fix the highlighted fields."); return; }
    setStep("agenda");
  }

  function addAgenda() { setAgenda((a) => [...a, { id: `r${idCounter.current++}`, title: "", motion: "" }]); }
  function updateAgenda(id: string, patch: Partial<AgendaRow>) {
    setAgenda((a) => a.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }
  function removeAgenda(id: string) { setAgenda((a) => a.filter((row) => row.id !== id)); }
  function moveAgenda(index: number, dir: -1 | 1) {
    setAgenda((a) => {
      const j = index + dir;
      if (j < 0 || j >= a.length) return a;
      const next = [...a];
      [next[index], next[j]] = [next[j], next[index]];
      return next;
    });
  }

  async function onPreview() {
    setPreviewing(true);
    try {
      const res = await previewMeetingNotice(buildPayload());
      if (res.error || !res.dataUrl) { toast.error(res.error ?? "Could not generate the preview."); return; }
      const win = window.open();
      if (win) win.document.write(`<iframe src="${res.dataUrl}" style="border:0;width:100%;height:100%"></iframe>`);
    } finally {
      setPreviewing(false);
    }
  }

  function onSubmit() {
    startTransition(async () => {
      const res = await createMeetingWithNotice(buildPayload());
      if (!res.meetingId) { toast.error(res.error ?? "Could not create the meeting"); return; }
      if (res.error) toast.error(res.error); else toast.success("Meeting created");
      // Spinner stays on through the navigation to the detail page (send from there).
      router.push(`/ocs/${ocCode}/meetings/${res.meetingId}`);
    });
  }

  return (
    <div className={cn("space-y-6", pending && "pointer-events-none opacity-90")}>
      <StepIndicator current={step} />

      {step === "type" && (
        <Card>
          <CardContent className="pt-5 space-y-4">
            <Label>Meeting type <span className="text-destructive">*</span></Label>
            <div className="grid gap-3 sm:grid-cols-2">
              {(["agm", "sgm"] as MeetingType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setMeetingType(t)}
                  className={cn(
                    "flex h-full flex-col items-start gap-2 rounded-md border bg-card p-4 text-left transition-colors cursor-pointer",
                    meetingType === t ? "border-primary ring-2 ring-primary/20" : "border-border hover:border-primary/40",
                  )}
                >
                  <FileText className="h-5 w-5 text-primary" />
                  <div className="text-sm font-medium text-foreground">{MEETING_TYPE_LABELS[t]}</div>
                </button>
              ))}
            </div>
            <div className="flex justify-end">
              <Button onClick={() => setStep("details")}>Next</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === "details" && (
        <Card>
          <CardContent className="pt-5 space-y-4">
            <div className="space-y-1.5">
              <Label>Title</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={MEETING_TYPE_LABELS[meetingType]} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Date <span className="text-destructive">*</span></Label>
                <DatePicker value={date} onChange={(v) => { setDate(v); if (dateInvalid) setDateInvalid(false); }} error={dateInvalid} minDate={minDate} />
              </div>
              <div className="space-y-1.5">
                <Label>Time <span className="text-destructive">*</span></Label>
                <TimeDropdowns value={time} onChange={setTime} />
              </div>
            </div>

            {/* Format: in person vs online */}
            <div className="space-y-1.5">
              <Label>Format <span className="text-destructive">*</span></Label>
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setFormat("in_person")}
                  className={cn(
                    "flex items-center gap-2 rounded-md border bg-card p-3 text-left text-sm transition-colors cursor-pointer",
                    format === "in_person" ? "border-primary ring-2 ring-primary/20" : "border-border hover:border-primary/40",
                  )}
                >
                  <MapPin className="h-4 w-4 text-primary" /> In person
                </button>
                <button
                  type="button"
                  onClick={() => setFormat("online")}
                  className={cn(
                    "flex items-center gap-2 rounded-md border bg-card p-3 text-left text-sm transition-colors cursor-pointer",
                    format === "online" ? "border-primary ring-2 ring-primary/20" : "border-border hover:border-primary/40",
                  )}
                >
                  <Video className="h-4 w-4 text-primary" /> Online
                </button>
              </div>
            </div>

            {format === "in_person" ? (
              <div className="space-y-1.5">
                <Label>Address</Label>
                <PlacesAutocomplete value={location} onChange={setLocation} placeholder="Meeting address" />
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label>Meeting link <span className="text-destructive">*</span></Label>
                <Input
                  value={link}
                  onChange={(e) => { setLink(e.target.value); if (linkInvalid) setLinkInvalid(false); }}
                  aria-invalid={linkInvalid || undefined}
                  placeholder="Video call link"
                />
                {detectedPlatform && (
                  <p className="text-xs text-muted-foreground">Detected: {MEETING_PLATFORM_LABELS[detectedPlatform]}</p>
                )}
              </div>
            )}

            <div className="flex justify-between">
              <Button variant="secondary" onClick={() => setStep("type")}>Back</Button>
              <Button onClick={goNextFromDetails}>Next</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === "agenda" && (
        <Card>
          <CardContent className="pt-5 space-y-4">
            <div className="flex items-center justify-between">
              <Label>Agenda</Label>
              <Button size="sm" variant="secondary" onClick={addAgenda} className="cursor-pointer">
                <Plus className="mr-1.5 h-3.5 w-3.5" /> Add item
              </Button>
            </div>
            {agenda.length === 0 ? (
              <p className="text-sm text-muted-foreground">No agenda items yet. Add motions in the order they&apos;ll be discussed.</p>
            ) : (
              <AgendaList
                rows={agenda}
                onUpdate={updateAgenda}
                onRemove={removeAgenda}
                onMove={moveAgenda}
              />
            )}
            <div className="flex justify-between">
              <Button variant="secondary" onClick={() => setStep("details")}>Back</Button>
              <Button onClick={() => setStep("review")}>Next</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === "review" && (
        <Card>
          <CardContent className="pt-5 space-y-4">
            <h2 className="text-base font-semibold text-foreground">Review</h2>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted-foreground">OC</dt><dd className="text-foreground">{ocName}</dd>
              <dt className="text-muted-foreground">Type</dt><dd className="text-foreground">{MEETING_TYPE_LABELS[meetingType]}</dd>
              <dt className="text-muted-foreground">Title</dt><dd className="text-foreground">{title.trim() || MEETING_TYPE_LABELS[meetingType]}</dd>
              <dt className="text-muted-foreground">When</dt><dd className="text-foreground">{date ? new Date(`${date}T${time}:00`).toLocaleString("en-AU", { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }) : ""}</dd>
              <dt className="text-muted-foreground">Format</dt>
              <dd className="text-foreground">{format === "online" ? `Online${detectedPlatform ? ` (${MEETING_PLATFORM_LABELS[detectedPlatform]})` : ""}` : "In person"}</dd>
              {format === "in_person" && location && (<><dt className="text-muted-foreground">Address</dt><dd className="text-foreground">{location}</dd></>)}
              {format === "online" && link && (<><dt className="text-muted-foreground">Link</dt><dd className="truncate text-foreground">{link}</dd></>)}
              <dt className="text-muted-foreground">Agenda items</dt><dd className="text-foreground">{agenda.filter((a) => a.title.trim()).length}</dd>
            </dl>
            <p className="text-sm text-muted-foreground">
              Creating the meeting generates the branded notice. You can send it to owners from the meeting page.
            </p>
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <Button variant="secondary" onClick={() => setStep("agenda")} disabled={pending}>Back</Button>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={onPreview} disabled={previewing || pending} className="cursor-pointer">
                  {previewing ? <Loader2 className="size-4 animate-spin" /> : <Eye className="size-4" />}
                  Preview notice
                </Button>
                <Button onClick={onSubmit} disabled={pending} size="lg">
                  {pending && <Loader2 className="mr-2 size-4 animate-spin" />}
                  Create meeting
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// Agenda list with a FLIP reorder animation (no framer-motion). Each row keeps
// a stable id; when the order changes we invert the position delta and
// transition it back to zero so rows visibly slide.
function AgendaList({
  rows,
  onUpdate,
  onRemove,
  onMove,
}: {
  rows: AgendaRow[];
  onUpdate: (id: string, patch: Partial<AgendaRow>) => void;
  onRemove: (id: string) => void;
  onMove: (index: number, dir: -1 | 1) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const prevTops = useRef<Map<string, number>>(new Map());

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const nodes = Array.from(el.querySelectorAll<HTMLElement>("[data-agenda-row]"));
    const newTops = new Map<string, number>();
    for (const node of nodes) {
      const id = node.dataset.agendaRow!;
      const top = node.offsetTop;
      newTops.set(id, top);
      const prev = prevTops.current.get(id);
      if (prev != null && prev !== top) {
        const delta = prev - top;
        node.style.transition = "none";
        node.style.transform = `translateY(${delta}px)`;
        // Next frame: animate back to resting position.
        requestAnimationFrame(() => {
          node.style.transition = "transform 200ms ease";
          node.style.transform = "";
        });
      }
    }
    prevTops.current = newTops;
  }, [rows]);

  return (
    <div ref={containerRef} className="space-y-3">
      {rows.map((row, i) => (
        <div key={row.id} data-agenda-row={row.id} className="rounded-md border border-border bg-card p-3 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-primary">{i + 1}.</span>
            <Input value={row.title} onChange={(e) => onUpdate(row.id, { title: e.target.value })} placeholder="Agenda item title" className="flex-1" />
            <button type="button" onClick={() => onMove(i, -1)} disabled={i === 0} className="cursor-pointer text-muted-foreground hover:text-foreground disabled:opacity-30" aria-label="Move up"><ArrowUp className="h-4 w-4" /></button>
            <button type="button" onClick={() => onMove(i, 1)} disabled={i === rows.length - 1} className="cursor-pointer text-muted-foreground hover:text-foreground disabled:opacity-30" aria-label="Move down"><ArrowDown className="h-4 w-4" /></button>
            <button type="button" onClick={() => onRemove(row.id)} className="cursor-pointer text-muted-foreground hover:text-destructive" aria-label="Remove"><Trash2 className="h-4 w-4" /></button>
          </div>
          <Textarea value={row.motion} onChange={(e) => onUpdate(row.id, { motion: e.target.value })} placeholder="Motion text (optional)" rows={2} />
        </div>
      ))}
    </div>
  );
}
