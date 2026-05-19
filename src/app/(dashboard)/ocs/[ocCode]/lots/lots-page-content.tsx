"use client";

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

type OwnerStatusFilter =
  | "owner_on_file"
  | "pending_invitation"
  | "no_owner";

const FILTER_CHIPS: Array<{ value: OwnerStatusFilter; label: string }> = [
  { value: "owner_on_file", label: "Owner on file" },
  { value: "pending_invitation", label: "Pending invite" },
  { value: "no_owner", label: "No owner" },
];

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
}: {
  lots: LotWithFinancials[];
  ocId: string;
  ocName: string;
  isLotOwner?: boolean;
}) {
  const router = useRouter();
  const [lots, setLots] = useState(initialLots);
  const [settlementOpen, setSettlementOpen] = useState(false);
  const [bulkInviteOpen, setBulkInviteOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  // Filter chips toggle owner-status visibility. Empty set = no filter
  // (every lot shown). Multi-select: matching ANY active chip keeps the
  // lot in the list.
  const [statusFilter, setStatusFilter] = useState<Set<OwnerStatusFilter>>(
    () => new Set(),
  );
  const [sortKey, setSortKey] = useState<SortKey>("lot_asc");
  // Single source of truth for invite-status — fetched once here and
  // handed down to both LotsTab (for the per-row pill) and BulkInviteDialog
  // (for eligibility counts). Previously each component re-fetched the
  // same data when it mounted; one round-trip is plenty.
  const [inviteStatus, setInviteStatus] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    const lotIds = lots.map((l) => l.id);
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
  }, [lots, ocId]);

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
      if (statusFilter.size > 0) {
        const matchesAny = Array.from(statusFilter).some((f) => {
          if (f === "owner_on_file") return lot.owner_status === "member";
          if (f === "no_owner") return !lot.owner_display_name;
          if (f === "pending_invitation")
            return lot.owner_status === "pending_invitation";
          return false;
        });
        if (!matchesAny) return false;
      }
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
  }, [lots, searchText, statusFilter, sortKey]);

  const activeFilters =
    statusFilter.size + (searchText.trim() ? 1 : 0);

  function toggleStatusFilter(value: OwnerStatusFilter) {
    setStatusFilter((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
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

          {/* Filter chips — clicking a chip toggles its inclusion. Multi-
              select OR semantics: matching ANY active chip keeps the lot. */}
          <div className="flex flex-wrap items-center gap-1.5">
            {FILTER_CHIPS.map((chip) => {
              const active = statusFilter.has(chip.value);
              return (
                <button
                  key={chip.value}
                  type="button"
                  onClick={() => toggleStatusFilter(chip.value)}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer",
                    active
                      ? "border-[color:var(--brand-gold)] bg-[color:var(--brand-gold)]/10 text-foreground"
                      : "border-border bg-card text-muted-foreground hover:text-foreground",
                  )}
                >
                  {active && <Check className="size-3" />}
                  {chip.label}
                </button>
              );
            })}
            {statusFilter.size > 0 && (
              <button
                type="button"
                onClick={() => setStatusFilter(new Set())}
                className="text-xs text-muted-foreground hover:text-foreground underline-offset-4 hover:underline ml-1 cursor-pointer"
              >
                Clear filters
              </button>
            )}
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
      />

      {!isLotOwner && (
        <>
          <SettlementDialog
            open={settlementOpen}
            onClose={() => setSettlementOpen(false)}
            ocId={ocId}
            onApplied={() => router.refresh()}
          />
          <BulkInviteDialog
            open={bulkInviteOpen}
            onClose={() => { setBulkInviteOpen(false); router.refresh(); }}
            ocId={ocId}
            lots={lots}
            inviteStatusMap={inviteStatus}
          />
        </>
      )}
    </div>
  );
}
