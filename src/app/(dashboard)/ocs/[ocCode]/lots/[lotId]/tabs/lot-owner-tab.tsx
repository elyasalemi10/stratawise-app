"use client";

import * as React from "react";
import { toast } from "sonner";
import { refetchCached } from "@/lib/use-cached-data";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useFieldSave } from "@/lib/use-field-save";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PhoneInput } from "@/components/shared/phone-input";
import { EmptyState } from "@/components/shared/empty-state";
import { EditSheet } from "@/components/shared/edit-sheet";
import { AddressField } from "@/components/shared/address-field";
import {
} from "@/components/ui/select";
import {
  Hash,
  Repeat,
  ExternalLink,
  Mail,
  FileSignature,
  Vote,
  CalendarDays,
} from "lucide-react";
import type { LotOwnerInfo } from "@/lib/actions/lot-ownership";
import type { OwnershipHistoryEntry } from "@/lib/validations/settlement";
import type { LotEngagement } from "@/lib/actions/lot-engagement";
import { formatDateLong, formatMonthYearShort } from "@/lib/format-date";
import {
  updateLotOwnerContact,
} from "@/lib/actions/lot-edit";

// Owner tab (Items 9 + 13). Per the design rule, each card has a SINGLE Edit
// button that opens a right-side drawer containing
// every field of that card , no per-row pencil popovers.

function initials(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? "?";
  return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
}

function formatLongDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  return formatDateLong(new Date(iso));
}

function formatMonthYear(iso: string | null | undefined): string | null {
  if (!iso) return null;
  return formatMonthYearShort(new Date(iso));
}

