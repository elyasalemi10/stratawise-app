"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ChevronLeft, FileSignature, Mail, Phone, MapPin,
  MoreVertical, Repeat, Hash, ShieldCheck, ShieldOff,
  History as HistoryIcon, Calendar, ExternalLink,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LedgerTab } from "./lot-ledger-tab";
import { DocumentManager } from "@/components/shared/document-manager";
import { SettlementDialog } from "./settlement-dialog";
import type { DocumentRecord } from "@/lib/validations/documents";
import type { OwnershipHistoryEntry } from "@/lib/validations/settlement";
import type { LotOwnerInfo } from "@/lib/actions/lot-ownership";
import { useOCCode, useOptionalOC } from "@/lib/oc-context";

interface LotOwnerExtra {
  owner_type: string | null;
  payment_reference: string | null;
  is_occupied_by_owner: boolean | null;
  tenant_name: string | null;
  tenant_email: string | null;
  tenant_phone: string | null;
  digital_consent_categories: string[];
  at_portal_signup_categories: string[];
  postal_address: string | null;
}

interface LotDetailContentProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  lot: any;
  owner: LotOwnerInfo;
  ocId: string;
  balance: number;
  documents: DocumentRecord[];
  ownershipHistory: OwnershipHistoryEntry[];
  lotOwnerExtra: LotOwnerExtra | null;
  lastPaymentAt: string | null;
}

const TABS = [
  { value: "general", label: "General" },
  { value: "owner", label: "Owner" },
  { value: "tenancy", label: "Tenancy" },
  { value: "ledger", label: "Ledger" },
  { value: "levies", label: "Levies" },
  { value: "communications", label: "Communications" },
  { value: "documents", label: "Documents" },
  { value: "history", label: "History" },
] as const;

type TabValue = typeof TABS[number]["value"];

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(Math.abs(n));

function formatLongDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("en-AU", {
    day: "numeric", month: "long", year: "numeric",
  });
}

function formatMonthYear(iso: string | null | undefined): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("en-AU", { month: "short", year: "numeric" });
}

function formatRelative(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diff = now - then;
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  return `${Math.floor(days / 365)} years ago`;
}

