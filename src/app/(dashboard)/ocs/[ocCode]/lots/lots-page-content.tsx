"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Download, FileSignature, MailCheck, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LotsTab } from "../manage/lots-tab";
import { SettlementDialog } from "./[lotId]/settlement-dialog";
import { BulkInviteDialog } from "./bulk-invite-dialog";
import type { LotWithFinancials } from "@/lib/actions/oc";

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

  function onLotUpdated(lotId: string, field: string, value: string | number | null) {
    setLots((prev) =>
      prev.map((lot) =>
        lot.id === lotId
          ? { ...lot, [field]: field === "lot_entitlement" || field === "lot_liability" ? Number(value) || 0 : value }
          : lot,
      ),
    );
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
        <div className="flex justify-end items-center gap-2">
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
      <LotsTab
        lots={lots}
        ocId={ocId}
        onLotUpdated={onLotUpdated}
        isLotOwner={isLotOwner}
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
          />
        </>
      )}
    </div>
  );
}
