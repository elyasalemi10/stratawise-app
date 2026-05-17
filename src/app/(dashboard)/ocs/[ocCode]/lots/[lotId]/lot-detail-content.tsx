"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  FileSignature, UserPlus,
  MoreVertical, Hash,
} from "lucide-react";
import { useSetBreadcrumb } from "@/lib/breadcrumb-context";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LotLeviesTab } from "./tabs/lot-levies-tab";
import { DocumentManager } from "@/components/shared/document-manager";
import { SettlementDialog } from "./settlement-dialog";
import { InviteDialog } from "../../manage/invite-dialog";
import { LotOverviewTab } from "./tabs/lot-overview-tab";
import { LotHistoryTab } from "./tabs/lot-history-tab";
import { LotOwnerTab } from "./tabs/lot-owner-tab";
import { LotTenancyTab } from "./tabs/lot-tenancy-tab";
import { LotCommunicationsTab } from "./tabs/lot-communications-tab";
import type { LotCommunicationRow } from "@/lib/actions/lot-communications";
import type { LotEngagement } from "@/lib/actions/lot-engagement";
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
  anyLevyEverIssued: boolean;
  lotAddress: string | null;
  activity: LotActivityEntry[];
  drns: LotDrn[];
  portalActivity: PortalActivity;
  communications: LotCommunicationRow[];
  engagement: LotEngagement;
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
  anyLevyEverIssued,
  lotAddress,
  activity,
  drns,
  portalActivity,
  communications,
  engagement,
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
  void formatLongDate;
  void initials;
  const portalActive = !!owner.profile_id;
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

  // Top header line: "Lot 2 · Unit 2 - Owner name" (or no unit, no owner —
  // pieces drop off gracefully). The lot details (entitlement / liability /
  // edit) now live in a card inside the Overview tab, so this header is just
  // identity + the cross-tab Actions menu + the financial line.
  const headerOwnerSuffix = owner.owner_display_name
    ? ` - ${owner.owner_display_name}`
    : "";

  return (
    <div className="space-y-6">
      {/* ─── Identity header ────────────────────────────────────────
          Lot label, primary actions, and the balance / last-payment line.
          Owner snapshot + lot meta strip moved into the Overview tab so
          the header stays focused on identification + cross-tab actions. */}
      <Card>
        <CardContent className="pt-5 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Lot {lot.lot_number}
                {lot.unit_number ? ` · Unit ${lot.unit_number}` : ""}
                {headerOwnerSuffix}
              </h1>
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

          <div className="border-t border-border" />

          {/* Financial facts at-a-glance. Sized up vs. the previous label/value
              line so the manager can read balance + last-payment without
              squinting. Gold underline on "Current balance" / "Last payment"
              labels nudges them as headline data rather than form labels. */}
          <div className="flex flex-wrap items-baseline gap-x-8 gap-y-2 text-base">
            <div className="inline-flex items-baseline gap-2">
              <span className="text-muted-foreground">Current balance:</span>
              <span
                className={`text-lg font-semibold tabular-nums ${
                  balance > 0 ? "text-destructive" : "text-[hsl(160,100%,37%)]"
                }`}
              >
                {balance > 0 ? `-${formatCurrency(balance)}` : formatCurrency(balance)}
                {balance > 0 && (
                  <span className="ml-1 text-sm font-normal text-muted-foreground">
                    (owes)
                  </span>
                )}
              </span>
            </div>
            <div className="inline-flex items-baseline gap-2">
              {lastPaymentRelative ? (
                <>
                  <span className="text-muted-foreground">Last payment:</span>
                  <span className="text-lg font-semibold text-foreground">
                    {lastPaymentRelative}
                  </span>
                </>
              ) : (
                <span className="text-lg font-semibold text-muted-foreground">
                  No payments yet
                </span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tab strip — plain shadcn line tabs inside a single white card.
          Triggers are pure text (no per-trigger background, no hover-pill).
          Active state: foreground text + a 2px gold underline that sits at
          the bottom EDGE of the card (cell-aligned via bottom-0 + h-0.5).
          The card carries the visual surface; the tabs are just labels. */}
      {/* Tab strip — one white card; tabs wrap onto a second row on narrow
          viewports instead of triggering horizontal scroll. The active gold
          underline rides flush with the BOTTOM of the row the trigger is on,
          so every row keeps its own indicator. */}
      <Tabs value={activeTab} onValueChange={onTabChange}>
        <div className="rounded-md border border-border bg-card">
          <TabsList
            variant="line"
            className="h-auto w-full flex-wrap justify-stretch gap-0 border-none bg-transparent p-0"
          >
            {TABS.map((tab) => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className="relative flex-1 min-w-[6.5rem] h-12 rounded-none border-0 text-sm font-medium text-muted-foreground bg-transparent transition-colors hover:text-foreground hover:bg-transparent data-active:bg-transparent data-active:text-foreground data-active:after:bg-[color:var(--brand-gold)] data-active:after:opacity-100 data-active:after:inset-x-0 data-active:after:bottom-0 data-active:after:h-0.5 data-active:after:rounded-none"
              >
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
      </Tabs>

      {/* Tab content. Render all tabs once with `hidden` on the inactive
          ones so per-tab state (ledger filters, etc.) survives switching. */}
      <div className={activeTab === "overview" ? "" : "hidden"}>
        <LotOverviewTab
          ownerDisplayName={owner.owner_display_name ?? null}
          ownerEmail={owner.owner_contact_email ?? null}
          ownerPhone={owner.owner_contact_phone ?? null}
          ownerType={ownerType}
          isOwnerOccupied={isOwnerOccupied}
          ownershipSince={lotOwnerExtra?.ownership_since ?? null}
          consentCategories={lotOwnerExtra?.digital_consent_categories ?? []}
          portalLastActiveAt={portalActivity.last_active_at}
          nextLevy={nextLevy}
          anyLevyEverIssued={anyLevyEverIssued}
          activity={activity}
          onViewAllActivity={() => onTabChange("history")}
          onConsentClick={() => onTabChange("owner")}
          lotDetails={{
            id: lot.id,
            lot_number: Number(lot.lot_number),
            unit_number: lot.unit_number ?? null,
            lot_entitlement: lot.lot_entitlement ?? null,
            lot_liability: lot.lot_liability ?? null,
            payment_reference: lotOwnerExtra?.payment_reference ?? null,
          }}
          onLotDetailsSaved={() => router.refresh()}
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
          engagement={engagement}
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
        <ComingSoonTab name="Ledger" />
      </div>

      <div className={activeTab === "levies" ? "" : "hidden"}>
        <LotLeviesTab lotId={lot.id} />
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
        lotAddress={lotAddress}
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

// LotDetailsEditPopover relocated into LotOverviewTab — it now lives next
// to the new "Lot details" card on the Overview tab. See lot-overview-tab.tsx.

// Old GeneralTab / OwnerTab / TenancyTab removed — replaced by LotOverviewTab,
// LotOwnerTab, and LotTenancyTab in ./tabs/. The legacy KvRow / PastOwnerRow
// helpers moved into LotOwnerTab; durationLabel / formatMonthYear / initials
// live there too.

// ─── History tab ───────────────────────────────────────────────

// Old ownership-timeline HistoryTab removed — History tab now renders the
// LotHistoryTab (audit log). Ownership timeline lives in the Owner tab via
// the PastOwnerRow list (Item 17).

// ─── Coming soon ───────────────────────────────────────────────

function ComingSoonTab({ name }: { name: string }) {
  return (
    <EmptyState
      icon={Hash}
      title={`${name} — coming soon`}
      description="We're still building this tab."
    />
  );
}
