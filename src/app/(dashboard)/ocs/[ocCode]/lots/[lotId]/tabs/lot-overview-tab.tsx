"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EditSheet } from "@/components/shared/edit-sheet";
import { Hash } from "lucide-react";

// Overview: what is true of the LOT.
//
// It used to carry four cards, and three of them were saying something the
// page had already said. "Snapshot" listed the owner's name, which is in the
// page heading; the date they took the lot, which is on the Owner tab under
// their name; and when they last opened the portal, which now sits there
// too, beside the same date. "Next levy due" was a whole card for one date,
// next to a header strip that already carried the balance, so it moved into
// the strip with it. "Recent activity" showed the newest five rows of the
// audit log above a History tab that showed all of them, paginated, with
// better labels , two surfaces reading one table, and the good one was the
// one behind an extra click.
//
// The history moved on again, to Communications. Everything on that tab is
// already a record of what happened to this lot and who was told; the audit
// log is the same story with the manager's own edits in it, and reading them
// as two lists a tab apart meant reconstructing the order by timestamp.

interface LotDetailsInput {
  id: string;
  lot_number: number;
  unit_number: string | null;
  lot_entitlement: number | null;
  lot_liability: number | null;
}

interface Props {
  lotDetails: LotDetailsInput;
  onLotDetailsSaved: () => void;
}

export function LotOverviewTab({ lotDetails, onLotDetailsSaved }: Props) {
  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-5">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex items-center gap-2">
              <Hash className="h-4 w-4 text-[color:var(--brand-gold)]" />
              <h3 className="text-sm font-semibold text-foreground">Lot details</h3>
            </div>
            <LotDetailsEditSheet lot={lotDetails} onSaved={onLotDetailsSaved} />
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
            <DetailField label="Lot number" value={String(lotDetails.lot_number)} mono />
            <DetailField label="Unit number" value={lotDetails.unit_number || ""} mono />
            <DetailField
              label="Entitlement"
              value={
                lotDetails.lot_entitlement !== null
                  ? String(lotDetails.lot_entitlement)
                  : ""
              }
            />
            <DetailField
              label="Liability"
              value={
                lotDetails.lot_liability !== null
                  ? String(lotDetails.lot_liability)
                  : ""
              }
            />
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}

function DetailField({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs tracking-normal text-muted-foreground">
        {label}
      </dt>
      <dd
        className={`mt-0.5 text-sm font-semibold text-foreground tabular-nums ${
          mono ? "font-mono" : ""
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

// Single edit drawer for unit number / entitlement / liability. Lot number
// itself stays locked because it's referenced by every levy notice issued
// for the lot.
function LotDetailsEditSheet({
  lot,
  onSaved,
}: {
  lot: LotDetailsInput;
  onSaved: () => void;
}) {
  const [unit, setUnit] = useState(lot.unit_number ?? "");
  const [entitlement, setEntitlement] = useState(
    lot.lot_entitlement !== null ? String(lot.lot_entitlement) : "",
  );
  const [liability, setLiability] = useState(
    lot.lot_liability !== null ? String(lot.lot_liability) : "",
  );

  return (
    <EditSheet
      label="Lot details"
      description="Unit number, entitlement, and liability. Lot number itself stays locked."
      triggerLabel="Edit"
      triggerVariant="secondary"
      requireConfirmation
      confirmationMessage="These values drive levy calculations and voting rights. Save anyway?"
      onOpenChange={(open) => {
        if (open) {
          setUnit(lot.unit_number ?? "");
          setEntitlement(lot.lot_entitlement !== null ? String(lot.lot_entitlement) : "");
          setLiability(lot.lot_liability !== null ? String(lot.lot_liability) : "");
        }
      }}
      onSave={async () => {
        const entitlementNum = entitlement.trim() ? parseFloat(entitlement) : null;
        const liabilityNum = liability.trim() ? parseFloat(liability) : null;
        if (entitlementNum !== null && !Number.isFinite(entitlementNum)) {
          return { ok: false as const, error: "Entitlement must be a number." };
        }
        if (liabilityNum !== null && !Number.isFinite(liabilityNum)) {
          return { ok: false as const, error: "Liability must be a number." };
        }
        const { updateLotDetails } = await import("@/lib/actions/lot-edit");
        const res = await updateLotDetails({
          lot_id: lot.id,
          unit_number: unit.trim() || null,
          lot_entitlement: entitlementNum,
          lot_liability: liabilityNum,
        });
        if (res.ok) onSaved();
        return res.ok ? { ok: true as const } : { ok: false as const, error: res.error };
      }}
    >
      <div className="space-y-1.5">
        <Label>Unit number</Label>
        <Input
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
          placeholder="Unit number"
        />
      </div>
      <div className="space-y-1.5">
        <Label>Lot entitlement</Label>
        <Input
          value={entitlement}
          onChange={(e) => setEntitlement(e.target.value)}
          placeholder="Lot entitlement"
          inputMode="decimal"
        />
      </div>
      <div className="space-y-1.5">
        <Label>Lot liability</Label>
        <Input
          value={liability}
          onChange={(e) => setLiability(e.target.value)}
          placeholder="Lot liability"
          inputMode="decimal"
        />
      </div>
    </EditSheet>
  );
}
