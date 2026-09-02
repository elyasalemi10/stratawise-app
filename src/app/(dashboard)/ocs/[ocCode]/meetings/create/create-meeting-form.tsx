"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  FileText, CalendarDays, ListChecks, Gavel, Send, Plus, Trash2,
  GripVertical, MapPin, Video, type LucideIcon,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { DatePicker } from "@/components/shared/date-picker";
import { SwapSlot } from "@/components/shared/swap-slot";
import { TimeDropdowns } from "@/components/shared/time-dropdowns";
import { VicAddressAutocomplete, type ParsedAddress } from "@/components/shared/vic-address-autocomplete";
import { cn } from "@/lib/utils";
import { createMeetingWithNotice } from "@/lib/actions/meetings";
import { MEETING_TYPE_LABELS, type MeetingType, type MeetingFormat } from "@/lib/validations/meetings";

type Step = "type" | "details" | "agenda" | "notice" | "review";

const STEPS: Array<{ key: Step; number: number; label: string; icon: LucideIcon }> = [
  { key: "type", number: 1, label: "Type", icon: FileText },
  { key: "details", number: 2, label: "Details", icon: CalendarDays },
  { key: "agenda", number: 3, label: "Agenda", icon: ListChecks },
  { key: "notice", number: 4, label: "Notice", icon: Gavel },
  { key: "review", number: 5, label: "Review", icon: Send },
];

const EMPTY_ADDRESS: ParsedAddress = { street_number: "", street_name: "", suburb: "", state: "VIC", postcode: "", formatted: "" };

