"use client";

import { Card, CardContent } from "@/components/ui/card";
import { History as HistoryIcon } from "lucide-react";
import type { LotActivityEntry } from "@/lib/actions/lot-overview";

// History tab (Item 17). Read-only audit trail for this lot. The Owner tab
// already shows ownership history; this view is the universal change log —
// every mutation against the lot, its owner contact, tenants, consent, levies,
// payments, communications, etc.

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function humanise(s: string): string {
  return s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

function formatPayload(payload: Record<string, unknown> | null): string | null {
  if (!payload) return null;
  const entries = Object.entries(payload).filter(([, v]) => v !== null && v !== "");
  if (entries.length === 0) return null;
  return entries
    .map(([k, v]) => `${humanise(k)}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
    .join(" · ");
}

export function LotHistoryTab({ activity }: { activity: LotActivityEntry[] }) {
  if (activity.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          <HistoryIcon className="mx-auto mb-2 h-6 w-6 opacity-40" />
          No activity recorded yet for this lot.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="pt-5">
        <div className="flex items-center gap-2 mb-3">
          <HistoryIcon className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">Activity log</h3>
          <span className="ml-1 text-xs text-muted-foreground">
            ({activity.length} {activity.length === 1 ? "entry" : "entries"})
          </span>
        </div>
        <ol className="divide-y divide-border">
          {activity.map((row) => {
            const reason =
              (row.metadata?.reason as string | undefined) ?? null;
            const before = formatPayload(row.before_state);
            const after = formatPayload(row.after_state);
            return (
              <li key={row.id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex items-baseline justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">
                      {humanise(`${row.entity_type} ${row.action}`)}
                    </p>
                    {after && (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        <span className="text-foreground/80">After:</span> {after}
                      </p>
                    )}
                    {before && (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        <span className="text-foreground/80">Before:</span> {before}
                      </p>
                    )}
                    {reason && (
                      <p className="mt-0.5 text-xs text-muted-foreground italic">
                        Reason: {reason}
                      </p>
                    )}
                    {row.actor_name && (
                      <p className="mt-0.5 text-xs text-muted-foreground">by {row.actor_name}</p>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0 tabular-nums">
                    {formatTime(row.created_at)}
                  </span>
                </div>
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}
