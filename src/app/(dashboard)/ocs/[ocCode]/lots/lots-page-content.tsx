"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  Download,
  FileSignature,
  Filter,
  MailCheck,
  Search,
  Wrench,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import type { LotWithFinancials } from "@/lib/actions/oc";

type OwnerStatusFilter =
  | "owner_on_file"
  | "pending_invitation"
  | "no_owner";

const FILTER_OPTIONS: Array<{ value: OwnerStatusFilter; label: string }> = [
  { value: "owner_on_file", label: "Owner on file" },
  { value: "pending_invitation", label: "Pending invitation" },
  { value: "no_owner", label: "No owner assigned" },
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
  // Multi-select filter over owner status. Lightweight client-side narrow
  // over the in-memory lots array — /lots is intentionally not paginated,
  // so an Array.filter() is plenty even for a few hundred lots. Empty set
  // = no filter applied.
  const [statusFilter, setStatusFilter] = useState<Set<OwnerStatusFilter>>(
    () => new Set(),
  );
  const [filterDialogOpen, setFilterDialogOpen] = useState(false);
  // Draft state while the dialog is open so users can tick around without
  // immediately filtering the table. Committed to statusFilter on Save.
  const [draftStatusFilter, setDraftStatusFilter] = useState<Set<OwnerStatusFilter>>(
    () => new Set(),
  );
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
    return lots.filter((lot) => {
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
  }, [lots, searchText, statusFilter]);

  const activeFilters =
    statusFilter.size + (searchText.trim() ? 1 : 0);

  function openFilterDialog() {
    setDraftStatusFilter(new Set(statusFilter));
    setFilterDialogOpen(true);
  }
  function saveFilterDialog() {
    setStatusFilter(new Set(draftStatusFilter));
    setFilterDialogOpen(false);
  }
  function toggleDraftFilter(value: OwnerStatusFilter, checked: boolean) {
    setDraftStatusFilter((prev) => {
      const next = new Set(prev);
      if (checked) next.add(value);
      else next.delete(value);
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

  return (
    <div className="space-y-6">
      {!isLotOwner && (
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

          <Button
            variant="secondary"
            size="sm"
            onClick={openFilterDialog}
          >
            <Filter className="mr-2 h-3.5 w-3.5" />
            Filter
            {activeFilters > 0 && (
              <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[color:var(--brand-gold)] px-1 text-[10px] font-semibold text-white">
                {activeFilters}
              </span>
            )}
          </Button>

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

      <Dialog open={filterDialogOpen} onOpenChange={setFilterDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Filter lots</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Owner status
            </p>
            <div className="space-y-2.5">
              {FILTER_OPTIONS.map((opt) => {
                const checked = draftStatusFilter.has(opt.value);
                return (
                  <div key={opt.value} className="flex items-start gap-2">
                    {/* Per CLAUDE.md: <Label> isn't paired to the checkbox
                        via htmlFor — only the checkbox itself toggles. */}
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(v) =>
                        toggleDraftFilter(opt.value, v === true)
                      }
                      className="mt-0.5 bg-card"
                    />
                    <span className="text-sm text-foreground">{opt.label}</span>
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              Lots that match ANY of the ticked statuses will be shown.
              Leave everything unticked to see all lots.
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setDraftStatusFilter(new Set());
              }}
            >
              Clear
            </Button>
            <Button size="sm" onClick={saveFilterDialog}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
