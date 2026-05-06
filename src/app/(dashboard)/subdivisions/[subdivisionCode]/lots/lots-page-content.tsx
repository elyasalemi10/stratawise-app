"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Check, FileSignature } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LotsTab } from "../manage/lots-tab";
import { SettlementDialog } from "./[lotId]/settlement-dialog";
import type { LotWithFinancials } from "@/lib/actions/subdivision";

export function LotsPageContent({
  lots: initialLots,
  subdivisionId,
  subdivisionName,
  isLotOwner,
}: {
  lots: LotWithFinancials[];
  subdivisionId: string;
  subdivisionName: string;
  isLotOwner?: boolean;
}) {
  void subdivisionName;
  const router = useRouter();
  const [lots, setLots] = useState(initialLots);
  const [isEditing, setIsEditing] = useState(false);
  const [settlementOpen, setSettlementOpen] = useState(false);
  const totalEntitlement = lots.reduce((sum, lot) => sum + lot.lot_entitlement, 0);

  function onLotUpdated(lotId: string, field: string, value: string | number | null) {
    setLots((prev) =>
      prev.map((lot) =>
        lot.id === lotId
          ? { ...lot, [field]: field === "lot_entitlement" || field === "lot_liability" ? Number(value) || 0 : value }
          : lot
      )
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-foreground">{isLotOwner ? "Lot owners" : "Lots & owners"}</h1>
        {!isLotOwner && (
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => setSettlementOpen(true)}>
              <FileSignature className="mr-2 h-3.5 w-3.5" />
              Record settlement
            </Button>
            {isEditing ? (
              <Button variant="secondary" size="sm" onClick={() => setIsEditing(false)}>
                <Check className="mr-2 h-3.5 w-3.5" />
                Done
              </Button>
            ) : (
              <Button variant="secondary" size="sm" onClick={() => setIsEditing(true)}>
                <Pencil className="mr-2 h-3.5 w-3.5" />
                Edit
              </Button>
            )}
          </div>
        )}
      </div>
      <LotsTab
        lots={lots}
        subdivisionId={subdivisionId}
        isEditing={isEditing}
        onLotUpdated={onLotUpdated}
        totalEntitlement={totalEntitlement}
        isLotOwner={isLotOwner}
      />

      {!isLotOwner && (
        <SettlementDialog
          open={settlementOpen}
          onClose={() => setSettlementOpen(false)}
          subdivisionId={subdivisionId}
          onApplied={() => router.refresh()}
        />
      )}
    </div>
  );
}