function initials(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? "?";
  return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
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

const CONSENT_CATEGORY_LABELS: Record<string, string> = {
  meetings: "Meetings",
  levies: "Levies",
  breach: "Breach",
  financial_reports: "Financial reports",
  general_correspondence: "General correspondence",
};
const TOTAL_CONSENT_CATEGORIES = 5;

export function LotDetailContent({
  lot: initialLot,
  owner,
  ocId,
  balance,
  documents,
  ownershipHistory,
  lotOwnerExtra,
  lastPaymentAt,
}: LotDetailContentProps) {
  const ocCode = useOCCode();
  const oc = useOptionalOC();
  const searchParams = useSearchParams();
  const router = useRouter();
  const rawTab = searchParams.get("tab") ?? "general";
  const initialTab = (rawTab === "payments" ? "ledger" : rawTab) as TabValue;
  const [activeTab, setActiveTab] = useState<TabValue>(initialTab);
  const [lot, setLot] = useState(initialLot);
  void setLot;
  const [settlementOpen, setSettlementOpen] = useState(false);

  useEffect(() => {
    if (rawTab === "payments") {
      window.history.replaceState(null, "", `/ocs/${ocCode}/lots/${lot.id}?tab=ledger`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onTabChange(value: string) {
    setActiveTab(value as TabValue);
    window.history.replaceState(null, "", `/ocs/${ocCode}/lots/${lot.id}?tab=${value}`);
  }

  // Split history into "currently active" and "ended". The active entry is
  // the one with no leftAt; everything else is a past tenure.
  const activeHistoryEntry = ownershipHistory.find((h) => !h.leftAt) ?? null;
  const pastHistoryEntries = ownershipHistory.filter((h) => !!h.leftAt);

  const ownerType = lotOwnerExtra?.owner_type === "company" ? "Company" : "Individual";
  const isOwnerOccupied = lotOwnerExtra?.is_occupied_by_owner !== false;
  const ownerSince = formatLongDate(activeHistoryEntry?.joinedAt ?? null);
  const portalActive = !!owner.profile_id;
  const consentCount = lotOwnerExtra?.digital_consent_categories?.length ?? 0;

  const lastPaymentRelative = formatRelative(lastPaymentAt);

  return (
    <div className="space-y-6">
      <Link
        href={`/ocs/${ocCode}/lots`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronLeft className="h-4 w-4" />
        Back to Lots & Owners
      </Link>

      {/* ─── Identity header ────────────────────────────────────────
          One bordered card holding lot identifiers, address, inline
          metadata (entitlement / liability / reference), current owner
          snapshot, balance + last-payment line. Mirrors the user's
          mockup — every fact about THIS lot above the tab strip. */}
      <Card>
        <CardContent className="pt-5 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Lot {lot.lot_number}{lot.unit_number ? ` · Unit ${lot.unit_number}` : ""}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground inline-flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{oc?.address ?? ""}</span>
              </p>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button variant="secondary" size="sm">
                    <MoreVertical className="mr-1.5 h-3.5 w-3.5" />
                    More actions
                  </Button>
                }
              />
              <DropdownMenuContent align="end" sideOffset={6}>
                <DropdownMenuItem onClick={() => setSettlementOpen(true)}>
                  <FileSignature className="mr-2 h-4 w-4" />
                  Record settlement
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Lot meta strip. tabular-nums on number values so columns of
              digits line up. */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
            <MetaPair label="Entitlement" value={lot.lot_entitlement ? String(lot.lot_entitlement) : ""} />
            <MetaPair label="Liability" value={lot.lot_liability ? String(lot.lot_liability) : ""} />
            {lotOwnerExtra?.payment_reference && (
              <MetaPair label="Reference" value={lotOwnerExtra.payment_reference} mono />
            )}
          </div>

          <div className="border-t border-border" />

          {/* Current owner snapshot — single row with avatar + contacts. */}
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">
              Current owner
            </p>
            {owner.owner_display_name ? (
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-semibold">
                  {initials(owner.owner_display_name)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-foreground truncate">{owner.owner_display_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {ownerType} · {isOwnerOccupied ? "Owner-occupied" : "Tenanted"}
                    {ownerSince && <> · Since {ownerSince}</>}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    {owner.owner_contact_phone && (
                      <span className="inline-flex items-center gap-1">
                        <Phone className="h-3 w-3" />
                        {owner.owner_contact_phone}
                      </span>
                    )}
                    {owner.owner_contact_email && (
                      <span className="inline-flex items-center gap-1">
                        <Mail className="h-3 w-3" />
                        {owner.owner_contact_email}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Unassigned — no owner on file yet.</p>
            )}
          </div>

          <div className="border-t border-border" />

          {/* Balance + last-payment row */}
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 text-sm">
            <div className="inline-flex items-baseline gap-2">
              <span className="text-muted-foreground">Current balance:</span>
              <span
                className={`font-semibold tabular-nums ${
                  balance > 0
                    ? "text-destructive"
                    : balance < 0
                      ? "text-[hsl(160,100%,37%)]"
                      : "text-foreground"
                }`}
              >
                {balance > 0 ? `-${formatCurrency(balance)}` : formatCurrency(balance)}
                {balance > 0 && <span className="ml-1 text-xs font-normal text-muted-foreground">(owes)</span>}
              </span>
            </div>
            <div className="text-muted-foreground">
              Last payment: {lastPaymentRelative ?? "none"}
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={onTabChange}>
        <TabsList variant="line">
          {TABS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>{tab.label}</TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Tab content. Render all tabs once with `hidden` on the inactive
          ones so per-tab state (ledger filters, etc.) survives switching. */}
      <div className={activeTab === "general" ? "" : "hidden"}>
        <GeneralTab lot={lot} />
      </div>

      <div className={activeTab === "owner" ? "" : "hidden"}>
        <OwnerTab
          activeOwner={owner}
          activeHistoryEntry={activeHistoryEntry}
          pastHistoryEntries={pastHistoryEntries}
          isOwnerOccupied={isOwnerOccupied}
          ownerType={ownerType}
          paymentReference={lotOwnerExtra?.payment_reference ?? null}
          postalAddress={lotOwnerExtra?.postal_address ?? null}
          portalActive={portalActive}
          consentCount={consentCount}
          consentCategories={lotOwnerExtra?.digital_consent_categories ?? []}
          onTransfer={() => setSettlementOpen(true)}
        />
      </div>

      <div className={activeTab === "tenancy" ? "" : "hidden"}>
        <TenancyTab
          isOwnerOccupied={isOwnerOccupied}
          tenantName={lotOwnerExtra?.tenant_name ?? null}
          tenantEmail={lotOwnerExtra?.tenant_email ?? null}
          tenantPhone={lotOwnerExtra?.tenant_phone ?? null}
        />
      </div>

      <div className={activeTab === "ledger" ? "" : "hidden"}>
        <LedgerTab ocId={ocId} lotId={lot.id} />
      </div>

      <div className={activeTab === "levies" ? "" : "hidden"}>
        <PlaceholderTab name="Levies" />
      </div>

      <div className={activeTab === "communications" ? "" : "hidden"}>
        <PlaceholderTab name="Communications" />
      </div>

      <div className={activeTab === "documents" ? "" : "hidden"}>
        <DocumentManager ocId={ocId} lotId={lot.id} initialDocuments={documents} />
      </div>

      <div className={activeTab === "history" ? "" : "hidden"}>
        <HistoryTab pastEntries={pastHistoryEntries} activeEntry={activeHistoryEntry} />
      </div>

      <SettlementDialog
        open={settlementOpen}
        onClose={() => setSettlementOpen(false)}
        ocId={ocId}
        lotId={lot.id}
        lotNumber={Number(lot.lot_number)}
        onApplied={() => router.refresh()}
      />
    </div>
  );
}

// ─── Identity-strip MetaPair ────────────────────────────────────

function MetaPair({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  if (!value) return null;
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className="text-xs text-muted-foreground">{label}:</span>
      <span className={`font-semibold text-foreground tabular-nums ${mono ? "font-mono text-xs" : ""}`}>
        {value}
      </span>
    </span>
  );
}

// ─── General tab — lot identifiers only ─────────────────────────

function GeneralTab({ lot }: { lot: { lot_number: number; unit_number: string | null; lot_entitlement: number; lot_liability: number } }) {
  return (
    <Card>
      <CardContent className="pt-5">
        <h3 className="text-sm font-semibold text-foreground mb-3">Lot details</h3>
        <dl className="divide-y divide-border">
          <ReadOnlyRow label="Lot number" value={String(lot.lot_number)} />
          <ReadOnlyRow label="Unit number" value={lot.unit_number ?? ""} />
          <ReadOnlyRow label="Entitlement" value={lot.lot_entitlement ? String(lot.lot_entitlement) : ""} />
          <ReadOnlyRow label="Liability" value={lot.lot_liability ? String(lot.lot_liability) : ""} />
        </dl>
      </CardContent>
    </Card>
  );
}

function ReadOnlyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between py-3">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium text-foreground">{value}</dd>
    </div>
  );
}

// ─── Owner tab — current card + previous owners ─────────────────

function OwnerTab({
  activeOwner,
  activeHistoryEntry,
  pastHistoryEntries,
  isOwnerOccupied,
  ownerType,
  paymentReference,
  postalAddress,
  portalActive,
  consentCount,
  consentCategories,
  onTransfer,
}: {
  activeOwner: LotOwnerInfo;
  activeHistoryEntry: OwnershipHistoryEntry | null;
  pastHistoryEntries: OwnershipHistoryEntry[];
  isOwnerOccupied: boolean;
  ownerType: string;
  paymentReference: string | null;
  postalAddress: string | null;
  portalActive: boolean;
  consentCount: number;
  consentCategories: string[];
  onTransfer: () => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">Current owner</h3>
        {activeOwner.owner_display_name ? (
          <Card>
            <CardContent className="pt-5 space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-semibold">
                    {initials(activeOwner.owner_display_name)}
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground truncate">{activeOwner.owner_display_name}</p>
                    <p className="text-xs text-muted-foreground">{ownerType}</p>
                    <p className="text-xs text-muted-foreground">
                      {isOwnerOccupied ? "Owner-occupied" : "Tenanted"}
                      {activeHistoryEntry?.joinedAt && <> · Since {formatLongDate(activeHistoryEntry.joinedAt)}</>}
                    </p>
                  </div>
                </div>
                <Button variant="secondary" size="sm">Edit</Button>
              </div>

              <dl className="divide-y divide-border">
                <KvRow label="Email" value={activeOwner.owner_contact_email ?? ""} />
                <KvRow label="Phone" value={activeOwner.owner_contact_phone ?? ""} />
                <KvRow label="Service address" value={postalAddress ?? ""} />
                <KvRow label="Reference" value={paymentReference ?? ""} mono />
                <KvRow
                  label="Portal access"
                  value={
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
                <KvRow
                  label="Digital consent"
                  value={
                    <span className="inline-flex items-center gap-2">
                      <span>
                        {consentCount} of {TOTAL_CONSENT_CATEGORIES}
                        {consentCount > 0 && consentCount < TOTAL_CONSENT_CATEGORIES && " categories"}
                        {consentCount === TOTAL_CONSENT_CATEGORIES && " — all categories"}
                      </span>
                      {consentCount > 0 && (
                        <span
                          className="text-xs text-muted-foreground"
                          title={consentCategories.map((c) => CONSENT_CATEGORY_LABELS[c] ?? c).join(", ")}
                        >
                          ({consentCategories.map((c) => CONSENT_CATEGORY_LABELS[c] ?? c).join(", ")})
                        </span>
                      )}
                    </span>
                  }
                />
              </dl>

              <div className="flex justify-center pt-2">
                <Button variant="secondary" onClick={onTransfer}>
                  <Repeat className="mr-2 h-3.5 w-3.5" />
                  Transfer ownership
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              No active owner on this lot. Record a settlement to assign one.
            </CardContent>
          </Card>
        )}
      </div>

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

function KvRow({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between py-2.5">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className={`text-sm font-medium text-foreground text-right max-w-[60%] truncate ${mono ? "font-mono text-xs" : ""}`}>
        {value || <span className="text-muted-foreground italic">—</span>}
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
          <p className="text-sm font-medium text-foreground truncate">
            {entry.name ?? "Unknown owner"}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {fromLabel} – {toLabel}{duration && ` · ${duration}`}
          </p>
          {entry.email && (
            <p className="text-xs text-muted-foreground truncate" title={entry.email}>
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

// ─── Tenancy tab ───────────────────────────────────────────────

function TenancyTab({
  isOwnerOccupied,
  tenantName,
  tenantEmail,
  tenantPhone,
}: {
  isOwnerOccupied: boolean;
  tenantName: string | null;
  tenantEmail: string | null;
  tenantPhone: string | null;
}) {
  if (isOwnerOccupied) {
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <p className="text-sm font-medium text-foreground">This lot is owner-occupied.</p>
          <p className="mt-1 text-xs text-muted-foreground">No tenant on file.</p>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardContent className="pt-5">
        <h3 className="text-sm font-semibold text-foreground mb-3">Current tenant</h3>
        <dl className="divide-y divide-border">
          <KvRow label="Name" value={tenantName ?? ""} />
          <KvRow label="Email" value={tenantEmail ?? ""} />
          <KvRow label="Phone" value={tenantPhone ?? ""} />
        </dl>
      </CardContent>
    </Card>
  );
}

// ─── History tab ───────────────────────────────────────────────

function HistoryTab({
  activeEntry,
  pastEntries,
}: {
  activeEntry: OwnershipHistoryEntry | null;
  pastEntries: OwnershipHistoryEntry[];
}) {
  const all = activeEntry ? [activeEntry, ...pastEntries] : pastEntries;
  if (all.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          No ownership history yet for this lot.
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="flex items-center gap-2 mb-3">
          <HistoryIcon className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">Ownership timeline</h3>
        </div>
        <ol className="space-y-3 border-l border-border pl-4 ml-1">
          {all.map((entry) => (
            <li key={entry.id} className="relative">
              <span className="absolute -left-[18px] top-1 flex h-3 w-3 items-center justify-center rounded-full border-2 border-primary bg-card" />
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-foreground truncate">{entry.name ?? "Unknown owner"}</p>
                    {!entry.leftAt && <Badge variant="success">Current</Badge>}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground inline-flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {formatLongDate(entry.joinedAt)} → {entry.leftAt ? formatLongDate(entry.leftAt) : "Current"}
                  </p>
                </div>
                {entry.settlementDocument?.publicUrl && (
                  <a
                    href={entry.settlementDocument.publicUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline shrink-0"
                  >
                    <ExternalLink className="h-3 w-3" />
                    Settlement PDF
                  </a>
                )}
              </div>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}

// ─── Placeholder ───────────────────────────────────────────────

function PlaceholderTab({ name }: { name: string }) {
  return (
    <Card>
      <CardContent className="py-10 text-center text-sm text-muted-foreground">
        <Hash className="mx-auto mb-2 h-6 w-6 opacity-40" />
        {name} tab coming soon.
      </CardContent>
    </Card>
  );
}
