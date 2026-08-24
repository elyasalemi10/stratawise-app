import { Archive, CheckCircle2, PauseCircle } from "lucide-react";

// Owners Corporation status, as an icon rather than a pill.
//
// The pill previously rendered the raw enum ("active"), which CLAUDE.md
// forbids: a user must never see a database value. It also spent a whole
// badge on a field that is "active" for essentially every OC, which made
// the cards noisier than they were informative.
//
// The icon carries the meaning by colour and shape, and the label lives on
// the tooltip and in screen-reader text, so nothing is lost.

export type SubdivisionStatus = "active" | "archived" | "suspended";

/** Every enum gets a _LABEL lookup. Components import the labels, never the
 *  raw values. */
export const SUBDIVISION_STATUS_LABEL: Record<SubdivisionStatus, string> = {
  active: "Active",
  archived: "Archived",
  suspended: "Suspended",
};

const ICONS: Record<SubdivisionStatus, { Icon: typeof CheckCircle2; className: string }> = {
  active: { Icon: CheckCircle2, className: "text-green-600" },
  suspended: { Icon: PauseCircle, className: "text-[color:var(--warning)]" },
  archived: { Icon: Archive, className: "text-muted-foreground" },
};

export function OCStatusIcon({ status }: { status: string | null | undefined }) {
  const key = (status ?? "active") as SubdivisionStatus;
  const entry = ICONS[key] ?? ICONS.active;
  const label = SUBDIVISION_STATUS_LABEL[key] ?? SUBDIVISION_STATUS_LABEL.active;
  const { Icon, className } = entry;

  return (
    <span className="shrink-0" title={label}>
      <Icon className={`size-4 ${className}`} aria-hidden />
      <span className="sr-only">{label}</span>
    </span>
  );
}
