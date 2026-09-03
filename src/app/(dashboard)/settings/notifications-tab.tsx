"use client";

import * as React from "react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Mail, Monitor } from "lucide-react";
import {
  NOTIFICATION_TYPES,
  NOTIFICATION_GROUPS,
  MANDATORY_NOTIFICATION_TYPES,
  MANAGERIAL_NOTIFICATION_TYPES,
  type NotificationType,
} from "@/lib/notification-types";
import { updateNotificationPreferences } from "@/lib/actions/notification-preferences";
import { Switch } from "@/components/ui/switch";
import type { NotificationPrefRow, AutoOptOutEntry } from "./data";

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

  // Persist immediately, and put the switch back if the server refuses.
  //
  // There is no Save button. A page of toggles with a Save button asks you to
  // remember a second step for a change you already expressed, and gives no
  // hint which of eighteen rows is unsaved if you forget. Each switch is an
  // independent preference; there is nothing to batch.
  function persist(
    updates: Array<{ type: NotificationType; channel: Channel; enabled: boolean }>,
    revert: () => void,
  ) {
    startTransition(async () => {
      const result = await updateNotificationPreferences({ updates });
      if ("error" in result) {
        revert();
        toast.error(result.error);
      }
    });
  }

  function setChannel(type: NotificationType, channel: Channel, enabled: boolean) {
    setState((prev) => ({
      ...prev,
      [type]: { ...prev[type], [channel]: enabled },
    }));
    persist([{ type, channel, enabled }], () =>
      setState((prev) => ({
        ...prev,
        [type]: { ...prev[type], [channel]: !enabled },
      })),
    );
  }

  // Toggle a whole column at once. A manager who wants "email me nothing"
  // should not click eighteen times to say it. Rows the server will refuse
  // (statutory email, managerial in-app) are skipped rather than shown
  // changing and then snapping back.
  function toggleColumn(channel: Channel, enabled: boolean) {
    const changed: NotificationType[] = [];
    setState((prev) => {
      const next = { ...prev };
      for (const group of NOTIFICATION_GROUPS) {
        for (const item of group.items) {
          if (channel === "email" && MANDATORY_NOTIFICATION_TYPES.has(item.type)) continue;
          if (channel === "in_app" && MANAGERIAL_NOTIFICATION_TYPES.has(item.type)) continue;
          if (prev[item.type]?.[channel] === enabled) continue;
          changed.push(item.type);
          next[item.type] = { ...next[item.type], [channel]: enabled };
        }
      }
      return next;
    });
    if (changed.length === 0) return;
    persist(
      changed.map((type) => ({ type, channel, enabled })),
      () =>
        setState((prev) => {
          const back = { ...prev };
          for (const type of changed) {
            back[type] = { ...back[type], [channel]: !enabled };
          }
          return back;
        }),
    );
  }

  /** True when every togglable row in the column is on. */
  function columnAllOn(channel: Channel): boolean {
    return NOTIFICATION_GROUPS.every((g) =>
      g.items.every((i) => {
        if (channel === "email" && MANDATORY_NOTIFICATION_TYPES.has(i.type)) return true;
        if (channel === "in_app" && MANAGERIAL_NOTIFICATION_TYPES.has(i.type)) return true;
        return state[i.type]?.[channel];
      }),
    );
  }

  const CHANNELS: Array<{ key: Channel; label: string; Icon: typeof Mail }> = [
    { key: "email", label: "Email", Icon: Mail },
    { key: "in_app", label: "In app", Icon: Monitor },
  ];

  return (
    <div className="max-w-3xl space-y-6">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[34rem] border-collapse text-sm">
          <thead>
            <tr>
              <th className="pb-3 text-left align-bottom text-sm font-semibold text-foreground">
                Notify me about
              </th>
              {CHANNELS.map(({ key, label, Icon }) => {
                const allOn = columnAllOn(key);
                return (
                  <th key={key} className="w-28 pb-3 align-bottom">
                    <div className="flex flex-col items-center gap-1">
                      <Icon className="size-4 text-muted-foreground" aria-hidden />
                      <span className="text-sm font-medium text-foreground">{label}</span>
                      <button
                        type="button"
                        onClick={() => toggleColumn(key, !allOn)}
                        className="cursor-pointer text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                      >
                        {allOn ? "Turn all off" : "Turn all on"}
                      </button>
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody>
            {NOTIFICATION_GROUPS.map((group) => (
              <React.Fragment key={group.label}>
                <tr>
                  <th
                    colSpan={3}
                    className="bg-muted px-3 py-2 text-left text-sm font-medium text-foreground"
                  >
                    {group.label}
                  </th>
                </tr>
                {group.items.map((item) => {
                  const isMandatory = MANDATORY_NOTIFICATION_TYPES.has(item.type);
                  const isManagerial = MANAGERIAL_NOTIFICATION_TYPES.has(item.type);
                  return (
                    <tr key={item.type} className="border-b border-border/60 last:border-b-0">
                      <td className="py-3 pr-6">
                        <div className="text-sm font-medium text-foreground">{item.label}</div>
                        <div className="text-xs text-muted-foreground">{item.description}</div>
                      </td>
                      {CHANNELS.map(({ key }) => {
                        // Locked rows render a checked, disabled box rather
                        // than being hidden: "you cannot turn this off" is
                        // information, an empty cell is a mystery.
                        const locked =
                          (key === "email" && isMandatory) ||
                          (key === "in_app" && isManagerial);
                        const auto = autoOptOutMap.get(`${item.type}:${key}`);
                        return (
                          <td key={key} className="py-3 text-center align-middle">
                            <div className="flex flex-col items-center gap-1">
                              <Switch
                                checked={locked ? true : !!state[item.type]?.[key]}
                                disabled={locked || pending}
                                onCheckedChange={(v) => setChannel(item.type, key, v === true)}
                                aria-label={`${item.label} by ${key === "email" ? "email" : "in app"}`}
                              />
                              {auto ? (
                                <span className="text-[10px] text-warning">
                                  auto-off {formatAutoOptOutDate(auto.occurredAt)}
                                </span>
                              ) : null}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
