"use client";

import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  History as HistoryIcon,
  Pencil,
  ShieldCheck,
  Wallet,
  Mail,
  MessageSquare,
  Phone as PhoneIcon,
  FileSignature,
  FileText,
  Activity as ActivityIcon,
} from "lucide-react";
import type { LotActivityEntry } from "@/lib/actions/lot-overview";

// History tab — read-only audit trail for this lot. Rendered like the
// Communications tab now: compact one-line rows that you click to open a
// detail Dialog. Paginated client-side. The dialog UI varies by entry type
// (settlement / payment / communication / contact edit / generic) so each
// shows the bits that actually matter for that kind of event.

const HISTORY_PAGE_SIZE = 20;

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

// Top-level category drives the icon + the dialog template.
type Category =
  | "settlement"
  | "payment"
  | "email"
  | "sms"
  | "call"
  | "contact"
  | "consent"
  | "document"
  | "levy"
  | "generic";

function classify(row: LotActivityEntry): Category {
  const key = `${row.action}:${row.entity_type}`;
  if (row.entity_type === "settlement") return "settlement";
  if (row.entity_type === "payment" || row.entity_type === "ledger_entry") return "payment";
  if (row.entity_type === "email" || key === "send:email") return "email";
  if (row.entity_type === "sms" || key === "send:sms") return "sms";
  if (row.entity_type === "phone_call") return "call";
  if (
    row.entity_type === "lot_owner" ||
    row.entity_type === "oc_member" ||
    row.entity_type === "owner"
  ) {
    return "contact";
  }
  if (row.entity_type === "consent") return "consent";
  if (row.entity_type === "document") return "document";
  if (row.entity_type === "levy_notice" || row.entity_type === "levy_batch") return "levy";
  return "generic";
}

function iconFor(category: Category): React.ElementType {
  switch (category) {
    case "settlement": return FileSignature;
    case "payment":    return Wallet;
    case "email":      return Mail;
    case "sms":        return MessageSquare;
    case "call":       return PhoneIcon;
    case "contact":    return Pencil;
    case "consent":    return ShieldCheck;
    case "document":   return FileText;
    case "levy":       return Wallet;
    case "generic":    return ActivityIcon;
  }
}

function titleFor(row: LotActivityEntry, category: Category): string {
  switch (category) {
    case "email":      return "Email sent";
    case "sms":        return "SMS sent";
    case "call":
      return row.action === "create" ? "Phone call logged" : humanise(`${row.entity_type} ${row.action}`);
    case "settlement": return "Settlement recorded";
    case "consent":    return "Consent updated";
    case "contact":    return "Owner contact updated";
    case "payment":    return "Payment recorded";
    case "document":   return "Document uploaded";
    case "levy":       return row.action === "create" ? "Levy issued" : humanise(`${row.entity_type} ${row.action}`);
    default:           return humanise(`${row.entity_type} ${row.action}`);
  }
}

export function LotHistoryTab({ activity }: { activity: LotActivityEntry[] }) {
  const [page, setPage] = React.useState(0);
  const [detail, setDetail] = React.useState<LotActivityEntry | null>(null);

  const totalPages = Math.max(1, Math.ceil(activity.length / HISTORY_PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const start = safePage * HISTORY_PAGE_SIZE;
  const visible = activity.slice(start, start + HISTORY_PAGE_SIZE);

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
    <>
      <Card>
        <CardContent className="pt-5 space-y-3">
          <div className="flex items-center gap-2">
            <HistoryIcon className="h-4 w-4 text-[color:var(--brand-gold)]" />
            <h3 className="text-sm font-semibold text-foreground">Activity log</h3>
            <span className="ml-1 text-xs text-muted-foreground">
              ({activity.length} {activity.length === 1 ? "entry" : "entries"})
            </span>
          </div>

          <ol className="divide-y divide-border">
            {visible.map((row) => {
              const category = classify(row);
              const Icon = iconFor(category);
              return (
                <li key={row.id}>
                  <button
                    type="button"
                    onClick={() => setDetail(row)}
                    className="flex w-full items-center justify-between gap-3 py-3 text-left transition-colors hover:bg-muted/50 cursor-pointer rounded-md px-2 -mx-2"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <Icon className="h-4 w-4 shrink-0 text-[color:var(--brand-gold)]" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">
                          {titleFor(row, category)}
                        </p>
                        {row.actor_name && (
                          <p className="text-xs text-muted-foreground">
                            by {row.actor_name}
                          </p>
                        )}
                      </div>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                      {formatTime(row.created_at)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>

          {totalPages > 1 && (
            <div className="flex items-center justify-between gap-3 pt-1 text-xs text-muted-foreground">
              <span>
                Showing {start + 1}–{Math.min(start + HISTORY_PAGE_SIZE, activity.length)} of{" "}
                {activity.length}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={safePage === 0}
                >
                  Previous
                </Button>
                <span className="px-2 tabular-nums">
                  Page {safePage + 1} of {totalPages}
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={safePage >= totalPages - 1}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {detail && (
        <ActivityDetailDialog row={detail} onClose={() => setDetail(null)} />
      )}
    </>
  );
}

function ActivityDetailDialog({
  row,
  onClose,
}: {
  row: LotActivityEntry;
  onClose: () => void;
}) {
  const category = classify(row);
  const Icon = iconFor(category);
  const title = titleFor(row, category);

  const metaEntries = Object.entries(row.metadata ?? {}).filter(
    ([, v]) => v !== null && v !== undefined && v !== "",
  );
  const beforeEntries = Object.entries(row.before_state ?? {}).filter(
    ([, v]) => v !== null && v !== undefined && v !== "",
  );
  const afterEntries = Object.entries(row.after_state ?? {}).filter(
    ([, v]) => v !== null && v !== undefined && v !== "",
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className="h-4 w-4 text-[color:var(--brand-gold)]" />
            {title}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <DetailRow label="When" value={formatTime(row.created_at)} />
          {row.actor_name && <DetailRow label="By" value={row.actor_name} />}
          <DetailRow label="Action" value={humanise(row.action)} />
          <DetailRow label="Entity" value={humanise(row.entity_type)} />
        </div>

        {(beforeEntries.length > 0 || afterEntries.length > 0) && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {beforeEntries.length > 0 && (
              <StatePanel title="Before" entries={beforeEntries} />
            )}
            {afterEntries.length > 0 && (
              <StatePanel title="After" entries={afterEntries} />
            )}
          </div>
        )}

        {metaEntries.length > 0 && (
          <StatePanel title="Details" entries={metaEntries} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="text-right text-sm font-medium text-foreground break-all">
        {value}
      </dd>
    </div>
  );
}

function StatePanel({
  title,
  entries,
}: {
  title: string;
  entries: Array<[string, unknown]>;
}) {
  return (
    <div className="rounded-md border border-border bg-cool-muted p-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1.5">
        {title}
      </p>
      <dl className="space-y-1 text-xs">
        {entries.map(([k, v]) => (
          <div key={k} className="grid grid-cols-2 gap-2">
            <dt className="text-muted-foreground">{humanise(k)}</dt>
            <dd className="text-right text-foreground break-words">
              {typeof v === "object" ? JSON.stringify(v) : String(v)}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
