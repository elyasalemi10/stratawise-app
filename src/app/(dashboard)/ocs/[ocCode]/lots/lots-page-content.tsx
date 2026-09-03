"use client";

import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  Download,
  FileSignature,
  MailCheck,
  Search,
  Wrench,
  X,
  SlidersHorizontal,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LotsTab } from "../manage/lots-tab";
import { getLotInvitationStatus } from "../manage/invitation-actions";
import { SettlementDialog } from "./[lotId]/settlement-dialog";
import { BulkInviteDialog } from "./bulk-invite-dialog";
import type { LotWithFinancials } from "@/lib/actions/oc";

// The filters a manager actually reaches for on this page: who owes money,
// who is not on the portal yet, and how the lot is lived in. There was
// nothing here before but a search box and a sort , both of which answer
// "find this one lot", not "show me the group I need to act on".
type BalanceFilter = "all" | "arrears" | "settled";
type PortalFilter = "all" | "member" | "pending_invitation" | "unowned";
type OccupancyFilter = "all" | "owner_occupied" | "tenanted" | "vacant";

const BALANCE_OPTIONS: Array<{ value: BalanceFilter; label: string }> = [
  { value: "all", label: "Any balance" },
  { value: "arrears", label: "In arrears" },
  { value: "settled", label: "Settled" },
];
const PORTAL_OPTIONS: Array<{ value: PortalFilter; label: string }> = [
  { value: "all", label: "Any owner" },
  { value: "member", label: "On the portal" },
  { value: "pending_invitation", label: "Invited" },
  { value: "unowned", label: "No owner" },
];
const OCCUPANCY_OPTIONS: Array<{ value: OccupancyFilter; label: string }> = [
  { value: "all", label: "Any occupancy" },
  { value: "owner_occupied", label: "Owner-occupied" },
  { value: "tenanted", label: "Tenanted" },
  { value: "vacant", label: "Vacant" },
];