function formatRelativeDay(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const days = Math.floor((Date.now() - then) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  return `${Math.floor(days / 365)} years ago`;
}

function durationLabel(from: string | null, to: string | null): string {
  if (!from) return "";
  const start = new Date(from);
  const end = to ? new Date(to) : new Date();
  let months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
  if (end.getDate() < start.getDate()) months -= 1;
  if (months < 0) months = 0;
  const years = Math.floor(months / 12);
  const rem = months % 12;
  if (years === 0) return `${rem} mo`;
  if (rem === 0) return `${years} yr`;
  return `${years} yr ${rem} mo`;
}

interface Props {
  lotOwnerId: string | null;
  activeOwner: LotOwnerInfo;
  activeHistoryEntry: OwnershipHistoryEntry | null;
  pastHistoryEntries: OwnershipHistoryEntry[];
  paymentReference: string | null;
  postalAddress: string | null;
  portalActive: boolean;
  /** Last time they opened the portal, or null if they never have. */
  portalLastActiveAt: string | null;
  /** Their real profile picture once they are on the portal. */
  ownerAvatarUrl?: string | null;
  portalInviteAccepted: boolean;
  engagement: LotEngagement;
  onTransfer: () => void;
  /** The lot's own fields. They had a tab to themselves and nothing else on
   *  it, which made Overview a page you passed through. */
  lotDetails: LotDetailsInput;
  onLotDetailsSaved: () => void;
}

export function LotOwnerTab(props: Props) {
  const {
    lotOwnerId,
    activeOwner,
    activeHistoryEntry,
    pastHistoryEntries,
    paymentReference,
    postalAddress,
    portalLastActiveAt,
    ownerAvatarUrl,
    portalInviteAccepted,
    engagement,
    onTransfer,
    lotDetails,
    onLotDetailsSaved,
  } = props;

  async function saveField(patch: {
    name?: string;
    email?: string | null;
    phone?: string | null;
    postal_address?: string | null;
  }): Promise<{ error?: string }> {
    if (!lotOwnerId) return { error: "No owner on this lot yet." };
    const res = await updateLotOwnerContact({ lot_owner_id: lotOwnerId, ...patch });
    if (res.ok) {
      refetchCached("lot:");
      return {};
    }
    return { error: res.error };
  }

  // Canonical view of the owner card. Patched optimistically when the sheet
  // saves; rolled back on failure so the field-level edit feels instant.
  const [view, setView] = React.useState({
    name: activeOwner.owner_display_name ?? "",
    email: activeOwner.owner_contact_email ?? "",
    phone: activeOwner.owner_contact_phone ?? "",
    postal: postalAddress ?? "",
  });

  React.useEffect(() => {
    setView({
      name: activeOwner.owner_display_name ?? "",
      email: activeOwner.owner_contact_email ?? "",
      phone: activeOwner.owner_contact_phone ?? "",
      postal: postalAddress ?? "",
    });
  }, [
    activeOwner.owner_display_name,
    activeOwner.owner_contact_email,
    activeOwner.owner_contact_phone,
    postalAddress,
  ]);

  if (!activeOwner.owner_display_name) {
    return (
      <EmptyState
        illustration="people"
        title="No owner on file yet"
        description="Record the settlement to assign the new owner to this lot."
        action={
          <Button onClick={onTransfer}>
            <FileSignature className="h-4 w-4" />
            Record settlement
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-5 space-y-4">
          <div className="flex items-start gap-3 min-w-0">
            {/* Their real picture once they are on the portal , profiles
                carry an avatar_url from the moment they upload one, and
                an initial for everyone else. */}
            <UserAvatar
              src={ownerAvatarUrl ?? null}
              initials={initials(view.name)}
              className="size-11"
            />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-foreground truncate">{view.name}</p>
              {/* When they took the lot, and when they were last on the
                  portal. The second half was a row on the Overview tab's
                  Snapshot card, a tab away from the person it describes and
                  from the invite pill that now sits on the same line. */}
              {(activeHistoryEntry?.joinedAt || portalLastActiveAt) && (
                <p className="text-xs text-muted-foreground">
                  {activeHistoryEntry?.joinedAt &&
                    `Since ${formatLongDate(activeHistoryEntry.joinedAt)}`}
                  {activeHistoryEntry?.joinedAt && portalLastActiveAt && (
                    <span className="mx-1.5">·</span>
                  )}
                  {portalLastActiveAt &&
                    `Last on the portal ${formatRelativeDay(portalLastActiveAt)}`}
                </p>
              )}
            </div>
          </div>

          {/* Every field edits in place and saves when you leave it , the
              same rule as settings. The Edit drawer hid the current values
              behind a click before you could change one. */}
          <div className="grid gap-4 sm:grid-cols-2">
            <OwnerField
              label="Full name"
              value={view.name}
              onSaved={(v) => setView((x) => ({ ...x, name: v }))}
              save={(v) => saveField({ name: v })}
            />
            <OwnerField
              label="Email"
              value={view.email}
              type="email"
              disabled={portalInviteAccepted}
              hint={portalInviteAccepted ? "They change this from the portal" : undefined}
              onSaved={(v) => setView((x) => ({ ...x, email: v }))}
              save={(v) => saveField({ email: v || null })}
            />
            <OwnerField
              label="Phone"
              value={view.phone}
              phone
              onSaved={(v) => setView((x) => ({ ...x, phone: v }))}
              save={(v) => saveField({ phone: v || null })}
            />
            <OwnerReadonly label="Payment reference" value={paymentReference ?? ""} mono />
            {/* The one field that is five fields. A single free-text box
                is impossible to check: a suburb typed into the street line
                still looks like an address and nothing downstream can tell.
                Touching it opens the parts, the same bargain the OC
                creation wizard makes on its owner table. */}
            <div className="sm:col-span-2">
              <AddressField
                label="Service address"
                value={view.postal}
                onChange={(v) => setView((x) => ({ ...x, postal: v }))}
                onCommit={async (v) => {
                  const res = await saveField({ postal_address: v || null });
                  if (res.error) toast.error(res.error);
                  else toast.success("Service address saved");
                }}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* The lot itself. Under the person, because the page is reached by
          clicking a lot and the first question is who holds it; the
          entitlement and liability are read when a levy or a vote is being
          worked out, which is rarely and deliberately. */}
      <Card>
        <CardContent className="pt-5">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <Hash className="h-4 w-4 text-[color:var(--brand-gold)]" />
              <h3 className="text-sm font-semibold text-foreground">Lot details</h3>
            </div>
            <LotDetailsEditSheet lot={lotDetails} onSaved={onLotDetailsSaved} />
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
            <DetailField label="Lot number" value={String(lotDetails.lot_number)} mono />
            <DetailField label="Unit number" value={lotDetails.unit_number || ""} mono />
            <DetailField
              label="Entitlement"
              value={
                lotDetails.lot_entitlement !== null ? String(lotDetails.lot_entitlement) : ""
              }
            />
            <DetailField
              label="Liability"
              value={
                lotDetails.lot_liability !== null ? String(lotDetails.lot_liability) : ""
              }
            />
          </dl>
        </CardContent>
      </Card>

      {/* Engagement (meeting attendance + voting history) ------------------- */}
      <EngagementCard engagement={engagement} />

      {/* Transfer ownership. Last on the page and destructive-coloured,
          because it ends this owner's tenure , everything above is about
          the person who holds the lot today. */}
      <div className="flex justify-center border-t border-border pt-6">
        <Button variant="destructive" onClick={onTransfer}>
          <Repeat className="mr-2 h-3.5 w-3.5" />
          Transfer ownership
        </Button>
      </div>

      {/* Previous owners ---------------------------------------------------- */}
      {pastHistoryEntries.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-3">Previous owners</h3>
          <Card>
        <CardContent className="pt-5 divide-y divide-border">
              {pastHistoryEntries.map((entry) => (
                <PastOwnerRow key={entry.id} entry={entry} />
              ))}
            </CardContent>
      </Card>
        </div>
      )}
    </div>
  );
}

function PastOwnerRow({ entry }: { entry: OwnershipHistoryEntry }) {
  const fromLabel = formatMonthYear(entry.joinedAt) ?? "";
  const toLabel = entry.leftAt ? formatMonthYear(entry.leftAt) : "Current";
  const duration = durationLabel(entry.joinedAt, entry.leftAt);
  return (
    <div className="py-3 first:pt-0 last:pb-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{entry.name ?? "Unknown owner"}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {fromLabel} – {toLabel}
            {duration && ` · ${duration}`}
          </p>
          {entry.email && (
            <p className="text-xs text-muted-foreground inline-flex items-center gap-1">
              <Mail className="h-3 w-3" />
              {entry.email}
            </p>
          )}
        </div>
        {entry.settlementDocument?.id && (
          <a
            href={`/api/documents/${entry.settlementDocument.id}?view=true`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline shrink-0"
          >
            <ExternalLink className="h-3 w-3" />
            Settlement
          </a>
        )}
      </div>
    </div>
  );
}


// ─── Engagement card ────────────────────────────────────────────────────────
// Surfaces this lot's meeting participation + voting history. Numbers come
// from the lot_engagement read model (votes.lot_id → meetings via
// agenda_items). Renders an EmptyState when the lot hasn't taken part in
// any meeting yet.

function formatChoice(choice: string): string {
  return choice
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatMeetingType(type: string | null): string {
  if (!type) return "Meeting";
  return type
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function EngagementCard({ engagement }: { engagement: LotEngagement }) {
  const lastMeetingLabel = engagement.lastMeetingAt
    ? formatLongDate(engagement.lastMeetingAt)
    : null;

  if (engagement.meetingsAttended === 0) {
    return (
      <Card>
        <CardContent className="pt-5">
          <div className="flex items-center gap-2 mb-3">
            <Vote className="h-4 w-4 text-[color:var(--brand-gold)]" />
            <h3 className="text-sm font-semibold text-foreground">Engagement</h3>
          </div>
          <EmptyState
            card={false}
            illustration="checklist"
            title="No meeting activity yet"
            description="Once this lot has voted in or attended a meeting, it'll show up here."
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
        <CardContent className="pt-5 space-y-4">
        <div className="flex items-center gap-2">
          <Vote className="h-4 w-4 text-[color:var(--brand-gold)]" />
          <h3 className="text-sm font-semibold text-foreground">Engagement</h3>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <EngagementStat
            label="Meetings"
            value={engagement.meetingsAttended}
            sub={lastMeetingLabel ? `Last: ${lastMeetingLabel}` : undefined}
          />
          <EngagementStat label="Votes cast" value={engagement.votesCast} />
          <EngagementStat label="By proxy" value={engagement.proxiesGiven} />
        </div>

        {engagement.choices.length > 0 && (
          <div>
            <p className="text-xs font-medium tracking-normal text-muted-foreground mb-2">
              Vote breakdown
            </p>
            <div className="flex flex-wrap gap-1.5">
              {engagement.choices.map((c) => (
                <span
                  key={c.choice}
                  className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs text-foreground"
                >
                  <span className="font-medium">{formatChoice(c.choice)}</span>
                  <span className="text-muted-foreground tabular-nums">
                    {c.count}
                  </span>
                </span>
              ))}
            </div>
          </div>
        )}

        {engagement.recentMeetings.length > 0 && (
          <div>
            <p className="text-xs font-medium tracking-normal text-muted-foreground mb-2">
              Recent meetings
            </p>
            <ul className="divide-y divide-border">
              {engagement.recentMeetings.map((m) => (
                <li
                  key={m.meeting_id}
                  className="flex items-center justify-between gap-3 py-2"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">
                        {m.title ||
                          m.reference_number ||
                          formatMeetingType(m.meeting_type)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatLongDate(m.date_time)} · {m.votes_cast}{" "}
                        {m.votes_cast === 1 ? "vote" : "votes"}
                        {m.proxies_given > 0 && (
                          <> · {m.proxies_given} by proxy</>
                        )}
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
      </Card>
  );
}

function EngagementStat({
  label,
  value,
  sub,
}: {
  label: string;
  value: number;
  sub?: string;
}) {
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2">
      <p className="text-xs tracking-normal text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 text-xl font-bold text-foreground tabular-nums">
        {value}
      </p>
      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

// One owner field: edits in place, saves when you leave it, and only if it
// changed. Same hook the settings pages use, so the behaviour , the toast,
// the revert on refusal , is the same wherever a field saves itself.
function OwnerField({
  label,
  value,
  onSaved,
  save,
  type,
  phone,
  disabled,
  hint,
}: {
  label: string;
  value: string;
  onSaved: (next: string) => void;
  save: (next: string) => Promise<{ error?: string }>;
  type?: string;
  phone?: boolean;
  disabled?: boolean;
  hint?: string;
}) {
  const id = `owner-${label.toLowerCase().replace(/\s+/g, "-")}`;
  const f = useFieldSave(
    value,
    async (next) => {
      const res = await save(next);
      if (!res.error) onSaved(next);
      return res;
    },
    { successMessage: `${label} saved` },
  );

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {phone ? (
        <PhoneInput
          id={id}
          value={f.value}
          onChange={f.onChange}
          onBlur={f.onBlur}
          error={f.invalid}
        />
      ) : (
        <Input
          id={id}
          type={type}
          value={f.value}
          onChange={(e) => f.onChange(e.target.value)}
          onBlur={f.onBlur}
          aria-invalid={f.invalid || undefined}
          disabled={disabled}
          placeholder={label}
        />
      )}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** A value set elsewhere , shown, not edited. */
function OwnerReadonly({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div
        className={cn(
          "flex h-9 items-center rounded-md border border-border bg-cool-muted px-3 text-sm text-cool-muted-foreground",
          mono && "font-mono",
        )}
      >
        {value}
      </div>
    </div>
  );
}

interface LotDetailsInput {
  id: string;
  lot_number: number;
  unit_number: string | null;
  lot_entitlement: number | null;
  lot_liability: number | null;
}

function DetailField({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs tracking-normal text-muted-foreground">
        {label}
      </dt>
      <dd
        className={`mt-0.5 text-sm font-semibold text-foreground tabular-nums ${
          mono ? "font-mono" : ""
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

// Single edit drawer for unit number / entitlement / liability. Lot number
// itself stays locked because it's referenced by every levy notice issued
// for the lot.
function LotDetailsEditSheet({
  lot,
  onSaved,
}: {
  lot: LotDetailsInput;
  onSaved: () => void;
}) {
  const [unit, setUnit] = React.useState(lot.unit_number ?? "");
  const [entitlement, setEntitlement] = React.useState(
    lot.lot_entitlement !== null ? String(lot.lot_entitlement) : "",
  );
  const [liability, setLiability] = React.useState(
    lot.lot_liability !== null ? String(lot.lot_liability) : "",
  );

  return (
    <EditSheet
      label="Lot details"
      description="Unit number, entitlement, and liability. Lot number itself stays locked."
      triggerLabel="Edit"
      triggerVariant="secondary"
      requireConfirmation
      confirmationMessage="These values drive levy calculations and voting rights. Save anyway?"
      onOpenChange={(open) => {
        if (open) {
          setUnit(lot.unit_number ?? "");
          setEntitlement(lot.lot_entitlement !== null ? String(lot.lot_entitlement) : "");
          setLiability(lot.lot_liability !== null ? String(lot.lot_liability) : "");
        }
      }}
      onSave={async () => {
        const entitlementNum = entitlement.trim() ? parseFloat(entitlement) : null;
        const liabilityNum = liability.trim() ? parseFloat(liability) : null;
        if (entitlementNum !== null && !Number.isFinite(entitlementNum)) {
          return { ok: false as const, error: "Entitlement must be a number." };
        }
        if (liabilityNum !== null && !Number.isFinite(liabilityNum)) {
          return { ok: false as const, error: "Liability must be a number." };
        }
        const { updateLotDetails } = await import("@/lib/actions/lot-edit");
        const res = await updateLotDetails({
          lot_id: lot.id,
          unit_number: unit.trim() || null,
          lot_entitlement: entitlementNum,
          lot_liability: liabilityNum,
        });
        if (res.ok) onSaved();
        return res.ok ? { ok: true as const } : { ok: false as const, error: res.error };
      }}
    >
      <div className="space-y-1.5">
        <Label>Unit number</Label>
        <Input
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
          placeholder="Unit number"
        />
      </div>
      <div className="space-y-1.5">
        <Label>Lot entitlement</Label>
        <Input
          value={entitlement}
          onChange={(e) => setEntitlement(e.target.value)}
          placeholder="Lot entitlement"
          inputMode="decimal"
        />
      </div>
      <div className="space-y-1.5">
        <Label>Lot liability</Label>
        <Input
          value={liability}
          onChange={(e) => setLiability(e.target.value)}
          placeholder="Lot liability"
          inputMode="decimal"
        />
      </div>
    </EditSheet>
  );
}
