"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  FileSignature, Mail, Phone, UserPlus,
  MoreVertical, Hash,
  Pencil,
} from "lucide-react";
import { useSetBreadcrumb } from "@/lib/breadcrumb-context";
import { EditPopover } from "@/components/shared/edit-popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
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
import { InviteDialog } from "../../manage/invite-dialog";
import { LotOverviewTab } from "./tabs/lot-overview-tab";
import { LotHistoryTab } from "./tabs/lot-history-tab";
import { LotOwnerTab } from "./tabs/lot-owner-tab";
import { LotTenancyTab } from "./tabs/lot-tenancy-tab";
import { LotCommunicationsTab } from "./tabs/lot-communications-tab";
import type { LotCommunicationRow } from "@/lib/actions/lot-communications";
import type { DocumentRecord } from "@/lib/validations/documents";
import type { OwnershipHistoryEntry } from "@/lib/validations/settlement";
import type { LotOwnerInfo } from "@/lib/actions/lot-ownership";
import type {
  NextLevyDue,
  LotActivityEntry,
  LotDrn,
  PortalActivity,
} from "@/lib/actions/lot-overview";
import { useOCCode } from "@/lib/oc-context";

type OccupancyStatus = "owner_occupied" | "tenanted" | "vacant" | null;

interface LotOwnerExtra {
  lot_owner_id: string | null;
  owner_type: string | null;
  payment_reference: string | null;
  is_occupied_by_owner: boolean | null;
  occupancy_status: OccupancyStatus;
  ownership_since: string | null;
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
  nextLevy: NextLevyDue | null;
  activity: LotActivityEntry[];
  drns: LotDrn[];
  portalActivity: PortalActivity;
  communications: LotCommunicationRow[];
}

