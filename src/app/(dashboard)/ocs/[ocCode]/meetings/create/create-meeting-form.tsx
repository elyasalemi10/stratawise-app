"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Loader2, FileText, CalendarDays, ListChecks, Users, Send, Plus, Trash2,
  ArrowUp, ArrowDown, Eye, type LucideIcon,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { NumberInput } from "@/components/ui/number-input";
import { DatePicker } from "@/components/shared/date-picker";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { createMeetingWithNotice, previewMeetingNotice } from "@/lib/actions/meetings";
import { MEETING_TYPE_LABELS, type MeetingType } from "@/lib/validations/meetings";
import type { NotifyOwnerOption } from "@/lib/actions/recurring-jobs";

type Step = "type" | "details" | "agenda" | "notify" | "review";

const STEPS: Array<{ key: Step; number: number; label: string; icon: LucideIcon }> = [
  { key: "type", number: 1, label: "Type", icon: FileText },
  { key: "details", number: 2, label: "Details", icon: CalendarDays },
  { key: "agenda", number: 3, label: "Agenda", icon: ListChecks },
  { key: "notify", number: 4, label: "Notify", icon: Users },
  { key: "review", number: 5, label: "Review", icon: Send },
];

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

type AgendaRow = { title: string; motion: string };

export function CreateMeetingForm({
  ocId,
  ocCode,
  ocName,
  owners,
}: {
  ocId: string;
  ocCode: string;
  ocName: string;
  owners: NotifyOwnerOption[];
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("type");

  const [meetingType, setMeetingType] = useState<MeetingType>("agm");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("18:00");
  const [location, setLocation] = useState("");
  const [link, setLink] = useState("");
  const [agenda, setAgenda] = useState<AgendaRow[]>([]);
  const [notifyScope, setNotifyScope] = useState<"all_owners" | "specific" | "none">("all_owners");
  const [notifyOwnerIds, setNotifyOwnerIds] = useState<Set<string>>(new Set(owners.map((o) => o.lot_owner_id)));
  const [leadTime, setLeadTime] = useState("14");

  const [titleInvalid, setTitleInvalid] = useState(false);
  const [dateInvalid, setDateInvalid] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [pending, startTransition] = useTransition();

  const noticeWarning = (() => {
    if (!date || meetingType === "committee") return null;
    const days = Math.ceil((new Date(`${date}T${time}:00`).getTime() - Date.now()) / 86_400_000);
    return days < 14 ? `AGM/SGM usually need 14 days' notice, this is ${days} day${days === 1 ? "" : "s"} away.` : null;
  })();

  function buildPayload() {
    const when = new Date(`${date}T${time}:00`);
    return {
      oc_id: ocId,
      meeting_type: meetingType,
      title: title.trim(),
      date_time: when.toISOString(),
      location: location.trim() || null,
      virtual_meeting_link: link.trim() || null,
      agenda: agenda.filter((a) => a.title.trim()).map((a) => ({ title: a.title.trim(), motion: a.motion.trim() || null })),
      notify_scope: notifyScope,
      notify_lot_owner_ids: notifyScope === "specific" ? Array.from(notifyOwnerIds) : [],
      lead_time_days: leadTime.trim() ? parseInt(leadTime, 10) : 14,
    };
  }

  function goNextFromDetails() {
    const problems: string[] = [];
    if (!title.trim()) { problems.push("Title is required."); setTitleInvalid(true); } else setTitleInvalid(false);
    const when = date ? new Date(`${date}T${time}:00`) : null;
    if (!date || !when || Number.isNaN(when.getTime())) { problems.push("Pick a meeting date."); setDateInvalid(true); }
    else if (when.getTime() < Date.now()) { problems.push("Meeting date must be in the future."); setDateInvalid(true); }
    else setDateInvalid(false);
    if (problems.length) { toast.error(problems.length === 1 ? problems[0] : "Fix the highlighted fields."); return; }
    setStep("agenda");
  }

  function addAgenda() { setAgenda((a) => [...a, { title: "", motion: "" }]); }
  function updateAgenda(i: number, patch: Partial<AgendaRow>) {
    setAgenda((a) => a.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  }
  function removeAgenda(i: number) { setAgenda((a) => a.filter((_, idx) => idx !== i)); }
  function moveAgenda(i: number, dir: -1 | 1) {
    setAgenda((a) => {
      const j = i + dir;
      if (j < 0 || j >= a.length) return a;
      const next = [...a];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  function toggleOwner(id: string, checked: boolean) {
    setNotifyOwnerIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id); else next.delete(id);
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
      if (res.error && !res.meetingId) { toast.error(res.error); return; }
      if (res.error) { toast.error(res.error); }
      else { toast.success(notifyScope === "none" ? "Meeting created" : "Meeting created, notices sending in the background"); }
      // Spinner stays on through the navigation (no setPending(false)).
      router.push(`/ocs/${ocCode}/meetings`);
    });
  }

  const recipientCount = notifyScope === "all_owners" ? owners.length : notifyScope === "specific" ? notifyOwnerIds.size : 0;

  return (
    <div className={cn("space-y-6", pending && "pointer-events-none opacity-90")}>
      <StepIndicator current={step} />

      {step === "type" && (
        <Card>
          <CardContent className="pt-5 space-y-4">
            <Label>Meeting type <span className="text-destructive">*</span></Label>
            <div className="grid gap-3 sm:grid-cols-3">
              {(["agm", "sgm", "committee"] as MeetingType[]).map((t) => (
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
              <Label>Title <span className="text-destructive">*</span></Label>
              <Input value={title} onChange={(e) => { setTitle(e.target.value); if (titleInvalid) setTitleInvalid(false); }} aria-invalid={titleInvalid || undefined} placeholder="Meeting title" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Date <span className="text-destructive">*</span></Label>
                <DatePicker value={date} onChange={(v) => { setDate(v); if (dateInvalid) setDateInvalid(false); }} error={dateInvalid} />
              </div>
              <div className="space-y-1.5">
                <Label>Time <span className="text-destructive">*</span></Label>
                <Select value={time} onValueChange={(v) => setTime(v ?? "18:00")}>
                  <SelectTrigger className="w-full"><SelectValue>{TIME_SLOTS.find((t) => t.value === time)?.label ?? time}</SelectValue></SelectTrigger>
                  <SelectContent>
                    {TIME_SLOTS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {noticeWarning && <p className="text-xs text-amber-700">{noticeWarning}</p>}
            <div className="space-y-1.5">
              <Label>Location</Label>
              <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Where the meeting is held" />
            </div>
            <div className="space-y-1.5">
              <Label>Online meeting link</Label>
              <Input value={link} onChange={(e) => setLink(e.target.value)} placeholder="Video call link for remote attendees" />
            </div>
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
              <p className="text-sm text-muted-foreground">No agenda items yet. Add motions in the order they'll be discussed.</p>
            ) : (
              <div className="space-y-3">
                {agenda.map((row, i) => (
                  <div key={i} className="rounded-md border border-border p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-primary">{i + 1}.</span>
                      <Input value={row.title} onChange={(e) => updateAgenda(i, { title: e.target.value })} placeholder="Agenda item title" className="flex-1" />
                      <button type="button" onClick={() => moveAgenda(i, -1)} disabled={i === 0} className="cursor-pointer text-muted-foreground hover:text-foreground disabled:opacity-30" aria-label="Move up"><ArrowUp className="h-4 w-4" /></button>
                      <button type="button" onClick={() => moveAgenda(i, 1)} disabled={i === agenda.length - 1} className="cursor-pointer text-muted-foreground hover:text-foreground disabled:opacity-30" aria-label="Move down"><ArrowDown className="h-4 w-4" /></button>
                      <button type="button" onClick={() => removeAgenda(i)} className="cursor-pointer text-muted-foreground hover:text-destructive" aria-label="Remove"><Trash2 className="h-4 w-4" /></button>
                    </div>
                    <Textarea value={row.motion} onChange={(e) => updateAgenda(i, { motion: e.target.value })} placeholder="Motion text (optional)" rows={2} />
                  </div>
                ))}
              </div>
            )}
            <div className="flex justify-between">
              <Button variant="secondary" onClick={() => setStep("details")}>Back</Button>
              <Button onClick={() => setStep("notify")}>Next</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === "notify" && (
        <Card>
          <CardContent className="pt-5 space-y-4">
            <Label>Who should receive the notice?</Label>
            <div className="space-y-2">
              {(["all_owners", "specific", "none"] as const).map((scopeKey) => (
                <label key={scopeKey} className="flex cursor-pointer items-center gap-2.5 text-sm">
                  <input type="radio" name="notify_scope" checked={notifyScope === scopeKey} onChange={() => setNotifyScope(scopeKey)} className="size-4 accent-[color:var(--primary)]" />
                  <span className="text-foreground">
                    {scopeKey === "all_owners" ? "All lot owners" : scopeKey === "specific" ? "Specific lot owners" : "Don't send (create only)"}
                  </span>
                </label>
              ))}
            </div>
            {notifyScope !== "none" && owners.length === 0 && (
              <p className="text-sm text-muted-foreground">No owners with an email on file (post-only owners are excluded).</p>
            )}
            {notifyScope === "specific" && owners.length > 0 && (
              <div className="max-h-56 space-y-1.5 overflow-y-auto rounded-md border border-border p-2">
                {owners.map((o) => (
                  <div key={o.lot_owner_id} className="flex items-center gap-2.5">
                    <Checkbox checked={notifyOwnerIds.has(o.lot_owner_id)} onCheckedChange={(v) => toggleOwner(o.lot_owner_id, v === true)} />
                    <span className="text-sm text-foreground">{o.name}</span>
                    <span className="text-xs text-muted-foreground">{o.lot_label}</span>
                  </div>
                ))}
              </div>
            )}
            {notifyScope !== "none" && (
              <div className="space-y-1.5">
                <Label>Lead time (days before the meeting)</Label>
                <NumberInput value={leadTime} onChange={setLeadTime} allowDecimal={false} placeholder="Lead time in days" />
              </div>
            )}
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
              <dt className="text-muted-foreground">Title</dt><dd className="text-foreground">{title}</dd>
              <dt className="text-muted-foreground">When</dt><dd className="text-foreground">{date ? new Date(`${date}T${time}:00`).toLocaleString("en-AU", { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }) : ""}</dd>
              {location && (<><dt className="text-muted-foreground">Location</dt><dd className="text-foreground">{location}</dd></>)}
              <dt className="text-muted-foreground">Agenda items</dt><dd className="text-foreground">{agenda.filter((a) => a.title.trim()).length}</dd>
              <dt className="text-muted-foreground">Recipients</dt><dd className="text-foreground">{notifyScope === "none" ? "None (create only)" : `${recipientCount} owner${recipientCount === 1 ? "" : "s"} by email`}</dd>
            </dl>
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <Button variant="secondary" onClick={() => setStep("notify")} disabled={pending}>Back</Button>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={onPreview} disabled={previewing || pending} className="cursor-pointer">
                  {previewing ? <Loader2 className="size-4 animate-spin" /> : <Eye className="size-4" />}
                  Preview notice
                </Button>
                <Button onClick={onSubmit} disabled={pending} size="lg">
                  {pending && <Loader2 className="mr-2 size-4 animate-spin" />}
                  {notifyScope === "none" ? "Create meeting" : "Generate & send notice"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
