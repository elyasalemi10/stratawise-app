"use client";

import { useCallback, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, Mail, Upload, FileText, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { NumberInput } from "@/components/ui/number-input";
import { cn } from "@/lib/utils";
import { MergeFieldEditor, type MergeFieldEditorHandle } from "@/components/shared/merge-field-editor";
import { updateFollowupSteps } from "@/lib/actions/followup";
import { MERGE_FIELDS, type FollowupWorkflow, type FollowupStep } from "@/lib/validations/escalation";

type EditableStep = FollowupStep & { daysStr: string };

export function FollowupEditor({
  workflow,
  onSaved,
}: {
  workflow: FollowupWorkflow;
  onSaved?: () => void;
}) {
  const [steps, setSteps] = useState<EditableStep[]>(
    workflow.steps.map((s) => ({ ...s, daysStr: String(s.days_after_overdue) })),
  );
  const [, startTransition] = useTransition();
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [daysInvalidId, setDaysInvalidId] = useState<string | null>(null);
  // Handles to every subject/body editor, keyed "stepId:field"; the palette
  // inserts into whichever was last focused.
  const editorHandles = useRef<Map<string, MergeFieldEditorHandle | null>>(new Map());
  const lastFocusedKey = useRef<string | null>(null);

  function update(id: string, patch: Partial<EditableStep>) {
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  // Insert a merge field into whichever subject/message editor was last focused.
  function insertField(token: string) {
    const key = lastFocusedKey.current;
    const h = key ? editorHandles.current.get(key) : null;
    if (!h) { toast.error("Click into a subject or message box first."); return; }
    h.insertToken(token);
  }

  async function onUpload(stepId: string, file: File) {
    setUploadingId(stepId);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/followup-docs", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) { toast.error(json.error ?? "Could not upload the attachment"); return; }
      commitNow(
        steps.map((x) =>
          x.id === stepId
            ? { ...x, attachment_url: json.key, attachment_name: json.file_name }
            : x,
        ),
        stepId,
        "Attachment added",
      );
    } finally {
      setUploadingId(null);
    }
  }

  // A step saves when you leave the field you changed, and only if it
  // changed. There is no Save button: these are independent fields with
  // nothing to keep consistent between them, so there is nothing to batch,
  // and a button at the bottom of five cards is easy to walk away from.
  //
  // The one cross-field rule , a step cannot fire before the step above it ,
  // is checked on every save and red-outlines the offending day box.
  const committed = useRef<Map<string, EditableStep>>(
    new Map(steps.map((s) => [s.id, s])),
  );

  function persist(next: EditableStep[], changedId: string, label: string) {
    // Order check across the enabled steps.
    const enabled = next.filter((s) => s.enabled);
    for (let i = 1; i < enabled.length; i++) {
      const prev = parseInt(enabled[i - 1].daysStr || "0", 10);
      const cur = parseInt(enabled[i].daysStr || "0", 10);
      if (cur < prev) {
        setDaysInvalidId(enabled[i].id);
        toast.error(`"${enabled[i].label ?? "A step"}" can't be before the step above it (${prev} days).`);
        return;
      }
    }
    setDaysInvalidId(null);

    startTransition(async () => {
      const res = await updateFollowupSteps({
        workflow_id: workflow.id,
        steps: next.map((s) => ({
          id: s.id,
          label: s.label,
          days_after_overdue: s.daysStr.trim() ? parseInt(s.daysStr, 10) : 0,
          subject: s.subject,
          body: s.body,
          attachment_url: s.attachment_url,
          attachment_name: s.attachment_name,
          enabled: s.enabled,
        })),
      });
      if (res.error) {
        // Put back what the server still has, rather than leaving the field
        // showing something it refused.
        const before = committed.current.get(changedId);
        if (before) setSteps((prev) => prev.map((s) => (s.id === changedId ? before : s)));
        toast.error(res.error);
        return;
      }
      committed.current = new Map(next.map((s) => [s.id, s]));
      toast.success(`${label} saved`);
      onSaved?.();
    });
  }

  /** Save this step if the named field actually changed since the last save. */
  function commitField(id: string, field: keyof EditableStep, label: string) {
    const current = steps.find((s) => s.id === id);
    const before = committed.current.get(id);
    if (!current || !before) return;
    if (current[field] === before[field]) return;
    persist(steps, id, label);
  }

  /** Save immediately , for controls with no intermediate state to leave. */
  function commitNow(next: EditableStep[], id: string, label: string) {
    setSteps(next);
    persist(next, id, label);
  }


  return (
    <div className="space-y-4">
      {(
        <div className="rounded-md border border-border bg-card px-3 py-2.5">
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">Click a field to drop it into the subject or message you&apos;re editing:</p>
          <div className="flex flex-wrap gap-1.5">
            {MERGE_FIELDS.map((f) => (
              <button
                key={f.token}
                type="button"
                onMouseDown={(e) => e.preventDefault()} /* keep the editor focused */
                onClick={() => insertField(f.token)}
                style={{ color: f.color, background: `color-mix(in srgb, ${f.color} 12%, transparent)` }}
                className="cursor-pointer rounded-full px-2.5 py-1 text-xs font-medium hover:brightness-95"
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {steps.map((s) => (
        <Card key={s.id} className={cn(!s.enabled && "border-dashed")}>
          <CardContent className="space-y-3 pt-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold text-foreground">{s.label ?? "Email step"}</span>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={s.enabled}
                  onCheckedChange={(v) =>
                    commitNow(
                      steps.map((x) => (x.id === s.id ? { ...x, enabled: v } : x)),
                      s.id,
                      `${s.label ?? "Step"} turned ${v ? "on" : "off"}`,
                    )
                  }
                />
                <span className="text-xs text-muted-foreground">{s.enabled ? "On" : "Off"}</span>
              </div>
            </div>

            {/* Everything below the toggle dims when the step is off. */}
            <div className={cn("space-y-3", !s.enabled && "pointer-events-none opacity-50")}>
            <div className="flex items-center gap-2">
              <Label className="text-sm">Days after due date</Label>
              <div className="w-28">
                <NumberInput
                  value={s.daysStr}
                  onChange={(v) => { update(s.id, { daysStr: v }); if (daysInvalidId === s.id) setDaysInvalidId(null); }}
                  onBlur={() => commitField(s.id, "daysStr", s.label ?? "Step")}
                  allowDecimal={false}
                  maxLength={3}
                  invalid={daysInvalidId === s.id}
                  placeholder="Days"
                />
              </div>
            </div>

              <div className="space-y-1.5">
                <Label>Email subject</Label>
                <MergeFieldEditor
                  value={s.subject ?? ""}
                  onChange={(v) => update(s.id, { subject: v })}
                  onBlur={() => commitField(s.id, "subject", s.label ?? "Step")}
                  onFocus={() => { lastFocusedKey.current = `${s.id}:subject`; }}
                  ref={(h) => { editorHandles.current.set(`${s.id}:subject`, h); }}
                  placeholder="Email subject"
                  singleLine
                />
              </div>
              <div className="space-y-1.5">
                <Label>Message</Label>
                <MergeFieldEditor
                  value={s.body ?? ""}
                  onChange={(v) => update(s.id, { body: v })}
                  onBlur={() => commitField(s.id, "body", s.label ?? "Step")}
                  onFocus={() => { lastFocusedKey.current = `${s.id}:body`; }}
                  ref={(h) => { editorHandles.current.set(`${s.id}:body`, h); }}
                  placeholder="Email message"
                  rows={7}
                />
              </div>
              <AttachmentDropZone
                stepId={s.id}
                name={s.attachment_name}
                hasFile={!!s.attachment_url}
                uploading={uploadingId === s.id}
                onFile={(f) => onUpload(s.id, f)}
                onRemove={() =>
                  commitNow(
                    steps.map((x) =>
                      x.id === s.id ? { ...x, attachment_url: null, attachment_name: null } : x,
                    ),
                    s.id,
                    "Attachment removed",
                  )
                }
              />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// A file lands here by being dropped on it, or by clicking it. The old
// control was a labelled "Attachment" field with an "Attach a file" button
// inside it , two pieces of chrome to say one thing. The zone IS the label.
function AttachmentDropZone({
  stepId,
  name,
  hasFile,
  uploading,
  onFile,
  onRemove,
}: {
  stepId: string;
  name: string | null;
  hasFile: boolean;
  uploading: boolean;
  onFile: (file: File) => void;
  onRemove: () => void;
}) {
  const [over, setOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const take = useCallback(
    (list: FileList | null) => {
      const f = list?.[0];
      if (f) onFile(f);
    },
    [onFile],
  );

  if (hasFile) {
    return (
      <div className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-2 text-sm">
        <span className="inline-flex items-center gap-1.5 text-foreground">
          <FileText className="h-4 w-4 text-muted-foreground" />
          {name ?? "Attachment"}
        </span>
        <button
          type="button"
          onClick={onRemove}
          className="cursor-pointer text-muted-foreground hover:text-destructive"
          aria-label="Remove attachment"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); inputRef.current?.click(); } }}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); take(e.dataTransfer.files); }}
      className={cn(
        "flex cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed px-3 py-5 text-sm transition-colors",
        over ? "border-primary bg-primary/5 text-foreground" : "border-border bg-card text-muted-foreground hover:bg-muted",
      )}
    >
      {uploading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Upload className="h-4 w-4" />
      )}
      <span>Drop a file here, or click to choose one</span>
      <input
        ref={inputRef}
        id={`followup-file-${stepId}`}
        type="file"
        accept="application/pdf,image/png,image/jpeg,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="hidden"
        onChange={(e) => { take(e.target.files); e.currentTarget.value = ""; }}
      />
    </div>
  );
}
