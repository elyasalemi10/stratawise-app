"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EditSheet } from "@/components/shared/edit-sheet";
import {
  Calendar,
  Activity,
  ChevronRight,
  Hash,
  CalendarCheck,
  FileText,
} from "lucide-react";
import type {
  NextLevyDue,
  LotActivityEntry,
} from "@/lib/actions/lot-overview";

// Overview tab (Item 12). Replaces the old "General" tab. Renders three cards:
//   1. Next levy due — formatted "17th March 2026" with reference + amount
//   2. Recent activity — last 5 audit-log entries scoped to this lot, with a
//      "View all activity" link that switches to the History tab
//   3. Snapshot — owner type, ownership-since (or "Not set"), portal last
//      active, consent count (clickable → Owner tab)

const TOTAL_CONSENT_CATEGORIES = 5;

const ORDINAL_SUFFIX = (day: number): string => {
  if (day >= 11 && day <= 13) return "th";
  switch (day % 10) {
    case 1: return "st";
    case 2: return "nd";
    case 3: return "rd";
    default: return "th";
  }
};

function formatOrdinalDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const day = d.getDate();
  const month = d.toLocaleDateString("en-AU", { month: "long" });
  return `${day}${ORDINAL_SUFFIX(day)} ${month} ${d.getFullYear()}`;
}

function formatRelative(iso: string | null | undefined): string {
  if (!iso) return "Never";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "Never";
  const diff = Date.now() - then;
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  return `${Math.floor(days / 365)} years ago`;
}

function formatCurrency(n: number): string {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n);
}

interface LotDetailsInput {
  id: string;
  lot_number: number;
  unit_number: string | null;
  lot_entitlement: number | null;
  lot_liability: number | null;
  payment_reference: string | null;
}

interface Props {
  ownerDisplayName: string | null;
  ownerEmail: string | null;
  ownerPhone: string | null;
  ownerType: string;
  isOwnerOccupied: boolean;
  ownershipSince: string | null;
  consentCategories: string[];
  portalLastActiveAt: string | null;
  nextLevy: NextLevyDue | null;
  activity: LotActivityEntry[];
  onViewAllActivity: () => void;
  onConsentClick: () => void;
  lotDetails: LotDetailsInput;
  onLotDetailsSaved: () => void;
}

