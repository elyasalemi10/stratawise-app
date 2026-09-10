"use client";

import { useCallback, useEffect, useState } from "react";
import { urlSegment } from "@/lib/short-code-shared";
import { useSearchParams } from "next/navigation";
import {
  FileSignature, UserPlus,
  MoreVertical, Mail, MessageSquare,
} from "lucide-react";
import { useSetBreadcrumb } from "@/lib/breadcrumb-context";
import { Button } from "@/components/ui/button";
import { invalidateCached, refetchCached } from "@/lib/use-cached-data";
import { replaceUrlIfOn } from "@/lib/replace-url";
import { cn } from "@/lib/utils";
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
import { InviteStatusPopover } from "../invite-status-popover";
import { LotOwnerTab } from "./tabs/lot-owner-tab";
import { LotCommunicationsTab } from "./tabs/lot-communications-tab";
import type { LotCommunicationRow } from "@/lib/actions/lot-communications";
import type { LotEngagement } from "@/lib/actions/lot-engagement";
import type { DocumentRecord } from "@/lib/validations/documents";
import type { OwnershipHistoryEntry } from "@/lib/validations/settlement";
import type { LotOwnerInfo } from "@/lib/actions/lot-ownership";
import type {
  LotActivityEntry,
  PortalActivity,
} from "@/lib/actions/lot-overview";
import { useOCCode } from "@/lib/oc-context";


interface LotOwnerExtra {
  lot_owner_id: string | null;
  payment_reference: string | null;
  ownership_since: string | null;
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
  /** Real invitation state, from the same query the lots table reads. */
  inviteStatus: "not_invited" | "pending" | "accepted";
  lotOwnerExtra: LotOwnerExtra | null;
  lotAddress: string | null;
  activity: LotActivityEntry[];
  portalActivity: PortalActivity;
  communications: LotCommunicationRow[];
  engagement: LotEngagement;
  initialSenderEmailAddress?: string | null;
  initialSmsSenderId?: string | null;
  /** All lots in the OC , lets the settlement drawer re-target the lot. */
  ocLots?: { id: string; lotNumber: number; unitNumber?: string | number | null }[];
}

const TABS = [
  { value: "owner", label: "Owner" },
  { value: "levies", label: "Levies" },
  { value: "communications", label: "Communications" },
  { value: "documents", label: "Documents" },
] as const;

type TabValue = typeof TABS[number]["value"];

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(Math.abs(n));

