"use client";

import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
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
  Hash,
  FileSignature,
  UserRound,
} from "lucide-react";
import type { LotOwnerInfo } from "@/lib/actions/lot-ownership";
import type { OwnershipHistoryEntry } from "@/lib/validations/settlement";
import type { LotDrn } from "@/lib/actions/lot-overview";
import {
  updateLotOwnerContact,
  updateConsentCategories,
} from "@/lib/actions/lot-edit";
import { useRouter } from "next/navigation";

// Owner tab (Items 9 + 13). Per the design rule, each card has a SINGLE Edit
// button that opens a right-side EditSheet (navbar-width drawer) containing
// every field of that card — no per-row pencil popovers.

const CONSENT_CATEGORIES = [
  { key: "meetings", label: "Meetings" },
  { key: "levies", label: "Levies" },
  { key: "breach", label: "Breach" },
  { key: "financial_reports", label: "Financial reports" },
  { key: "general_correspondence", label: "General correspondence" },
] as const;

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
  ownerType: "individual" | "company";
  paymentReference: string | null;
  postalAddress: string | null;
  portalActive: boolean;
  portalInviteAccepted: boolean;
  consentCategories: string[];
  drns: LotDrn[];
  onTransfer: () => void;
}

export function LotOwnerTab(props: Props) {
  const {
    lotOwnerId,
    activeOwner,
    activeHistoryEntry,
    pastHistoryEntries,
    ownerType,
    paymentReference,
    postalAddress,
    portalActive,
    portalInviteAccepted,
    consentCategories,
    drns,
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
    owner_type: ownerType,
    consent: consentCategories,
  });

  React.useEffect(() => {
    setView({
      name: activeOwner.owner_display_name ?? "",
      email: activeOwner.owner_contact_email ?? "",
      phone: activeOwner.owner_contact_phone ?? "",
      postal: postalAddress ?? "",
      owner_type: ownerType,
      consent: consentCategories,
    });
  }, [
    activeOwner.owner_display_name,
    activeOwner.owner_contact_email,
    activeOwner.owner_contact_phone,
    postalAddress,
    ownerType,
    consentCategories,
  ]);

  if (!activeOwner.owner_display_name) {
    return (
      <EmptyState
        icon={UserRound}
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
          {/* Header — avatar + name + single Edit button. */}
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-semibold">
                {initials(view.name)}
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-foreground truncate">{view.name}</p>
                <p className="text-xs text-muted-foreground">
                  {view.owner_type === "company" ? "Company" : "Individual"}
                  {activeHistoryEntry?.joinedAt && <> · Since {formatLongDate(activeHistoryEntry.joinedAt)}</>}
                </p>
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
                  owner_type: ownerType,
                  consent: consentCategories,
                })
              }
              onSaved={() => router.refresh()}
            />
          </div>

          {/* Read-only field list — no inline edit triggers. */}
          <dl className="divide-y divide-border">
            <KvRow label="Owner type" value={view.owner_type === "company" ? "Company" : "Individual"} />
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
        </CardContent>
      </Card>

      {/* Identifier / payments info ---------------------------------------- */}
      <Card>
        <CardContent className="pt-5">
          <h3 className="text-sm font-semibold text-foreground mb-3">Identifier &amp; payment details</h3>
          <dl className="divide-y divide-border">
            <KvRow label="Payment reference" value={paymentReference ?? ""} mono />
            {drns.length === 0 ? (
              <KvRow label="Macquarie DRN" value="" hint="No DRN mapped to this lot yet." />
            ) : (
              drns.map((d, i) => (
                <div key={d.drn + i} className="flex items-baseline justify-between py-2.5">
                  <dt className="text-sm text-muted-foreground inline-flex items-center gap-1.5">
                    <Hash className="h-3 w-3" />
                    Macquarie DRN
                  </dt>
                  <dd className="text-right">
                    <span className="font-mono text-xs font-medium text-foreground">{d.drn}</span>
                    {d.secondary_id && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        {d.secondary_id}
                      </span>
                    )}
                  </dd>
                </div>
              ))
            )}
          </dl>
        </CardContent>
      </Card>

      {/* Consent ------------------------------------------------------------ */}
      <Card>
        <CardContent className="pt-5 space-y-3">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Digital consent</h3>
              <p className="text-xs text-muted-foreground">
                Categories of communication the owner has agreed to receive digitally.
              </p>
            </div>
            <ConsentEditSheet
              lotOwnerId={lotOwnerId}
              initialConsent={view.consent}
              onPatch={(next) => setView((v) => ({ ...v, consent: next }))}
              onRollback={() => setView((v) => ({ ...v, consent: consentCategories }))}
              onSaved={() => router.refresh()}
            />
          </div>
          <div className="flex flex-wrap gap-1.5 pt-1">
            {view.consent.length === 0 ? (
              <span className="text-xs text-muted-foreground">No digital consent on file.</span>
            ) : (
              CONSENT_CATEGORIES.map((c) =>
                view.consent.includes(c.key) ? (
                  <span
                    key={c.key}
                    className="inline-flex items-center rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-foreground"
                  >
                    {c.label}
                  </span>
                ) : null,
              )
            )}
          </div>
        </CardContent>
      </Card>

      {/* Transfer ownership ------------------------------------------------- */}
      <div className="flex justify-center">
        <Button variant="secondary" onClick={onTransfer}>
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

