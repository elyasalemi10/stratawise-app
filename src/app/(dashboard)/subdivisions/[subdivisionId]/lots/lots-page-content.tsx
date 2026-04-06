"use client";

import { useState } from "react";
import { Pencil, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { LotsTab } from "../manage/lots-tab";
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
  const [lots, setLots] = useState(initialLots);
  const [isEditing, setIsEditing] = useState(false);
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
      <PageHeader
        title={isLotOwner ? "Lot owners" : "Lots & owners"}
        subtitle={subdivisionName}
        actions={
          !isLotOwner ? (
            isEditing ? (
              <Button variant="secondary" size="sm" onClick={() => setIsEditing(false)}>
                <Check className="mr-2 h-3.5 w-3.5" />
                Done
              </Button>
            ) : (
              <Button variant="secondary" size="sm" onClick={() => setIsEditing(true)}>
                <Pencil className="mr-2 h-3.5 w-3.5" />
                Edit
              </Button>
            )
          ) : undefined
        }
      />
      <LotsTab
        lots={lots}
        subdivisionId={subdivisionId}
        isEditing={isEditing}
        onLotUpdated={onLotUpdated}
        totalEntitlement={totalEntitlement}
        isLotOwner={isLotOwner}
      />
    </div>
  );
}
