"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, Gavel, Mail, Upload, FileText, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
  const [pending, startTransition] = useTransition();
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
      update(stepId, { attachment_url: json.key, attachment_name: json.file_name });
    } finally {
      setUploadingId(null);
    }
  }

  function onSave() {
    // Smart day order: each enabled step must be on/after the previous one.
    const emailSteps = steps.filter((s) => s.enabled);
    for (let i = 1; i < emailSteps.length; i++) {
      const prev = parseInt(emailSteps[i - 1].daysStr || "0", 10);
      const cur = parseInt(emailSteps[i].daysStr || "0", 10);
      if (cur < prev) {
        setDaysInvalidId(emailSteps[i].id);
        toast.error(`"${emailSteps[i].label ?? "A step"}" can't be before the step above it (${prev} days).`);
        return;
      }
    }
    setDaysInvalidId(null);
    startTransition(async () => {
      const res = await updateFollowupSteps({
        workflow_id: workflow.id,
        steps: steps.map((s) => ({
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
      if (res.error) { toast.error(res.error); return; }
      toast.success("Follow-up saved");
      onSaved?.();
    });
  }

  const hasEmailStep = steps.some((s) => s.step_type !== "vcat");

  return (
    <div className="space-y-4">
      {hasEmailStep && (
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
                {s.step_type === "vcat" ? <Gavel className="h-4 w-4 text-primary" /> : <Mail className="h-4 w-4 text-primary" />}
                <span className="text-sm font-semibold text-foreground">{s.label ?? (s.step_type === "vcat" ? "VCAT application" : "Email step")}</span>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={s.enabled} onCheckedChange={(v) => update(s.id, { enabled: v })} />
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
                  allowDecimal={false}
                  maxLength={3}
                  invalid={daysInvalidId === s.id}
                  placeholder="Days"
                />
              </div>
            </div>

            {s.step_type === "vcat" ? (
              <p className="text-sm text-muted-foreground">
                When this step fires, the manager is notified to prepare the VCAT fee-recovery pack (generated from the lot page once the final notice has been served for 28 days).
              </p>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label>Email subject</Label>
                  <MergeFieldEditor
                    value={s.subject ?? ""}
                    onChange={(v) => update(s.id, { subject: v })}
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
                    onFocus={() => { lastFocusedKey.current = `${s.id}:body`; }}
                    ref={(h) => { editorHandles.current.set(`${s.id}:body`, h); }}
                    placeholder="Email message"
                    rows={7}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Attachment</Label>
                  {s.attachment_url ? (
                    <div className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
                      <span className="inline-flex items-center gap-1.5 text-foreground"><FileText className="h-4 w-4 text-muted-foreground" /> {s.attachment_name ?? "Attachment"}</span>
                      <button type="button" onClick={() => update(s.id, { attachment_url: null, attachment_name: null })} className="cursor-pointer text-muted-foreground hover:text-destructive" aria-label="Remove attachment"><X className="h-4 w-4" /></button>
                    </div>
                  ) : (
                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground hover:bg-muted">
                      {uploadingId === s.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                      <span>Attach a file</span>
                      <input
                        type="file"
                        accept="application/pdf,image/png,image/jpeg,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                        className="hidden"
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(s.id, f); e.currentTarget.value = ""; }}
                      />
                    </label>
                  )}
                </div>
              </>
            )}
            </div>
          </CardContent>
        </Card>
      ))}

      <div className="flex justify-end">
        <Button onClick={onSave} disabled={pending} className="cursor-pointer">
          {pending && <Loader2 className="size-4 animate-spin" />}
          Save follow-up
        </Button>
      </div>
    </div>
  );
}