export function LotOverviewTab({
  ownerDisplayName,
  ownerEmail,
  ownerPhone,
  ownerType,
  isOwnerOccupied,
  ownershipSince,
  consentCategories,
  portalLastActiveAt,
  nextLevy,
  activity,
  onViewAllActivity,
  onConsentClick,
  lotDetails,
  onLotDetailsSaved,
}: Props) {
  void ownerEmail;
  void ownerPhone;
  void isOwnerOccupied;
  const recentActivity = activity.slice(0, 5);
  const ownershipSinceLabel = formatOrdinalDate(ownershipSince) ?? "Not set";
  const portalLabel = formatRelative(portalLastActiveAt);
  const consentCount = consentCategories.length;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {/* Lot details ------------------------------------------------------ */}
      <Card className="lg:col-span-2">
        <CardContent className="pt-5">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex items-center gap-2">
              <Hash className="h-4 w-4 text-[color:var(--brand-gold)]" />
              <h3 className="text-sm font-semibold text-foreground">Lot details</h3>
            </div>
            <LotDetailsEditSheet lot={lotDetails} onSaved={onLotDetailsSaved} />
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
            <DetailField label="Lot number" value={String(lotDetails.lot_number)} mono />
            <DetailField
              label="Unit number"
              value={lotDetails.unit_number || ""}
              mono
            />
            <DetailField
              label="Entitlement"
              value={
                lotDetails.lot_entitlement !== null
                  ? String(lotDetails.lot_entitlement)
                  : ""
              }
            />
            <DetailField
              label="Liability"
              value={
                lotDetails.lot_liability !== null
                  ? String(lotDetails.lot_liability)
                  : ""
              }
            />
            {lotDetails.payment_reference && (
              <div className="col-span-2 sm:col-span-4">
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                  Payment reference
                </dt>
                <dd className="mt-0.5 font-mono text-sm font-semibold text-foreground">
                  {lotDetails.payment_reference}
                </dd>
              </div>
            )}
          </dl>
        </CardContent>
      </Card>

      {/* Next levy due ---------------------------------------------------- */}
      <Card>
        <CardContent className="pt-5">
          <div className="flex items-center gap-2 mb-2">
            <Calendar className="h-4 w-4 text-[color:var(--brand-gold)]" />
            <h3 className="text-sm font-semibold text-foreground">Next levy due</h3>
          </div>
          {nextLevy ? (
            <>
              <p className="text-2xl font-bold tracking-tight text-foreground tabular-nums">
                {formatOrdinalDate(nextLevy.due_date)}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {formatCurrency(nextLevy.amount)}
                <span className="mx-2">·</span>
                <span className="font-mono text-xs">{nextLevy.reference_number}</span>
              </p>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center gap-1.5 py-4 text-center">
              <CalendarCheck className="h-8 w-8 text-[color:var(--brand-gold)]" />
              <p className="text-sm font-medium text-foreground">
                All levies paid
              </p>
              <p className="text-xs text-muted-foreground">
                No outstanding levy notice.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Snapshot --------------------------------------------------------- */}
      <Card>
        <CardContent className="pt-5">
          <h3 className="text-sm font-semibold text-foreground mb-3">Snapshot</h3>
          <dl className="space-y-2.5 text-sm">
            <SnapshotRow label="Owner" value={ownerDisplayName ?? "Unassigned"} sub={ownerType} />
            <SnapshotRow label="Ownership since" value={ownershipSinceLabel} muted={!ownershipSince} />
            <SnapshotRow label="Portal last active" value={portalLabel} muted={!portalLastActiveAt} />
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-muted-foreground">Consent</dt>
              <dd className="text-right">
                <button
                  type="button"
                  onClick={onConsentClick}
                  className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 underline-offset-4 hover:underline cursor-pointer"
                >
                  {consentCount} of {TOTAL_CONSENT_CATEGORIES} categories
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {/* Recent activity -------------------------------------------------- */}
      <Card className="lg:col-span-2">
        <CardContent className="pt-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-[color:var(--brand-gold)]" />
              <h3 className="text-sm font-semibold text-foreground">Recent activity</h3>
            </div>
            {activity.length > 5 && (
              <Button variant="ghost" size="sm" onClick={onViewAllActivity}>
                View all activity
                <ChevronRight className="ml-1 h-3.5 w-3.5" />
              </Button>
            )}
          </div>
          {recentActivity.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-1.5 py-6 text-center">
              <FileText className="h-8 w-8 text-[color:var(--brand-gold)]" />
              <p className="text-sm font-medium text-foreground">
                No activity yet
              </p>
              <p className="text-xs text-muted-foreground">
                Owner updates, levies and payments will show up here as they happen.
              </p>
            </div>
          ) : (
            <ol className="divide-y divide-border">
              {recentActivity.map((row) => (
                <li key={row.id} className="flex items-start justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">
                      {describeAuditEvent(row)}
                    </p>
                    {row.actor_name && (
                      <p className="mt-0.5 text-xs text-muted-foreground">by {row.actor_name}</p>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {formatRelative(row.created_at)}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
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
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd
        className={`mt-0.5 text-sm font-semibold text-foreground tabular-nums ${
          mono ? "font-mono" : ""
        }`}
      >
        {value || "—"}
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
  const [unit, setUnit] = useState(lot.unit_number ?? "");
  const [entitlement, setEntitlement] = useState(
    lot.lot_entitlement !== null ? String(lot.lot_entitlement) : "",
  );
  const [liability, setLiability] = useState(
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

function SnapshotRow({
  label,
  value,
  sub,
  muted,
}: {
  label: string;
  value: string;
  sub?: string;
  muted?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={`text-right font-medium ${muted ? "text-muted-foreground" : "text-foreground"}`}>
        {value}
        {sub && <span className="ml-1.5 text-xs font-normal text-muted-foreground">({sub})</span>}
      </dd>
    </div>
  );
}

// Best-effort human label for an audit row. We keep this dictionary lean
// (action+entity_type pairs we expect) and fall back to a generic phrase for
// anything we haven't catalogued yet.
function describeAuditEvent(row: LotActivityEntry): string {
  const map: Record<string, string> = {
    "create:lot_owner": "Owner contact captured",
    "update:lot_owner": "Owner contact updated",
    "accept:invitation": "Owner accepted portal invitation",
    "create:invitation": "Portal invitation sent",
    "send:invitation": "Portal invitation re-sent",
    "update:lot": "Lot details updated",
    "update:consent": "Consent updated",
    "update:occupancy": "Occupancy status changed",
    "create:tenant": "Tenant added",
    "update:tenant": "Tenant details updated",
    "delete:tenant": "Tenant removed",
    "create:settlement": "Settlement recorded",
    "create:levy_notice": "Levy notice issued",
    "create:payment": "Payment recorded",
    "send:sms": "SMS sent",
    "send:email": "Email sent",
    "create:phone_call": "Phone call logged",
    "create:document": "Document uploaded",
  };
  const key = `${row.action}:${row.entity_type}`;
  return map[key] ?? `${row.entity_type.replace(/_/g, " ")} ${row.action}`;
}