export function LotDetailContent({
  lot: initialLot,
  owner,
  ocId,
  balance,
  documents,
  ownershipHistory,
  inviteStatus,
  lotOwnerExtra,
  lotAddress,
  activity,
  portalActivity,
  communications,
  engagement,
  initialSenderEmailAddress,
  initialSmsSenderId,
  ocLots,
}: LotDetailContentProps) {
  const ocCode = useOCCode();
  const searchParams = useSearchParams();
  // The lot page reads from the client cache, so router.refresh() updated
  // nothing here: it re-runs the server component while this page renders
  // from the cache, so the change only appeared when the 30s poll came
  // round. It also dropped the Router Cache for every other route. Re-fetch
  // this lot's key and drop the lists whose rows just changed.
  const refreshLot = useCallback(() => {
    refetchCached("lot:");
    invalidateCached("lots:");
  }, []);

  const rawTab = searchParams.get("tab") ?? "owner";
  // Migrate legacy URLs. Overview is gone (its one remaining card is on the
  // Owner tab), "general" was its older name, "payments" was the Levies
  // tab's, and "history" is now the bottom half of Communications.
  const LEGACY_TABS: Record<string, TabValue> = {
    general: "owner",
    overview: "owner",
    history: "communications",
    payments: "levies",
  };
  const normalisedTab = LEGACY_TABS[rawTab] ?? rawTab;
  const initialTab = normalisedTab as TabValue;
  const [activeTab, setActiveTab] = useState<TabValue>(initialTab);
  const lot = initialLot;
  // Auto-open the settlement drawer when the URL says so. Used by the
  // wrong-lot-number jump in the settlement dialog , the source page
  // pops `?settlement=open` here and the prefill payload is read by
  // SettlementDialog itself from sessionStorage on mount.
  const [settlementOpen, setSettlementOpen] = useState(
    searchParams.get("settlement") === "open",
  );
  const [addOwnerOpen, setAddOwnerOpen] = useState(false);
  // "Invite owner" in More actions opens the SAME dialog the status pill on
  // the Owner tab opens, driven from here. There used to be a second,
  // older confirm dialog for this one entry point, so the app had two
  // invite screens that could disagree about what it had already sent.
  const [inviteOpen, setInviteOpen] = useState(false);
  // When the manager picks "Send email" / "Send SMS" from More actions on
  // any tab, we jump to Communications and tell that tab to auto-open
  // the corresponding compose drawer. The tab clears this back to null
  // via onPendingActionHandled once it's consumed.
  const [pendingCommAction, setPendingCommAction] = useState<"email" | "sms" | null>(null);

  function openCompose(channel: "email" | "sms") {
    setPendingCommAction(channel);
    if (activeTab !== "communications") onTabChange("communications");
  }

  // Item 4 , replace the generic "Owner details" breadcrumb with entity-specific
  // "Lot N · Unit X" so the user can see at a glance which lot they're on.
  useSetBreadcrumb([
    { label: "Lots & Owners", href: `/ocs/${ocCode}/lots` },
    {
      label:
        `Lot ${lot.lot_number}` + (lot.unit_number ? ` · Unit ${lot.unit_number}` : ""),
    },
  ]);

  // The code, so the tab-sync rewrite does not replace a short URL with a
  // UUID one the moment the manager touches a tab.
  const ownPath = `/ocs/${ocCode}/lots/${urlSegment(lot)}`;

  useEffect(() => {
    if (rawTab in LEGACY_TABS) {
      replaceUrlIfOn(ownPath, `${ownPath}?tab=${normalisedTab}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onTabChange(value: string) {
    setActiveTab(value as TabValue);
    replaceUrlIfOn(ownPath, `${ownPath}?tab=${value}`);
  }

  // Split history into "currently active" and "ended". The active entry is
  // the one with no leftAt; everything else is a past tenure.
  const activeHistoryEntry = ownershipHistory.find((h) => !h.leftAt) ?? null;
  const pastHistoryEntries = ownershipHistory.filter((h) => !!h.leftAt);

  const portalActive = !!owner.profile_id;

  // "Lot 2 · Unit 2 - Owner name", with each piece dropping off when there
  // is nothing to put in it.
  const headerOwnerSuffix = owner.owner_display_name
    ? ` - ${owner.owner_display_name}`
    : "";

  return (
    <div className="space-y-6">
      {/* Which lot, who owns it, what they owe, and the actions that reach
          across every tab. Not a card: this is the page's identity line, not
          one panel among several, and boxing it made it compete with the
          real content underneath. The divider stays, because separating the
          label from the money is the work the outline was getting credit
          for. */}
      <div className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Lot {lot.lot_number}
                {lot.unit_number ? ` · Unit ${lot.unit_number}` : ""}
                {headerOwnerSuffix}
              </h1>
            </div>
            <div className="flex shrink-0 items-center gap-2">
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
                <DropdownMenuItem onClick={() => openCompose("email")}>
                  <Mail className="mr-2 h-4 w-4" />
                  Send email
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => openCompose("sms")}>
                  <MessageSquare className="mr-2 h-4 w-4" />
                  Send SMS
                </DropdownMenuItem>
                {!owner.owner_display_name ? (
                  <DropdownMenuItem onClick={() => setAddOwnerOpen(true)}>
                    <UserPlus className="mr-2 h-4 w-4" />
                    Add owner
                  </DropdownMenuItem>
                ) : (
                  // Owner exists but no portal account yet (or even if they
                  // do , resending an invite is idempotent server-side).
                  !portalActive && (
                    <DropdownMenuItem onClick={() => setInviteOpen(true)}>
                      <UserPlus className="mr-2 h-4 w-4" />
                      Invite owner
                    </DropdownMenuItem>
                  )
                )}
                <DropdownMenuItem onClick={() => setSettlementOpen(true)}>
                  <FileSignature className="mr-2 h-4 w-4" />
                  Record settlement
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            </div>
          </div>

          <div className="border-t border-border" />

          {/* One number: what this lot owes right now. Everything else that
              was here (when they last paid, what is next) is a detail of the
              ledger, and the ledger is a tab away with all of it in order. */}
          <div className="flex flex-wrap items-baseline gap-x-8 gap-y-2 text-base">
            <div className="inline-flex items-baseline gap-2">
              <span className="text-muted-foreground">
                {balance > 0 ? "Owes:" : balance < 0 ? "In credit:" : "Balance:"}
              </span>
              <span
                className={cn(
                  "text-lg font-semibold tabular-nums",
                  balance > 0
                    ? "text-destructive"
                    : balance < 0
                      ? "text-success-foreground"
                      : "text-foreground",
                )}
              >
                {formatCurrency(Math.abs(balance))}
              </span>
              {balance === 0 && (
                <span className="text-sm text-muted-foreground">All settled</span>
              )}
            </div>
          </div>
      </div>

      {/* Tab strip , bare shadcn line tabs. No container card, no border-b:
          the active gold underline is the only visible separator. Tabs
          wrap onto a second row on narrow viewports. */}
      <Tabs value={activeTab} onValueChange={onTabChange}>
        <TabsList
          variant="line"
          className="h-auto w-full flex-wrap justify-start gap-0 bg-transparent p-0"
        >
          {TABS.map((tab) => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              className="relative h-11 min-w-[6.5rem] rounded-none border-0 px-4 text-sm font-medium text-muted-foreground bg-transparent transition-colors hover:text-foreground hover:bg-transparent data-active:bg-transparent data-active:text-foreground group-data-horizontal/tabs:after:inset-x-0 group-data-horizontal/tabs:after:bottom-0 group-data-horizontal/tabs:after:h-0.5 data-active:after:bg-[color:var(--brand-gold)]"
            >
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Tab content. Render all tabs once with `hidden` on the inactive
          ones so per-tab state (ledger filters, etc.) survives switching. */}
      <div className={activeTab === "owner" ? "" : "hidden"}>
        <LotOwnerTab
          lotOwnerId={lotOwnerExtra?.lot_owner_id ?? null}
          activeOwner={owner}
          activeHistoryEntry={activeHistoryEntry}
          pastHistoryEntries={pastHistoryEntries}
          paymentReference={lotOwnerExtra?.payment_reference ?? null}
          portalLastActiveAt={portalActivity.last_active_at}
          postalAddress={lotOwnerExtra?.postal_address ?? null}
          portalActive={portalActive}
          portalInviteAccepted={portalActive}
          ocId={ocId}
          lotId={lot.id}
          lotNumber={lot.lot_number}
          ownerAvatarUrl={owner.owner_avatar_url}
          inviteStatus={inviteStatus}
          onInviteChanged={() => {
            // Drop the cached payload so the pill is re-read rather than
            // restored from the snapshot taken before the invite existed.
            invalidateCached(`lot:${lot.id}`);
            invalidateCached(`lots:${ocId}`);
            refreshLot();
          }}
          engagement={engagement}
          onTransfer={() => setSettlementOpen(true)}
          lotDetails={{
            id: lot.id,
            lot_number: Number(lot.lot_number),
            unit_number: lot.unit_number ?? null,
            lot_entitlement: lot.lot_entitlement ?? null,
            lot_liability: lot.lot_liability ?? null,
          }}
          onLotDetailsSaved={() => refreshLot()}
        />
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
          pendingAction={pendingCommAction}
          onPendingActionHandled={() => setPendingCommAction(null)}
          initialSenderEmailAddress={initialSenderEmailAddress ?? null}
          initialSmsSenderId={initialSmsSenderId ?? null}
          activity={activity}
        />
      </div>

      <div className={activeTab === "documents" ? "" : "hidden"}>
        <DocumentManager ocId={ocId} lotId={lot.id} initialDocuments={documents} />
      </div>

      <SettlementDialog
        open={settlementOpen}
        onClose={() => setSettlementOpen(false)}
        ocId={ocId}
        lotId={lot.id}
        lotNumber={Number(lot.lot_number)}
        lotAddress={lotAddress}
        lots={ocLots}
        onApplied={() => refreshLot()}
      />

      <InviteDialog
        open={addOwnerOpen}
        onClose={() => { setAddOwnerOpen(false); refreshLot(); }}
        ocId={ocId}
        lotId={lot.id}
        lotNumber={Number(lot.lot_number)}
        prefillName={owner.owner_display_name ?? undefined}
        prefillEmail={owner.owner_contact_email ?? undefined}
        prefillPhone={owner.owner_contact_phone ?? undefined}
      />

      <InviteStatusPopover
        showPill={false}
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        ocId={ocId}
        lotId={lot.id}
        lotNumber={Number(lot.lot_number)}
        status={inviteStatus}
        ownerName={owner.owner_display_name ?? null}
        ownerEmail={owner.owner_contact_email ?? null}
        ownerPhone={owner.owner_contact_phone ?? null}
        onInviteChanged={() => {
          invalidateCached(`lot:${lot.id}`);
          invalidateCached(`lots:${ocId}`);
          refreshLot();
        }}
      />
    </div>
  );
}
