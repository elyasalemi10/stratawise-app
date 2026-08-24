import Image from "next/image";
import { Archive, PauseCircle } from "lucide-react";

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

// Active uses the supplied /tick.svg so the tick matches the brand asset
// rather than lucide's outline check. The other two stay on lucide, which
// has no equivalent bespoke asset.
const FALLBACK = {
  suspended: { Icon: PauseCircle, className: "text-[color:var(--warning)]" },
  archived: { Icon: Archive, className: "text-muted-foreground" },
} as const;

export function OCStatusIcon({ status }: { status: string | null | undefined }) {
  const key = (status ?? "active") as SubdivisionStatus;
  const label = SUBDIVISION_STATUS_LABEL[key] ?? SUBDIVISION_STATUS_LABEL.active;

  if (key !== "suspended" && key !== "archived") {
    return (
      <span className="shrink-0" title={label}>
        <Image src="/tick.svg" alt="" width={28} height={28} className="size-7" aria-hidden />
        <span className="sr-only">{label}</span>
      </span>
    );
  }

  const { Icon, className } = FALLBACK[key];
  return (
    <span className="shrink-0" title={label}>
      <Icon className={`size-7 ${className}`} aria-hidden />
      <span className="sr-only">{label}</span>
    </span>
  );
}