// Exported so loading.tsx can render the exact same strip. Step 1 of this
// wizard is entirely fixed copy, so its loading state is the real first
// screen rather than a shimmer, and duplicating this markup over there
// would let the two drift.
export function StepIndicator({ current }: { current: Step }) {
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

type AgendaRow = {
  id: string;
  title: string;
  /** Background the owner needs to read the motion. agenda_items.description
   *  has always existed; the wizard just never asked for it. */
  description: string;
  motion: string;
  /** Ordinary / special / unanimous. Special and unanimous resolutions have
   *  different thresholds under the Act, and a notice that does not say which
   *  a motion needs cannot be voted on properly. */
  resolutionType: ResolutionType;
};

type ResolutionType = "ordinary" | "special" | "unanimous" | "information";

const RESOLUTION_LABEL: Record<ResolutionType, string> = {
  information: "For information (no vote)",
  ordinary: "Ordinary resolution",
  special: "Special resolution",
  unanimous: "Unanimous resolution",
};

const RESOLUTION_OPTIONS = (
  Object.keys(RESOLUTION_LABEL) as ResolutionType[]
).map((value) => ({ value, label: RESOLUTION_LABEL[value] }));

export function CreateMeetingForm({
  ocId,
  ocCode,
  ocName,
  defaultChairperson,
  defaultProxyReturnTo,
}: {
  ocId: string;
  ocCode: string;
  ocName: string;
  /** The signed-in manager. They chair their own OCs' meetings in the
   *  ordinary case, so it is prefilled rather than typed every time. */
  defaultChairperson?: string | null;
  /** The firm's email. Where proxies go back to, unless told otherwise. */
  defaultProxyReturnTo?: string | null;
  owners?: unknown; // unused now (sending moved to the detail page)
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("type");

  const [meetingType, setMeetingType] = useState<MeetingType>("agm");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("18:00");
  const [format, setFormat] = useState<MeetingFormat>("in_person");
  const [address, setAddress] = useState<ParsedAddress>(EMPTY_ADDRESS);
  const [link, setLink] = useState("");
  const [agenda, setAgenda] = useState<AgendaRow[]>([]);
  const idCounter = useRef(0);

  // Notice step. All optional , a notice is valid without them, but every
  // one of these is something an owner reading the notice would otherwise
  // have to ring the office to find out.
  const [chairperson, setChairperson] = useState(defaultChairperson ?? "");
  const [proxyCutoff, setProxyCutoff] = useState("");
  const [proxyReturnTo, setProxyReturnTo] = useState(defaultProxyReturnTo ?? "");
  // Proxies close the day before the meeting by default. Follows the meeting
  // date until the manager sets one themselves, at which point we stop
  // moving it under them.
  const [proxyCutoffTouched, setProxyCutoffTouched] = useState(false);
  const [accompanyingDocuments, setAccompanyingDocuments] = useState("");
  const [noticeNotes, setNoticeNotes] = useState("");

  const [dateInvalid, setDateInvalid] = useState(false);
  const [linkInvalid, setLinkInvalid] = useState(false);
  const [pending, startTransition] = useTransition();

  const defaultProxyCutoff = useMemo(() => {
    if (!date) return "";
    const d = new Date(`${date}T00:00:00`);
    d.setDate(d.getDate() - 1);
    const m = `${d.getMonth() + 1}`.padStart(2, "0");
    const day = `${d.getDate()}`.padStart(2, "0");
    return `${d.getFullYear()}-${m}-${day}`;
  }, [date]);

  const effectiveProxyCutoff = proxyCutoffTouched ? proxyCutoff : defaultProxyCutoff;

  // Minimum notice: 14 days for general meetings (AGM/SGM).
  const minDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return d.toISOString().slice(0, 10);
  }, []);

  function buildPayload() {
    const when = new Date(`${date}T${time}:00`);
    return {
      oc_id: ocId,
      meeting_type: meetingType,
      title: title.trim() || null,
      date_time: when.toISOString(),
      meeting_format: format,
      location: format === "in_person" ? (address.formatted.trim() || null) : null,
      virtual_meeting_link: format === "online" ? (link.trim() || null) : null,
      // online_platform is detected server-side (handles short links/redirects).
      chairperson: chairperson.trim() || null,
      proxy_cutoff_at: effectiveProxyCutoff
        ? new Date(`${effectiveProxyCutoff}T17:00:00`).toISOString()
        : null,
      proxy_return_to: proxyReturnTo.trim() || null,
      accompanying_documents: accompanyingDocuments.trim() || null,
      notice_notes: noticeNotes.trim() || null,
      agenda: agenda
        .filter((a) => a.title.trim())
        .map((a) => ({
          title: a.title.trim(),
          description: a.description.trim() || null,
          motion: a.motion.trim() || null,
          resolution_type: a.resolutionType,
        })),
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

  function goNextFromAgenda() {
    // Don't allow empty agenda items , every row must have a title.
    if (agenda.some((a) => !a.title.trim())) {
      toast.error("Remove or fill in the empty agenda items.");
      return;
    }
    setStep("notice");
  }

  function addAgenda() {
    setAgenda((a) => [
      ...a,
      { id: `r${idCounter.current++}`, title: "", description: "", motion: "", resolutionType: "information" },
    ]);
  }
  function updateAgenda(id: string, patch: Partial<AgendaRow>) {
    setAgenda((a) => a.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }
  function removeAgenda(id: string) { setAgenda((a) => a.filter((row) => row.id !== id)); }
  function reorderAgenda(from: number, to: number) {
    setAgenda((a) => {
      if (from === to || from < 0 || to < 0 || from >= a.length || to >= a.length) return a;
      const next = [...a];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }

  function onSubmit() {
    startTransition(async () => {
      const res = await createMeetingWithNotice(buildPayload());
      if (!res.meetingId) { toast.error(res.error ?? "Could not create the meeting"); return; }
      if (res.error) toast.error(res.error); else toast.success("Meeting created");
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

            {/* Both branches share one cell, so picking Online instead of In
                person does not move the Back/Next row underneath. */}
            <SwapSlot
              cases={[
                {
                  key: "in_person",
                  active: format === "in_person",
                  node: (
                    <div className="space-y-1.5">
                      <Label>Address</Label>
                      <VicAddressAutocomplete value={address} onChange={setAddress} />
                    </div>
                  ),
                },
                {
                  key: "online",
                  active: format === "online",
                  node: (
                    <div className="space-y-1.5">
                      <Label>Meeting link <span className="text-destructive">*</span></Label>
                      <Input
                        value={link}
                        onChange={(e) => { setLink(e.target.value); if (linkInvalid) setLinkInvalid(false); }}
                        aria-invalid={linkInvalid || undefined}
                        placeholder="Video call link"
                      />
                    </div>
                  ),
                },
              ]}
            />

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
              <AgendaList rows={agenda} onUpdate={updateAgenda} onRemove={removeAgenda} onReorder={reorderAgenda} />
            )}
            <div className="flex justify-between">
              <Button variant="secondary" onClick={() => setStep("details")}>Back</Button>
              <Button onClick={goNextFromAgenda}>Next</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === "notice" && (
        <Card>
          <CardContent className="pt-5 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Chairperson</Label>
                <Input
                  value={chairperson}
                  onChange={(e) => setChairperson(e.target.value)}
                  placeholder="Name of the person chairing"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Proxies close</Label>
                <DatePicker
                  value={effectiveProxyCutoff}
                  onChange={(v) => { setProxyCutoffTouched(true); setProxyCutoff(v); }}
                  maxDate={date || undefined}
                  placeholder="Last day to lodge a proxy"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Return proxies to</Label>
              <Input
                value={proxyReturnTo}
                onChange={(e) => setProxyReturnTo(e.target.value)}
                placeholder="Email address or postal address"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Documents included</Label>
              <Textarea
                value={accompanyingDocuments}
                onChange={(e) => setAccompanyingDocuments(e.target.value)}
                placeholder="One document per line"
                rows={3}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Notes to owners</Label>
              <Textarea
                value={noticeNotes}
                onChange={(e) => setNoticeNotes(e.target.value)}
                placeholder="Anything else that should appear on the notice"
                rows={3}
              />
            </div>

            <div className="flex justify-between">
              <Button variant="secondary" onClick={() => setStep("agenda")}>Back</Button>
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
              <dd className="text-foreground">{format === "online" ? "Online" : "In person"}</dd>
              {format === "in_person" && address.formatted && (<><dt className="text-muted-foreground">Address</dt><dd className="text-foreground">{address.formatted}</dd></>)}
              {format === "online" && link && (<><dt className="text-muted-foreground">Link</dt><dd className="truncate text-foreground">{link}</dd></>)}
              <dt className="text-muted-foreground">Agenda items</dt><dd className="text-foreground">{agenda.length}</dd>
            </dl>
            <div className="flex items-center justify-between gap-3 pt-2">
              <Button variant="secondary" onClick={() => setStep("notice")} disabled={pending}>Back</Button>
              <Button onClick={onSubmit} disabled={pending} size="lg" loading={pending}>
                Create meeting
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// Agenda list with native drag-and-drop reordering (no framer-motion / no dnd
// library). Each row is draggable by its grip handle.
function AgendaList({
  rows,
  onUpdate,
  onRemove,
  onReorder,
}: {
  rows: AgendaRow[];
  onUpdate: (id: string, patch: Partial<AgendaRow>) => void;
  onRemove: (id: string) => void;
  onReorder: (from: number, to: number) => void;
}) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  return (
    <div className="space-y-3">
      {rows.map((row, i) => (
        <div
          key={row.id}
          draggable
          onDragStart={() => setDragIndex(i)}
          onDragOver={(e) => { e.preventDefault(); if (overIndex !== i) setOverIndex(i); }}
          onDrop={(e) => { e.preventDefault(); if (dragIndex !== null) onReorder(dragIndex, i); setDragIndex(null); setOverIndex(null); }}
          onDragEnd={() => { setDragIndex(null); setOverIndex(null); }}
          className={cn(
            "rounded-md border bg-card p-3 space-y-2 transition-colors",
            overIndex === i && dragIndex !== null && dragIndex !== i ? "border-primary ring-2 ring-primary/20" : "border-border",
            dragIndex === i && "opacity-60",
          )}
        >
          <div className="flex items-center gap-2">
            <span className="cursor-grab text-muted-foreground active:cursor-grabbing" aria-label="Drag to reorder"><GripVertical className="h-4 w-4" /></span>
            <span className="text-sm font-semibold text-primary">{i + 1}.</span>
            <Input value={row.title} onChange={(e) => onUpdate(row.id, { title: e.target.value })} placeholder="Agenda item title" className="flex-1" />
            <button type="button" onClick={() => onRemove(row.id)} className="cursor-pointer text-muted-foreground hover:text-destructive" aria-label="Remove"><Trash2 className="h-4 w-4" /></button>
          </div>
          <Textarea
            value={row.description}
            onChange={(e) => onUpdate(row.id, { description: e.target.value })}
            placeholder="Background for owners"
            rows={2}
          />
          <div className="grid gap-2 sm:grid-cols-[1fr_14rem]">
            <Textarea
              value={row.motion}
              onChange={(e) => onUpdate(row.id, { motion: e.target.value })}
              placeholder="Motion text"
              rows={2}
            />
            <Select
              value={row.resolutionType}
              onValueChange={(v) =>
                onUpdate(row.id, { resolutionType: (v ?? "information") as ResolutionType })
              }
            >
              <SelectTrigger>
                <SelectValue>{RESOLUTION_LABEL[row.resolutionType]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {RESOLUTION_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      ))}
    </div>
  );
}
