"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PhoneInput } from "@/components/shared/phone-input";
import { EditSheet } from "@/components/shared/edit-sheet";
import { EmptyState } from "@/components/shared/empty-state";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Repeat,
  ShieldCheck,
  ShieldOff,
  ExternalLink,
  Mail,
  FileSignature,
  Vote,
  CalendarDays,
} from "lucide-react";
import type { LotOwnerInfo } from "@/lib/actions/lot-ownership";
import type { OwnershipHistoryEntry } from "@/lib/validations/settlement";
import type { LotEngagement } from "@/lib/actions/lot-engagement";
import {
  updateLotOwnerContact,
} from "@/lib/actions/lot-edit";
import { useRouter } from "next/navigation";

// Owner tab (Items 9 + 13). Per the design rule, each card has a SINGLE Edit
// button that opens a right-side EditSheet (navbar-width drawer) containing
// every field of that card , no per-row pencil popovers.

function initials(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? "?";
  return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
}

function formatLongDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatMonthYear(iso: string | null | undefined): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("en-AU", { month: "short", year: "numeric" });
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
  portalInviteAccepted: boolean;
  engagement: LotEngagement;
  onTransfer: () => void;
}

export function LotOwnerTab(props: Props) {
  const {
    lotOwnerId,
    activeOwner,
    activeHistoryEntry,
    pastHistoryEntries,
    paymentReference,
    postalAddress,
    portalActive,
    portalInviteAccepted,
    engagement,
    onTransfer,
  } = props;

  const router = useRouter();

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
      <section className="border-b border-border pb-6 last:border-b-0 last:pb-0  space-y-4">
          {/* Header , avatar + name + single Edit button. */}
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-semibold">
                {initials(view.name)}
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-foreground truncate">{view.name}</p>
                {activeHistoryEntry?.joinedAt && (
                  <p className="text-xs text-muted-foreground">
                    Since {formatLongDate(activeHistoryEntry.joinedAt)}
                  </p>
                )}
              </div>
            </div>
            <OwnerContactEditSheet
              lotOwnerId={lotOwnerId}
              initial={view}
              portalInviteAccepted={portalInviteAccepted}
              onPatch={(p) => setView((v) => ({ ...v, ...p }))}
              onRollback={() =>
                setView({
                  name: activeOwner.owner_display_name ?? "",
                  email: activeOwner.owner_contact_email ?? "",
                  phone: activeOwner.owner_contact_phone ?? "",
                  postal: postalAddress ?? "",
                })
              }
              onSaved={() => router.refresh()}
            />
          </div>

          {/* Read-only field list , no inline edit triggers. */}
          <dl className="divide-y divide-border">
            <KvRow label="Email" value={view.email} />
            <KvRow label="Phone" value={view.phone} />
            <KvRow label="Service address" value={view.postal} multiline />
            <KvRow
              label="Portal access"
              renderValue={
                <span className="inline-flex items-center gap-1.5">
                  {portalActive ? (
                    <>
                      <ShieldCheck className="h-3.5 w-3.5 text-[hsl(160,100%,37%)]" />
                      Active
                    </>
                  ) : (
                    <>
                      <ShieldOff className="h-3.5 w-3.5 text-muted-foreground" />
                      Not on the portal yet
                    </>
                  )}
                </span>
              }
            />
          </dl>
        </section>

      {/* Identifier / payments info ---------------------------------------- */}
      <section className="border-b border-border pb-6 last:border-b-0 last:pb-0">
          <h3 className="text-sm font-semibold text-foreground mb-3">Identifier &amp; payment details</h3>
          <dl className="divide-y divide-border">
            <KvRow label="Payment reference" value={paymentReference ?? ""} mono />
          </dl>
        </section>

      {/* Transfer ownership ------------------------------------------------- */}
      <div className="flex justify-center">
        <Button variant="secondary" onClick={onTransfer}>
          <Repeat className="mr-2 h-3.5 w-3.5" />
          Transfer ownership
        </Button>
      </div>

      {/* Engagement (meeting attendance + voting history) ------------------- */}
      <EngagementCard engagement={engagement} />

      {/* Previous owners ---------------------------------------------------- */}
      {pastHistoryEntries.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-3">Previous owners</h3>
          <section className="border-b border-border pb-6 last:border-b-0 last:pb-0  divide-y divide-border">
              {pastHistoryEntries.map((entry) => (
                <PastOwnerRow key={entry.id} entry={entry} />
              ))}
            </section>
        </div>
      )}
    </div>
  );
}

