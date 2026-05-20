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
  ArrowUpDown,
  Check,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LotsTab } from "../manage/lots-tab";
import { getLotInvitationStatus } from "../manage/invitation-actions";
import { SettlementDialog } from "./[lotId]/settlement-dialog";
import { BulkInviteDialog } from "./bulk-invite-dialog";
import { cn } from "@/lib/utils";
import type { LotWithFinancials } from "@/lib/actions/oc";

type SortKey =
  | "lot_asc"
  | "lot_desc"
  | "balance_desc"
  | "balance_asc"
  | "owner_asc";

const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: "lot_asc", label: "Lot number (low → high)" },
  { value: "lot_desc", label: "Lot number (high → low)" },
  { value: "balance_desc", label: "Highest balance first" },
  { value: "balance_asc", label: "Lowest balance first" },
  { value: "owner_asc", label: "Owner name (A → Z)" },
];

// Client-side CSV export — pulls straight from the in-memory lots prop so
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
  const [sortKey, setSortKey] = useState<SortKey>("lot_asc");
  // Single source of truth for invite-status. Seeded from the
  // server-rendered prop so the lots tab paints with the right pills on
  // first frame — no spinner-then-pop. Re-fetched only after a
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

  // Explicit re-fetch after an invite is sent/revoked — bypasses the
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

    // Sort step. Comparators are pure / pre-allocated; sort returns a
    // new array via spread so the original lots state stays untouched
    // (LotsTab cares about reference equality for memoised children).
    const arr = [...filtered];
    arr.sort((a, b) => {
      switch (sortKey) {
        case "lot_asc":
          return (a.lot_number ?? 0) - (b.lot_number ?? 0);
        case "lot_desc":
          return (b.lot_number ?? 0) - (a.lot_number ?? 0);
        case "balance_desc":
          return (b.balance ?? 0) - (a.balance ?? 0);
        case "balance_asc":
          return (a.balance ?? 0) - (b.balance ?? 0);
        case "owner_asc":
          return (a.owner_display_name ?? "~").localeCompare(b.owner_display_name ?? "~");
        default:
          return 0;
      }
    });
    return arr;
  }, [lots, searchText, sortKey]);

  const activeFilters = searchText.trim() ? 1 : 0;

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

  const sortLabel =
    SORT_OPTIONS.find((s) => s.value === sortKey)?.label ?? "Sort";

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

            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button variant="secondary" size="sm">
                    <ArrowUpDown className="mr-2 h-3.5 w-3.5" />
                    Sort: {sortLabel}
                    <ChevronDown className="ml-1 h-3.5 w-3.5 opacity-60" />
                  </Button>
                }
              />
              <DropdownMenuContent align="end" sideOffset={6} className="min-w-[220px]">
                {SORT_OPTIONS.map((opt) => (
                  <DropdownMenuItem
                    key={opt.value}
                    onClick={() => setSortKey(opt.value)}
                    className="justify-between"
                  >
                    {opt.label}
                    {opt.value === sortKey && <Check className="ml-2 h-3.5 w-3.5" />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button variant="secondary" size="sm">
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
        <p className="text-xs text-muted-foreground">
          Showing {filteredLots.length} of {lots.length} lots
        </p>
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
            lots={lots.map((l) => ({ id: l.id, lotNumber: Number(l.lot_number) }))}
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