// Client-side CSV export , pulls straight from the in-memory lots prop so
// there's no extra round-trip. Sort by lot_number for stable ordering. The
// column set matches what managers expect to paste into a spreadsheet:
// identifiers, owner, financials.
function lotsToCsv(lots: LotWithFinancials[]): string {
  const header = [
    "lot_number", "unit_number",
    "owner_name", "owner_email", "owner_phone",
    "owner_status",
    "units_of_entitlement", "lot_liability",
    "balance_aud",
  ];
  const rows = [...lots]
    .sort((a, b) => a.lot_number - b.lot_number)
    .map((l) => [
      l.lot_number,
      l.unit_number ?? "",
      l.owner_display_name ?? "",
      l.owner_contact_email ?? "",
      l.owner_contact_phone ?? "",
      l.owner_status,
      l.lot_entitlement,
      l.lot_liability,
      l.balance.toFixed(2),
    ]);
  return [header, ...rows]
    .map((r) => r.map((c) => {
      const s = String(c);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(","))
    .join("\n");
}

export function LotsPageContent({
  lots: initialLots,
  ocId,
  ocName,
  isLotOwner,
  initialInviteStatus,
}: {
  lots: LotWithFinancials[];
  ocId: string;
  ocName: string;
  isLotOwner?: boolean;
  initialInviteStatus?: Record<string, string>;
}) {
  const router = useRouter();
  const [lots, setLots] = useState(initialLots);
  const [settlementOpen, setSettlementOpen] = useState(false);
  const [bulkInviteOpen, setBulkInviteOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [balanceFilter, setBalanceFilter] = useState<BalanceFilter>("all");
  const [portalFilter, setPortalFilter] = useState<PortalFilter>("all");
  const [occupancyFilter, setOccupancyFilter] = useState<OccupancyFilter>("all");
  // Single source of truth for invite-status. Seeded from the
  // server-rendered prop so the lots tab paints with the right pills on
  // first frame , no spinner-then-pop. Re-fetched only after a
  // client-side mutation (invite sent / revoked) when callers explicitly
  // ask for a refresh.
  const [inviteStatus, setInviteStatus] = useState<Map<string, string>>(() => {
    const map = new Map<string, string>();
    if (initialInviteStatus) {
      for (const [k, v] of Object.entries(initialInviteStatus)) map.set(k, v);
    }
    return map;
  });

  // Re-pull invitation status when the lot list changes (a new lot was
  // added / removed). Initial mount already has the server payload, so
  // skip the round-trip on the very first effect run.
  const initialIdsRef = React.useRef(lots.map((l) => l.id).sort().join(","));
  useEffect(() => {
    const lotIds = lots.map((l) => l.id);
    const key = lotIds.slice().sort().join(",");
    if (key === initialIdsRef.current && inviteStatus.size > 0) return;
    if (lotIds.length === 0) return;
    let cancelled = false;
    getLotInvitationStatus(ocId, lotIds).then((statusMap) => {
      if (cancelled) return;
      const map = new Map<string, string>();
      if (statusMap instanceof Map) {
        statusMap.forEach((v, k) => map.set(k, v));
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Object.entries(statusMap as any).forEach(([k, v]) => map.set(k, v as string));
      }
      setInviteStatus(map);
    });
    return () => { cancelled = true; };
  }, [lots, ocId, inviteStatus.size]);

  // Explicit re-fetch after an invite is sent/revoked , bypasses the
  // first-mount guard above so the "not invited" pill flips immediately
  // without a full page reload.
  async function refreshInviteStatus() {
    const lotIds = lots.map((l) => l.id);
    if (lotIds.length === 0) return;
    const statusMap = await getLotInvitationStatus(ocId, lotIds);
    const map = new Map<string, string>();
    if (statusMap instanceof Map) {
      statusMap.forEach((v, k) => map.set(k, v));
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      Object.entries(statusMap as any).forEach(([k, v]) => map.set(k, v as string));
    }
    setInviteStatus(map);
  }

  function onLotUpdated(lotId: string, field: string, value: string | number | null) {
    setLots((prev) =>
      prev.map((lot) =>
        lot.id === lotId
          ? { ...lot, [field]: field === "lot_entitlement" || field === "lot_liability" ? Number(value) || 0 : value }
          : lot,
      ),
    );
  }

  const filteredLots = useMemo(() => {
    const needle = searchText.trim().toLowerCase();
    const filtered = lots.filter((lot) => {
      if (balanceFilter === "arrears" && !(lot.balance > 0)) return false;
      if (balanceFilter === "settled" && lot.balance > 0) return false;
      if (portalFilter !== "all" && lot.owner_status !== portalFilter) return false;
      if (occupancyFilter !== "all" && lot.occupancy_status !== occupancyFilter) return false;
      if (!needle) return true;
      const haystacks = [
        String(lot.lot_number),
        lot.unit_number ?? "",
        lot.owner_display_name ?? "",
        lot.owner_contact_email ?? "",
        lot.owner_contact_phone ?? "",
      ];
      return haystacks.some((s) => s.toLowerCase().includes(needle));
    });

    // The register reads in lot order, always. Sorting it five other ways
    // was a dropdown nobody opened.
    const arr = [...filtered];
    arr.sort((a, b) => (a.lot_number ?? 0) - (b.lot_number ?? 0));
    return arr;
  }, [lots, searchText, balanceFilter, portalFilter, occupancyFilter]);

  // The badge counts FILTERS, not the search box , the search box shows its
  // own state and has its own clear button.
  const filterCount =
    (balanceFilter !== "all" ? 1 : 0) +
    (portalFilter !== "all" ? 1 : 0) +
    (occupancyFilter !== "all" ? 1 : 0);
  const activeFilters = filterCount + (searchText.trim() ? 1 : 0);

  function clearFilters() {
    setBalanceFilter("all");
    setPortalFilter("all");
    setOccupancyFilter("all");
  }

  function exportCsv() {
    const blob = new Blob([lotsToCsv(lots)], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);
    const safeOcName = ocName.replace(/[^a-z0-9_-]+/gi, "-").slice(0, 40);
    a.href = url;
    a.download = `lot-register-${safeOcName}-${stamp}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      {!isLotOwner && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[12rem] max-w-md">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="Search lots, owners, email or phone"
                className="h-9 pl-8 pr-8"
              />
              {searchText && (
                <button
                  type="button"
                  onClick={() => setSearchText("")}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:text-foreground"
                  aria-label="Clear search"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* A menu, not a panel. Three facets that are "any" most of the
                time do not deserve three controls parked in the toolbar,
                and they do not deserve a form either , each is a
                one-of-N choice, which is what a radio group in a dropdown
                is for. Submenus keep the top level to three lines you can
                read at a glance, and the current value sits next to each
                so you can see the whole filter state without opening one. */}
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button variant="secondary">
                    <SlidersHorizontal className="mr-2 h-3.5 w-3.5" />
                    Filters
                    {filterCount > 0 && (
                      <span className="ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-medium text-primary-foreground tabular-nums">
                        {filterCount}
                      </span>
                    )}
                    <ChevronDown className="ml-1 h-3.5 w-3.5 opacity-60" />
                  </Button>
                }
              />
              <DropdownMenuContent align="start" className="min-w-[15rem]">
                <FilterSubmenu
                  label="Balance"
                  value={balanceFilter}
                  onChange={setBalanceFilter}
                  options={BALANCE_OPTIONS}
                />
                <FilterSubmenu
                  label="Owner"
                  value={portalFilter}
                  onChange={setPortalFilter}
                  options={PORTAL_OPTIONS}
                />
                <FilterSubmenu
                  label="Occupancy"
                  value={occupancyFilter}
                  onChange={setOccupancyFilter}
                  options={OCCUPANCY_OPTIONS}
                />
                {filterCount > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={clearFilters}>
                      <X className="mr-2 h-3.5 w-3.5" />
                      Clear filters
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button variant="secondary" className="ml-auto">
                    <Wrench className="mr-2 h-3.5 w-3.5" />
                    Tools
                    <ChevronDown className="ml-1 h-3.5 w-3.5" />
                  </Button>
                }
              />
              <DropdownMenuContent align="end" sideOffset={6} className="min-w-[220px]">
                <DropdownMenuItem onClick={() => setSettlementOpen(true)}>
                  <FileSignature className="mr-2 h-4 w-4" />
                  Record settlement
                </DropdownMenuItem>
                <DropdownMenuItem onClick={exportCsv}>
                  <Download className="mr-2 h-4 w-4" />
                  Export lot register
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setBulkInviteOpen(true)}>
                  <MailCheck className="mr-2 h-4 w-4" />
                  Bulk invite owners
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

        </>
      )}

      {activeFilters > 0 && (
        <div className="flex items-center gap-3">
          <p className="text-xs text-muted-foreground">
            Showing {filteredLots.length} of {lots.length} lots
          </p>
          <button
            type="button"
            onClick={clearFilters}
            className="cursor-pointer text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Clear filters
          </button>
        </div>
      )}

      <LotsTab
        lots={filteredLots}
        ocId={ocId}
        onLotUpdated={onLotUpdated}
        isLotOwner={isLotOwner}
        inviteStatusMap={inviteStatus}
        onInviteChanged={refreshInviteStatus}
      />

      {!isLotOwner && (
        <>
          <SettlementDialog
            open={settlementOpen}
            onClose={() => setSettlementOpen(false)}
            ocId={ocId}
            lots={lots.map((l) => ({ id: l.id, lotNumber: Number(l.lot_number), unitNumber: l.unit_number }))}
            onApplied={() => router.refresh()}
          />
          <BulkInviteDialog
            open={bulkInviteOpen}
            onClose={() => { setBulkInviteOpen(false); void refreshInviteStatus(); }}
            ocId={ocId}
            lots={lots}
            inviteStatusMap={inviteStatus}
          />
        </>
      )}
    </div>
  );
}

// One filter dropdown. The trigger always shows a label, so a filter set to
// "any" still reads as a control you can use rather than an empty box.
// One facet: a labelled submenu whose items are a radio group, with the
// chosen value shown on the trigger so the menu reads as a summary of the
// filter state rather than three doors you have to open.
function FilterSubmenu<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (next: T) => void;
  options: Array<{ value: T; label: string }>;
}) {
  const current = options.find((o) => o.value === value);
  const isDefault = value === options[0].value;

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <span>{label}</span>
        <span
          className={cn(
            "ml-auto pl-6 text-xs",
            isDefault ? "text-muted-foreground" : "font-medium text-foreground",
          )}
        >
          {current?.label}
        </span>
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={(v) => onChange((v ?? options[0].value) as T)}
        >
          {options.map((o) => (
            <DropdownMenuRadioItem key={o.value} value={o.value}>
              {o.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