// ─── Edit sheets ────────────────────────────────────────────────────────────

interface OwnerView {
  name: string;
  email: string;
  phone: string;
  postal: string;
}

function OwnerContactEditSheet({
  lotOwnerId,
  initial,
  portalInviteAccepted,
  onPatch,
  onRollback,
  onSaved,
}: {
  lotOwnerId: string | null;
  initial: OwnerView;
  portalInviteAccepted: boolean;
  onPatch: (next: Partial<OwnerView>) => void;
  onRollback: () => void;
  onSaved: () => void;
}) {
  // Local form state , initialised from view each time the sheet opens.
  const [name, setName] = React.useState(initial.name);
  const [email, setEmail] = React.useState(initial.email);
  const [phone, setPhone] = React.useState(initial.phone);
  const [postal, setPostal] = React.useState(initial.postal);

  function reset() {
    setName(initial.name);
    setEmail(initial.email);
    setPhone(initial.phone);
    setPostal(initial.postal);
  }

  return (
    <EditSheet
      label="Owner contact"
      description="Update the owner's contact details. Changes are logged to the activity history."
      onOpenChange={(open) => {
        if (open) reset();
      }}
      onSave={async () => {
        if (!lotOwnerId) return { ok: false as const, error: "Owner row missing" };
        if (!name.trim()) return { ok: false as const, error: "Name is required" };
        const payload = {
          lot_owner_id: lotOwnerId,
          name: name.trim(),
          phone: phone.trim() || null,
          postal_address: postal.trim() || null,
          ...(portalInviteAccepted ? {} : { email: email.trim() || null }),
        };
        const res = await updateLotOwnerContact(payload);
        if (res.ok) {
          onPatch({
            name: name.trim(),
            phone,
            postal,
            ...(portalInviteAccepted ? {} : { email }),
          });
          onSaved();
        } else {
          onRollback();
        }
        return res.ok ? { ok: true as const } : { ok: false as const, error: res.error };
      }}
    >
      <div className="space-y-1.5">
        <Label>
          Full name <span className="text-destructive">*</span>
        </Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Owner name" />
      </div>
      <div className="space-y-1.5">
        <Label>Phone</Label>
        <PhoneInput value={phone} onChange={setPhone} />
      </div>
      <div className="space-y-1.5">
        <Label>Service address</Label>
        <Textarea
          value={postal}
          onChange={(e) => setPostal(e.target.value)}
          placeholder="Service address"
          rows={3}
        />
        <p className="text-xs text-muted-foreground">
          We verify the address with our delivery provider when you save.
        </p>
      </div>
      <div className="space-y-1.5">
        <Label>Email</Label>
        {portalInviteAccepted ? (
          <>
            <Input value={email} disabled />
            <p className="text-xs text-muted-foreground">
              Owner has joined the portal , they can change their email themselves.
            </p>
          </>
        ) : (
          <>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Owner email"
            />
            <p className="text-xs text-muted-foreground">
              Used for invoices and notices. Separate from the owner&apos;s portal login email.
            </p>
          </>
        )}
      </div>
    </EditSheet>
  );
}

// ─── Read-only row primitives ───────────────────────────────────────────────

function KvRow({
  label,
  value,
  renderValue,
  mono,
  hint,
  multiline,
}: {
  label: string;
  value?: string;
  renderValue?: React.ReactNode;
  mono?: boolean;
  hint?: string;
  multiline?: boolean;
}) {
  const display = renderValue ?? (value && value.length > 0 ? value : null);
  return (
    <div className={`flex ${multiline ? "items-start" : "items-baseline"} justify-between gap-2 py-2.5`}>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd
        className={`text-sm font-medium text-foreground text-right max-w-[60%] ${
          mono ? "font-mono text-xs" : ""
        } ${multiline ? "whitespace-pre-line" : "truncate"}`}
      >
        {display ?? <span className="text-muted-foreground italic">{hint ?? ","}</span>}
      </dd>
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
      <section className="border-b border-border pb-6 last:border-b-0 last:pb-0">
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
        </section>
    );
  }

  return (
    <section className="border-b border-border pb-6 last:border-b-0 last:pb-0  space-y-4">
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
      </section>
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
