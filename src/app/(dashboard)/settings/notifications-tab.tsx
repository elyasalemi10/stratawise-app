"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import {
  NOTIFICATION_TYPES,
  MANDATORY_NOTIFICATION_TYPES,
  MANAGERIAL_NOTIFICATION_TYPES,
  type NotificationType,
} from "@/lib/notifications";
import { updateNotificationPreferences } from "@/lib/actions/notification-preferences";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import type { NotificationPrefRow, AutoOptOutEntry } from "./page";

// Human-readable labels for each notification type. Renders in the
// settings table; falls back to the raw type if not in the map.
const TYPE_LABELS: Record<NotificationType, string> = {
  levy_issued: "Levy issued",
  payment_received: "Payment received",
  overdue_reminder: "Overdue reminder",
  claim_matched: "Claim matched",
  claim_rejected: "Claim rejected",
  new_claim_submitted: "New claim submitted (manager)",
  meeting_notice: "Meeting notice",
  meeting_minutes: "Meeting minutes",
  maintenance_update: "Maintenance update",
  announcement: "Announcement",
  complaint_update: "Complaint update",
  escalation_step: "Escalation step",
  document_uploaded: "Document uploaded",
};

type Channel = "email" | "in_app";
type StateMap = Record<string, { email: boolean; in_app: boolean }>;

function formatAutoOptOutDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function NotificationsTab({
  currentPreferences,
  autoOptOuts,
}: {
  currentPreferences: NotificationPrefRow[];
  autoOptOuts: AutoOptOutEntry[];
}) {
  const [pending, startTransition] = useTransition();

  // Build initial state map: default opt-in (true) for any type+channel
  // not represented in currentPreferences.
  const [state, setState] = useState<StateMap>(() => {
    const init: StateMap = {};
    for (const type of NOTIFICATION_TYPES) {
      init[type] = { email: true, in_app: true };
    }
    for (const pref of currentPreferences) {
      if (pref.channel !== "email" && pref.channel !== "in_app") continue;
      const t = pref.notification_type as NotificationType;
      if (!init[t]) continue;
      init[t][pref.channel] = pref.enabled;
    }
    return init;
  });

  // Auto-opt-out lookup keyed `${type}:${channel}` for per-row banner.
  const autoOptOutMap = new Map<string, AutoOptOutEntry>();
  for (const a of autoOptOuts) {
    autoOptOutMap.set(`${a.type}:${a.channel}`, a);
  }

  function setChannel(type: NotificationType, channel: Channel, enabled: boolean) {
    setState((prev) => ({
      ...prev,
      [type]: { ...prev[type], [channel]: enabled },
    }));
  }

  function onSubmit() {
    const updates: Array<{ type: NotificationType; channel: Channel; enabled: boolean }> = [];
    for (const type of NOTIFICATION_TYPES) {
      const isMandatory = MANDATORY_NOTIFICATION_TYPES.has(type);
      const isManagerial = MANAGERIAL_NOTIFICATION_TYPES.has(type);
      // Email channel: skip mandatory (server enforces too).
      if (!isMandatory) {
        updates.push({ type, channel: "email", enabled: state[type].email });
      }
      // In-app channel: skip managerial (always-on; server enforces too).
      if (!isManagerial) {
        updates.push({ type, channel: "in_app", enabled: state[type].in_app });
      }
    }

    startTransition(async () => {
      const result = await updateNotificationPreferences({ updates });
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success("Notification preferences saved");
    });
  }

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <h2 className="text-base font-semibold text-foreground">Notification preferences</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose which notifications reach you and through which channels. SMS, voice, and post are coming later.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 text-left">Notification type</th>
              <th className="px-4 py-2.5 text-center w-32">Email</th>
              <th className="px-4 py-2.5 text-center w-32">In-app</th>
            </tr>
          </thead>
          <tbody>
            {NOTIFICATION_TYPES.map((type) => {
              const isMandatory = MANDATORY_NOTIFICATION_TYPES.has(type);
              const isManagerial = MANAGERIAL_NOTIFICATION_TYPES.has(type);
              const emailAutoOptOut = autoOptOutMap.get(`${type}:email`);
              // No in-app auto-opt-out pathway today — only Resend's
              // email.complained webhook fires the auto-opt-out write,
              // and that's email-channel-only. Banner is channel-
              // specific to avoid mis-labelling future in-app pathways.
              const label = TYPE_LABELS[type] ?? type;

              return (
                <tr key={type} className="border-t border-border align-top">
                  <td className="px-4 py-3 text-foreground">
                    <div className="font-medium">{label}</div>
                    {emailAutoOptOut && (
                      <div className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-warning" />
                        <span>
                          You marked this email as spam on{" "}
                          {formatAutoOptOutDate(emailAutoOptOut.occurredAt)}.
                          Re-enable below if this was a mistake.
                        </span>
                      </div>
                    )}
                  </td>

                  {/* Email column */}
                  <td className="px-4 py-3 text-center">
                    {isMandatory ? (
                      <div className="flex flex-col items-center gap-1">
                        <Switch checked={true} disabled />
                        <span className="text-xs text-muted-foreground">Required by law</span>
                      </div>
                    ) : (
                      <Switch
                        checked={state[type].email}
                        onCheckedChange={(v) => setChannel(type, "email", v)}
                        disabled={pending}
                      />
                    )}
                  </td>

                  {/* In-app column */}
                  <td className="px-4 py-3 text-center">
                    {isManagerial ? (
                      <div className="flex flex-col items-center gap-1">
                        <Switch checked={true} disabled />
                        <span className="text-xs text-muted-foreground">
                          Operational signal — always sent
                        </span>
                      </div>
                    ) : (
                      <Switch
                        checked={state[type].in_app}
                        onCheckedChange={(v) => setChannel(type, "in_app", v)}
                        disabled={pending}
                      />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end">
        <Button onClick={onSubmit} disabled={pending} className="cursor-pointer">
          {pending ? "Saving..." : "Save preferences"}
        </Button>
      </div>
    </div>
  );
}