const TABS = [
  { value: "overview", label: "Overview" },
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

export function LotDetailContent({
  lot: initialLot,
  owner,
  ocId,
  balance,
  documents,
  ownershipHistory,
  lotOwnerExtra,
  lastPaymentAt,
  nextLevy,
  activity,
  drns,
  portalActivity,
  communications,
}: LotDetailContentProps) {
  const ocCode = useOCCode();
  const searchParams = useSearchParams();
  const router = useRouter();
  const rawTab = searchParams.get("tab") ?? "overview";
  // Migrate legacy ?tab=general / ?tab=payments URLs to the new values.
  const normalisedTab =
    rawTab === "payments" ? "ledger" : rawTab === "general" ? "overview" : rawTab;
  const initialTab = normalisedTab as TabValue;
  const [activeTab, setActiveTab] = useState<TabValue>(initialTab);
  const [lot, setLot] = useState(initialLot);
  void setLot;
  const [settlementOpen, setSettlementOpen] = useState(false);
  const [addOwnerOpen, setAddOwnerOpen] = useState(false);

  // Item 4 — replace the generic "Owner details" breadcrumb with entity-specific
  // "Lot N · Unit X" so the user can see at a glance which lot they're on.
  useSetBreadcrumb([
    { label: "Lots & Owners", href: `/ocs/${ocCode}/lots` },
    {
      label:
        `Lot ${lot.lot_number}` + (lot.unit_number ? ` · Unit ${lot.unit_number}` : ""),
    },
  ]);

  useEffect(() => {
    if (rawTab === "payments" || rawTab === "general") {
      window.history.replaceState(null, "", `/ocs/${ocCode}/lots/${lot.id}?tab=${normalisedTab}`);
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
  // Canonical 3-state occupancy. Prefer the enum column; fall back to the
  // legacy boolean + tenant heuristic for rows that pre-date the migration.
  const resolvedOccupancy: "owner_occupied" | "tenanted" | "vacant" =
    lotOwnerExtra?.occupancy_status ??
    (isOwnerOccupied
      ? "owner_occupied"
      : lotOwnerExtra?.tenant_name
        ? "tenanted"
        : "vacant");

  const lastPaymentRelative = formatRelative(lastPaymentAt);

  return (
    <div className="space-y-6">
      {/* Item 3 — "Back to Lots & Owners" link removed. The breadcrumb is the
          source of truth for navigation; the duplicate link wasted vertical
          space and competed for the eye. */}

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
            </div>
            {/* Item 7 — "Update owner contact" removed. The More actions menu
                now only surfaces actions that can't be triggered inline from
                a tab. "Add owner" only appears while the lot has no owner on
                file — ownership changes after that go through Transfer
                ownership in the Owner tab. */}
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
                {!owner.owner_display_name && (
                  <DropdownMenuItem onClick={() => setAddOwnerOpen(true)}>
                    <UserPlus className="mr-2 h-4 w-4" />
                    Add owner
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => setSettlementOpen(true)}>
                  <FileSignature className="mr-2 h-4 w-4" />
                  Record settlement
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Lot meta strip. tabular-nums on number values so columns of
              digits line up. The "Edit lot details" trigger opens one popover
              that lets the manager update unit number / entitlement / liability
              together (Item 9). Lot number itself stays locked. */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
            <MetaPair label="Entitlement" value={lot.lot_entitlement ? String(lot.lot_entitlement) : ""} />
            <MetaPair label="Liability" value={lot.lot_liability ? String(lot.lot_liability) : ""} />
            {lotOwnerExtra?.payment_reference && (
              <MetaPair label="Reference" value={lotOwnerExtra.payment_reference} mono />
            )}
            <LotDetailsEditPopover
              lotId={lot.id}
              initial={{
                unit_number: lot.unit_number ?? "",
                lot_entitlement: lot.lot_entitlement ?? null,
                lot_liability: lot.lot_liability ?? null,
              }}
              onSaved={() => router.refresh()}
            />
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

          {/* Item 5 — Last payment moved left, adjacent to Current balance, so
              the two financial facts about the lot live as one tight cluster
              instead of being pushed to opposite ends of the row. */}
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 text-sm">
            <div className="inline-flex items-baseline gap-2">
              <span className="text-muted-foreground">Current balance:</span>
              <span
                className={`font-semibold tabular-nums ${
                  balance > 0 ? "text-destructive" : "text-[hsl(160,100%,37%)]"
                }`}
              >
                {balance > 0 ? `-${formatCurrency(balance)}` : formatCurrency(balance)}
                {balance > 0 && <span className="ml-1 text-xs font-normal text-muted-foreground">(owes)</span>}
              </span>
            </div>
            <div className="inline-flex items-baseline gap-2 text-muted-foreground">
              <span>Last payment:</span>
              <span className="font-medium text-foreground">
                {lastPaymentRelative ?? "none"}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Item 6 — tab strip spans the full content width with each trigger
          flex-equal so labels sit on a balanced grid instead of huddled in the
          left third of the page. */}
      <Tabs value={activeTab} onValueChange={onTabChange}>
        <TabsList variant="line" className="w-full justify-stretch border-b border-border">
          {TABS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value} className="flex-1">
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Tab content. Render all tabs once with `hidden` on the inactive
          ones so per-tab state (ledger filters, etc.) survives switching. */}
      <div className={activeTab === "overview" ? "" : "hidden"}>
        <LotOverviewTab
          ownerDisplayName={owner.owner_display_name ?? null}
          ownerType={ownerType}
          ownershipSince={lotOwnerExtra?.ownership_since ?? null}
          consentCategories={lotOwnerExtra?.digital_consent_categories ?? []}
          portalLastActiveAt={portalActivity.last_active_at}
          nextLevy={nextLevy}
          activity={activity}
          onViewAllActivity={() => onTabChange("history")}
          onConsentClick={() => onTabChange("owner")}
        />
      </div>

      <div className={activeTab === "owner" ? "" : "hidden"}>
        <LotOwnerTab
          lotOwnerId={lotOwnerExtra?.lot_owner_id ?? null}
          activeOwner={owner}
          activeHistoryEntry={activeHistoryEntry}
          pastHistoryEntries={pastHistoryEntries}
          ownerType={lotOwnerExtra?.owner_type === "company" ? "company" : "individual"}
          paymentReference={lotOwnerExtra?.payment_reference ?? null}
          postalAddress={lotOwnerExtra?.postal_address ?? null}
          portalActive={portalActive}
          portalInviteAccepted={portalActive}
          consentCategories={lotOwnerExtra?.digital_consent_categories ?? []}
          drns={drns}
          onTransfer={() => setSettlementOpen(true)}
        />
      </div>

      <div className={activeTab === "tenancy" ? "" : "hidden"}>
        <LotTenancyTab
          lotOwnerId={lotOwnerExtra?.lot_owner_id ?? null}
          occupancyStatus={resolvedOccupancy}
          tenantName={lotOwnerExtra?.tenant_name ?? null}
          tenantEmail={lotOwnerExtra?.tenant_email ?? null}
          tenantPhone={lotOwnerExtra?.tenant_phone ?? null}
          activity={activity}
        />
      </div>

      <div className={activeTab === "ledger" ? "" : "hidden"}>
        <LedgerTab ocId={ocId} lotId={lot.id} />
      </div>

      <div className={activeTab === "levies" ? "" : "hidden"}>
        <PlaceholderTab name="Levies" />
      </div>

      <div className={activeTab === "communications" ? "" : "hidden"}>
        <LotCommunicationsTab
          ocId={ocId}
          lotId={lot.id}
          ownerEmail={owner.owner_contact_email ?? null}
          ownerPhone={owner.owner_contact_phone ?? null}
          ownerName={owner.owner_display_name ?? null}
          initialCommunications={communications}
        />
      </div>

      <div className={activeTab === "documents" ? "" : "hidden"}>
        <DocumentManager ocId={ocId} lotId={lot.id} initialDocuments={documents} />
      </div>

      <div className={activeTab === "history" ? "" : "hidden"}>
        <LotHistoryTab activity={activity} />
      </div>

      <SettlementDialog
        open={settlementOpen}
        onClose={() => setSettlementOpen(false)}
        ocId={ocId}
        lotId={lot.id}
        lotNumber={Number(lot.lot_number)}
        onApplied={() => router.refresh()}
      />

      <InviteDialog
        open={addOwnerOpen}
        onClose={() => { setAddOwnerOpen(false); router.refresh(); }}
        ocId={ocId}
        lotId={lot.id}
        lotNumber={Number(lot.lot_number)}
        prefillName={owner.owner_display_name ?? undefined}
        prefillEmail={owner.owner_contact_email ?? undefined}
        prefillPhone={owner.owner_contact_phone ?? undefined}
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

// ─── Lot details popover (unit number + entitlement + liability) ────────
// Bundled into one popover so the manager can adjust all three identifiers
// in one flow. `requireConfirmation` on EditPopover surfaces a "Confirm save"
// step because these fields ripple into levy calculations + voting rights.

function LotDetailsEditPopover({
  lotId,
  initial,
  onSaved,
}: {
  lotId: string;
  initial: { unit_number: string; lot_entitlement: number | null; lot_liability: number | null };
  onSaved: () => void;
}) {
  const [unit, setUnit] = useState(initial.unit_number);
  const [entitlement, setEntitlement] = useState(
    initial.lot_entitlement !== null ? String(initial.lot_entitlement) : "",
  );
  const [liability, setLiability] = useState(
    initial.lot_liability !== null ? String(initial.lot_liability) : "",
  );

  // Lazy-require the action only when this popover gets rendered.
  return (
    <EditPopover
      label="Edit lot details"
      renderTrigger={() => (
        <button
          type="button"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
        >
          <Pencil className="h-3 w-3" />
          Edit
        </button>
      )}
      requireConfirmation
      confirmationMessage="These values drive levy calculations. Save anyway?"
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
          lot_id: lotId,
          unit_number: unit.trim() || null,
          lot_entitlement: entitlementNum,
          lot_liability: liabilityNum,
        });
        if (res.ok) onSaved();
        return res.ok ? { ok: true as const } : { ok: false as const, error: res.error };
      }}
    >
      <Label>Unit number</Label>
      <Input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="Unit number" />
      <Label className="pt-1">Lot entitlement</Label>
      <Input
        value={entitlement}
        onChange={(e) => setEntitlement(e.target.value)}
        placeholder="Lot entitlement"
        inputMode="decimal"
      />
      <Label className="pt-1">Lot liability</Label>
      <Input
        value={liability}
        onChange={(e) => setLiability(e.target.value)}
        placeholder="Lot liability"
        inputMode="decimal"
      />
    </EditPopover>
  );
}

// Old GeneralTab / OwnerTab / TenancyTab removed — replaced by LotOverviewTab,
// LotOwnerTab, and LotTenancyTab in ./tabs/. The legacy KvRow / PastOwnerRow
// helpers moved into LotOwnerTab; durationLabel / formatMonthYear / initials
// live there too.

// ─── History tab ───────────────────────────────────────────────

// Old ownership-timeline HistoryTab removed — History tab now renders the
// LotHistoryTab (audit log). Ownership timeline lives in the Owner tab via
// the PastOwnerRow list (Item 17).

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
