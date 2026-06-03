"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, Gavel, Mail } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { NumberInput } from "@/components/ui/number-input";
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

  function update(id: string, patch: Partial<EditableStep>) {
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  function onSave() {
    startTransition(async () => {
      const res = await updateFollowupSteps({
        workflow_id: workflow.id,
        steps: steps.map((s) => ({
          id: s.id,
          label: s.label,
          days_after_overdue: s.daysStr.trim() ? parseInt(s.daysStr, 10) : 0,
          subject: s.subject,
          body: s.body,
          enabled: s.enabled,
        })),
      });
      if (res.error) { toast.error(res.error); return; }
      toast.success("Follow-up saved");
      onSaved?.();
    });
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-border bg-cool-muted px-3 py-2 text-xs text-cool-muted-foreground">
        Merge fields you can use in the subject and message:{" "}
        {MERGE_FIELDS.map((f) => f.token).join("  ")}
      </div>

      {steps.map((s) => (
        <Card key={s.id}>
          <CardContent className="space-y-3 pt-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                {s.step_type === "vcat" ? <Gavel className="h-4 w-4 text-primary" /> : <Mail className="h-4 w-4 text-primary" />}
                <Input
                  value={s.label ?? ""}
                  onChange={(e) => update(s.id, { label: e.target.value })}
                  placeholder="Step name"
                  className="h-8 w-56 font-medium"
                />
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={s.enabled} onCheckedChange={(v) => update(s.id, { enabled: v })} />
                <span className="text-xs text-muted-foreground">{s.enabled ? "On" : "Off"}</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Label className="text-sm">Days after due date</Label>
              <div className="w-28">
                <NumberInput value={s.daysStr} onChange={(v) => update(s.id, { daysStr: v })} allowDecimal={false} maxLength={3} placeholder="Days" />
              </div>
            </div>

            {s.step_type === "vcat" ? (
              <p className="text-sm text-muted-foreground">
                When this step fires, the manager is notified to prepare the VCAT fee-recovery pack (the pack itself is generated from the lot page once the final notice has been served for 28 days).
              </p>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label>Email subject</Label>
                  <Input value={s.subject ?? ""} onChange={(e) => update(s.id, { subject: e.target.value })} placeholder="Email subject" />
                </div>
                <div className="space-y-1.5">
                  <Label>Message</Label>
                  <Textarea value={s.body ?? ""} onChange={(e) => update(s.id, { body: e.target.value })} rows={7} placeholder="Email message" />
                </div>
              </>
            )}
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
