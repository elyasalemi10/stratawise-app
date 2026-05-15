"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileSignature } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LotsTab } from "../manage/lots-tab";
import { SettlementDialog } from "./[lotId]/settlement-dialog";
import type { LotWithFinancials } from "@/lib/actions/oc";

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
  void ocName;
  const router = useRouter();
  const [lots, setLots] = useState(initialLots);
  const [settlementOpen, setSettlementOpen] = useState(false);

  // Edit-on-list is gone. Per-lot edits live on /ocs/[code]/lots/[lotId].
  // We still expose `onLotUpdated` so any in-row mutation (settlement etc.)
  // can refresh local state without a full router refresh.
  function onLotUpdated(lotId: string, field: string, value: string | number | null) {
    setLots((prev) =>
      prev.map((lot) =>
        lot.id === lotId
          ? { ...lot, [field]: field === "lot_entitlement" || field === "lot_liability" ? Number(value) || 0 : value }
          : lot,
      ),
    );
  }

  return (
    <div className="space-y-6">
      {!isLotOwner && (
        <div className="flex justify-end items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => setSettlementOpen(true)}>
            <FileSignature className="mr-2 h-3.5 w-3.5" />
            Record settlement
          </Button>
        </div>
      )}
      <LotsTab
        lots={lots}
        ocId={ocId}
        onLotUpdated={onLotUpdated}
        isLotOwner={isLotOwner}
      />

      {!isLotOwner && (
        <SettlementDialog
          open={settlementOpen}
          onClose={() => setSettlementOpen(false)}
          ocId={ocId}
          onApplied={() => router.refresh()}
        />
      )}
    </div>
  );
}