// ─── Edit sheets ────────────────────────────────────────────────────────────

interface OwnerView {
  name: string;
  email: string;
  phone: string;
  postal: string;
  owner_type: "individual" | "company";
  consent: string[];
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
  // Local form state — initialised from view each time the sheet opens.
  const [name, setName] = React.useState(initial.name);
  const [email, setEmail] = React.useState(initial.email);
  const [phone, setPhone] = React.useState(initial.phone);
  const [postal, setPostal] = React.useState(initial.postal);
  const [ownerType, setOwnerType] = React.useState<"individual" | "company">(initial.owner_type);

  function reset() {
    setName(initial.name);
    setEmail(initial.email);
    setPhone(initial.phone);
    setPostal(initial.postal);
    setOwnerType(initial.owner_type);
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
          owner_type: ownerType,
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
            owner_type: ownerType,
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
        <Label>Owner type</Label>
        <Select value={ownerType} onValueChange={(v) => setOwnerType(v as "individual" | "company")}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="individual">Individual</SelectItem>
            <SelectItem value="company">Company</SelectItem>
          </SelectContent>
        </Select>
      </div>
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
              Owner has joined the portal — they can change their email themselves.
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

function ConsentEditSheet({
  lotOwnerId,
  initialConsent,
  onPatch,
  onRollback,
  onSaved,
}: {
  lotOwnerId: string | null;
  initialConsent: string[];
  onPatch: (next: string[]) => void;
  onRollback: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = React.useState<string[]>(initialConsent);
  const [reason, setReason] = React.useState("");

  return (
    <EditSheet
      label="Digital consent"
      description="Update on the owner's behalf. A short reason is required for the audit log."
      onOpenChange={(open) => {
        if (open) {
          setDraft(initialConsent);
          setReason("");
        }
      }}
      onSave={async () => {
        if (!lotOwnerId) return { ok: false as const, error: "Owner row missing" };
        if (!reason.trim() || reason.trim().length < 3) {
          return { ok: false as const, error: "Please add a short reason" };
        }
        const res = await updateConsentCategories({
          lot_owner_id: lotOwnerId,
          categories: draft,
          reason: reason.trim(),
        });
        if (res.ok) {
          onPatch(draft);
          onSaved();
        } else {
          onRollback();
        }
        return res.ok ? { ok: true as const } : { ok: false as const, error: res.error };
      }}
    >
      <p className="text-xs text-muted-foreground">
        Tick the categories the owner has consented to. Owners can also update this themselves from
        the portal — only change it here if they&apos;ve asked you to.
      </p>
      <div className="space-y-1.5">
        {CONSENT_CATEGORIES.map((c) => {
          const checked = draft.includes(c.key);
          return (
            <div key={c.key} className="flex items-center gap-2">
              <Checkbox
                checked={checked}
                onCheckedChange={(next) => {
                  setDraft((prev) =>
                    next ? Array.from(new Set([...prev, c.key])) : prev.filter((k) => k !== c.key),
                  );
                }}
              />
              <span className="text-sm">{c.label}</span>
            </div>
          );
        })}
      </div>
      <div className="space-y-1.5 pt-1">
        <Label>
          Reason for change <span className="text-destructive">*</span>
        </Label>
        <Textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. owner phoned to opt out of breach notices"
          rows={3}
        />
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
        {display ?? <span className="text-muted-foreground italic">{hint ?? "—"}</span>}
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
        {entry.settlementDocument?.publicUrl && (
          <a
            href={entry.settlementDocument.publicUrl}
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
