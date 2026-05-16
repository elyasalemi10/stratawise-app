"use client";

import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PhoneInput } from "@/components/shared/phone-input";
import { EditPopover } from "@/components/shared/edit-popover";
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
} from "lucide-react";
import type { LotOwnerInfo } from "@/lib/actions/lot-ownership";
import type { OwnershipHistoryEntry } from "@/lib/validations/settlement";
import type { LotDrn } from "@/lib/actions/lot-overview";
import {
  updateLotOwnerContact,
  updateConsentCategories,
} from "@/lib/actions/lot-edit";
import { useRouter } from "next/navigation";

// Owner tab (Items 9 + 13). Replaces the inline OwnerTab function. Renders:
//   - Current owner card with EditPopovers on every editable field
//   - Identifier panel (payment_reference + active DRNs)
//   - Consent block — manager can toggle categories, reason required
//   - Transfer ownership button
//   - Previous owners list (ownership-history kept here per Item 17)

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

  // Optimistic local view of the owner — patched in EditPopover.optimistic.apply
  // and rolled back on save failure so the field-level edit feels instant.
  const [view, setView] = React.useState({
    name: activeOwner.owner_display_name ?? "",
    email: activeOwner.owner_contact_email ?? "",
    phone: activeOwner.owner_contact_phone ?? "",
    postal: postalAddress ?? "",
    owner_type: ownerType,
    consent: consentCategories,
  });

  // Keep the optimistic view in sync if the server data refreshes (router.refresh).
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
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          No active owner on this lot. Record a settlement to assign one.
        </CardContent>
      </Card>
    );
  }

  // Local form-state holders for each EditPopover. We use refs so the popover
  // body can stay uncontrolled (cheaper) and only the Save handler reads the
  // current value at submit time.
  const nameRef = React.useRef<HTMLInputElement>(null);
  const emailRef = React.useRef<HTMLInputElement>(null);
  const postalRef = React.useRef<HTMLTextAreaElement>(null);
  const [phoneDraft, setPhoneDraft] = React.useState(view.phone);
  const [typeDraft, setTypeDraft] = React.useState<"individual" | "company">(view.owner_type);

  // Consent draft (checkbox state + reason)
  const [consentDraft, setConsentDraft] = React.useState<string[]>(view.consent);
  const [consentReason, setConsentReason] = React.useState("");

  React.useEffect(() => {
    setPhoneDraft(view.phone);
    setTypeDraft(view.owner_type);
    setConsentDraft(view.consent);
  }, [view.phone, view.owner_type, view.consent]);

  const guardOwnerId = () =>
    lotOwnerId ? Promise.resolve({ ok: true as const, id: lotOwnerId }) : Promise.resolve({ ok: false as const });

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-5 space-y-4">
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
          </div>

          <dl className="divide-y divide-border">
            {/* Owner type ----------------------------------------------- */}
            <EditableRow
              label="Owner type"
              value={view.owner_type === "company" ? "Company" : "Individual"}
              editLabel="Edit owner type"
              onOpen={() => setTypeDraft(view.owner_type)}
              onSave={async () => {
                const guard = await guardOwnerId();
                if (!guard.ok) return { ok: false as const, error: "Owner row missing" };
                const res = await updateLotOwnerContact({
                  lot_owner_id: guard.id,
                  owner_type: typeDraft,
                });
                if (res.ok) router.refresh();
                return res.ok ? { ok: true as const } : { ok: false as const, error: res.error };
              }}
              optimistic={{
                apply: () => setView((v) => ({ ...v, owner_type: typeDraft })),
                rollback: () => setView((v) => ({ ...v, owner_type: ownerType })),
              }}
            >
              <Select
                value={typeDraft}
                onValueChange={(v) => setTypeDraft(v as "individual" | "company")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="individual">Individual</SelectItem>
                  <SelectItem value="company">Company</SelectItem>
                </SelectContent>
              </Select>
            </EditableRow>

            {/* Name ----------------------------------------------------- */}
            <EditableRow
              label="Name"
              value={view.name}
              editLabel="Edit owner name"
              onSave={async () => {
                const newValue = nameRef.current?.value?.trim() ?? "";
                if (!newValue) return { ok: false as const, error: "Name is required" };
                const guard = await guardOwnerId();
                if (!guard.ok) return { ok: false as const, error: "Owner row missing" };
                const previous = view.name;
                setView((v) => ({ ...v, name: newValue }));
                const res = await updateLotOwnerContact({
                  lot_owner_id: guard.id,
                  name: newValue,
                });
                if (!res.ok) setView((v) => ({ ...v, name: previous }));
                if (res.ok) router.refresh();
                return res.ok ? { ok: true as const } : { ok: false as const, error: res.error };
              }}
            >
              <Label htmlFor="">Owner name</Label>
              <Input ref={nameRef} defaultValue={view.name} placeholder="Owner name" />
            </EditableRow>

            {/* Phone ---------------------------------------------------- */}
            <EditableRow
              label="Phone"
              value={view.phone}
              editLabel="Edit phone"
              onOpen={() => setPhoneDraft(view.phone)}
              onSave={async () => {
                const guard = await guardOwnerId();
                if (!guard.ok) return { ok: false as const, error: "Owner row missing" };
                const previous = view.phone;
                setView((v) => ({ ...v, phone: phoneDraft }));
                const res = await updateLotOwnerContact({
                  lot_owner_id: guard.id,
                  phone: phoneDraft || null,
                });
                if (!res.ok) setView((v) => ({ ...v, phone: previous }));
                if (res.ok) router.refresh();
                return res.ok ? { ok: true as const } : { ok: false as const, error: res.error };
              }}
            >
              <Label>Phone</Label>
              <PhoneInput
                value={phoneDraft}
                onChange={(v) => setPhoneDraft(v)}
              />
            </EditableRow>

            {/* Service address ---------------------------------------- */}
            <EditableRow
              label="Service address"
              value={view.postal}
              editLabel="Edit service address"
              onSave={async () => {
                const newValue = postalRef.current?.value?.trim() ?? "";
                const guard = await guardOwnerId();
                if (!guard.ok) return { ok: false as const, error: "Owner row missing" };
                const previous = view.postal;
                setView((v) => ({ ...v, postal: newValue }));
                const res = await updateLotOwnerContact({
                  lot_owner_id: guard.id,
                  postal_address: newValue || null,
                });
                if (!res.ok) setView((v) => ({ ...v, postal: previous }));
                if (res.ok) router.refresh();
                return res.ok ? { ok: true as const } : { ok: false as const, error: res.error };
              }}
            >
              <Label>Service address</Label>
              <Textarea
                ref={postalRef}
                defaultValue={view.postal}
                placeholder="Service address"
                rows={3}
              />
              <p className="text-xs text-muted-foreground">
                The address gets verified with our delivery provider when you save.
              </p>
            </EditableRow>

            {/* Email - only editable while invite is not yet accepted -- */}
            {portalInviteAccepted ? (
              <ReadOnlyRow
                label="Email"
                value={view.email}
                hint="Owner is on the portal — they can change their email themselves."
              />
            ) : (
              <EditableRow
                label="Email"
                value={view.email}
                editLabel="Edit owner email"
                onSave={async () => {
                  const newValue = emailRef.current?.value?.trim() ?? "";
                  if (!newValue) return { ok: false as const, error: "Email is required" };
                  const guard = await guardOwnerId();
                  if (!guard.ok) return { ok: false as const, error: "Owner row missing" };
                  const previous = view.email;
                  setView((v) => ({ ...v, email: newValue }));
                  const res = await updateLotOwnerContact({
                    lot_owner_id: guard.id,
                    email: newValue,
                  });
                  if (!res.ok) setView((v) => ({ ...v, email: previous }));
                  if (res.ok) router.refresh();
                  return res.ok ? { ok: true as const } : { ok: false as const, error: res.error };
                }}
              >
                <Label>Owner email</Label>
                <Input ref={emailRef} type="email" defaultValue={view.email} placeholder="Owner email" />
                <p className="text-xs text-muted-foreground">
                  Used for sending invoices and notices. Separate from the owner&apos;s portal login email.
                </p>
              </EditableRow>
            )}

            <ReadOnlyRow
              label="Portal access"
              value=""
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

      {/* Identifier / payments info ----------------------------------- */}
      <Card>
        <CardContent className="pt-5">
          <h3 className="text-sm font-semibold text-foreground mb-3">Identifier &amp; payment details</h3>
          <dl className="divide-y divide-border">
            <ReadOnlyRow
              label="Payment reference"
              value={paymentReference ?? ""}
              mono
            />
            {drns.length === 0 ? (
              <ReadOnlyRow
                label="Macquarie DRN"
                value=""
                hint="No DRN mapped to this lot yet."
              />
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

      {/* Consent ------------------------------------------------------ */}
      <Card>
        <CardContent className="pt-5 space-y-3">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Digital consent</h3>
              <p className="text-xs text-muted-foreground">
                Categories of communication the owner has agreed to receive digitally.
              </p>
            </div>
            <EditPopover
              label="Update consent on owner's behalf"
              renderTrigger={() => (
                <Button variant="secondary" size="sm">
                  Edit consent
                </Button>
              )}
              onSave={async () => {
                if (!consentReason.trim() || consentReason.trim().length < 3) {
                  return { ok: false as const, error: "Please add a short reason" };
                }
                const guard = await guardOwnerId();
                if (!guard.ok) return { ok: false as const, error: "Owner row missing" };
                const previous = view.consent;
                setView((v) => ({ ...v, consent: consentDraft }));
                const res = await updateConsentCategories({
                  lot_owner_id: guard.id,
                  categories: consentDraft,
                  reason: consentReason.trim(),
                });
                if (!res.ok) setView((v) => ({ ...v, consent: previous }));
                if (res.ok) {
                  setConsentReason("");
                  router.refresh();
                }
                return res.ok ? { ok: true as const } : { ok: false as const, error: res.error };
              }}
            >
              <p className="text-xs text-muted-foreground">
                Tick the categories the owner has consented to. Owners can update this themselves from
                the portal — only change it here if the owner has asked you to.
              </p>
              <div className="space-y-1.5">
                {CONSENT_CATEGORIES.map((c) => {
                  const checked = consentDraft.includes(c.key);
                  return (
                    <div key={c.key} className="flex items-center gap-2">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(next) => {
                          setConsentDraft((prev) =>
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
                <Label>Reason for change</Label>
                <Textarea
                  value={consentReason}
                  onChange={(e) => setConsentReason(e.target.value)}
                  placeholder="e.g. owner phoned to opt out of breach notices"
                  rows={2}
                />
              </div>
            </EditPopover>
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

      {/* Transfer ownership ------------------------------------------- */}
      <div className="flex justify-center">
        <Button variant="secondary" onClick={onTransfer}>
          <Repeat className="mr-2 h-3.5 w-3.5" />
          Transfer ownership
        </Button>
      </div>

      {/* Previous owners --------------------------------------------- */}
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

// ─── Row helpers ──────────────────────────────────────────────────────────

interface EditableRowProps {
  label: string;
  value: string;
  editLabel: string;
  onSave: () => Promise<{ ok: true } | { ok: false; error: string }>;
  onOpen?: () => void;
  optimistic?: { apply: () => void; rollback: () => void };
  children: React.ReactNode;
}

function EditableRow({ label, value, editLabel, onSave, optimistic, children }: EditableRowProps) {
  return (
    <div className="flex items-baseline justify-between gap-2 py-2.5">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="flex items-center gap-2 min-w-0">
        <span className="text-sm font-medium text-foreground truncate max-w-[280px]">
          {value || <span className="text-muted-foreground italic">—</span>}
        </span>
        <EditPopover label={editLabel} onSave={onSave} optimistic={optimistic ?? null}>
          {children}
        </EditPopover>
      </dd>
    </div>
  );
}

function ReadOnlyRow({
  label,
  value,
  hint,
  renderValue,
  mono,
}: {
  label: string;
  value: string;
  hint?: string;
  renderValue?: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2 py-2.5">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd
        className={`text-sm font-medium text-foreground text-right max-w-[60%] ${
          mono ? "font-mono text-xs" : ""
        }`}
      >
        {renderValue ?? value ?? ""}
        {!renderValue && !value && (
          <span className="text-muted-foreground italic">{hint ?? "—"}</span>
        )}
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
