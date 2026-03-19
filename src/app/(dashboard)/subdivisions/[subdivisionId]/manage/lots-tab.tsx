"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { updateLotField } from "./actions";
import type { LotWithFinancials } from "@/lib/actions/subdivision";

interface LotsTabProps {
  lots: LotWithFinancials[];
  subdivisionId: string;
  isEditing: boolean;
  onLotUpdated: (lotId: string, field: string, value: string | number | null) => void;
  totalEntitlement: number;
}

function EditableCell({
  value,
  lotId,
  field,
  subdivisionId,
  isEditing,
  type = "text",
  placeholder = "—",
  onSaved,
}: {
  value: string | number | null;
  lotId: string;
  field: string;
  subdivisionId: string;
  isEditing: boolean;
  type?: "text" | "number";
  placeholder?: string;
  onSaved: (value: string | number | null) => void;
}) {
  const [editValue, setEditValue] = useState(String(value ?? ""));
  const [saving, setSaving] = useState(false);

  const save = useCallback(async () => {
    const newValue = type === "number" ? (editValue ? Number(editValue) : null) : (editValue || null);
    const originalValue = type === "number" ? (value ?? null) : (value ?? null);

    if (newValue === originalValue || String(newValue) === String(originalValue)) return;

    setSaving(true);
    const result = await updateLotField(subdivisionId, lotId, field, newValue);
    setSaving(false);
    if (result.error) {
      toast.error(result.error);
      setEditValue(String(value ?? ""));
    } else {
      onSaved(newValue);
    }
  }, [editValue, value, lotId, field, subdivisionId, type, onSaved]);

  if (!isEditing) {
    if (type === "number" && value !== null && value !== undefined && Number(value) > 0) {
      return <span className="tabular-nums">{value}</span>;
    }
    if (value) return <span>{value}</span>;
    return <span className="text-muted-foreground">{placeholder}</span>;
  }

  return (
    <Input
      value={editValue}
      onChange={(e) => setEditValue(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          save();
          (e.target as HTMLInputElement).blur();
        }
      }}
      disabled={saving}
      className="h-7 text-xs"
      inputMode={type === "number" ? "numeric" : undefined}
    />
  );
}

export function LotsTab({ lots, subdivisionId, isEditing, onLotUpdated, totalEntitlement }: LotsTabProps) {
  const router = useRouter();
  const [sortAsc, setSortAsc] = useState(true);

  const sortedLots = [...lots].sort((a, b) =>
    sortAsc ? a.lot_number - b.lot_number : b.lot_number - a.lot_number
  );

  const formatCurrency = (n: number) =>
    new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(Math.abs(n));

  return (
    <div className="space-y-3">
      {/* Total entitlement display */}
      <div className="flex items-center justify-end">
        <div className="text-sm text-muted-foreground">
          Total units of entitlement:{" "}
          <span className="font-semibold text-foreground tabular-nums">
            {totalEntitlement > 0 ? totalEntitlement : "—"}
          </span>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-2.5 text-left">Owner name</th>
              <th className="px-4 py-2.5 text-left">Email</th>
              <th className="px-4 py-2.5 text-left">Units of entitlement</th>
              <th className="px-4 py-2.5 text-left">Unit number</th>
              <th
                className="px-4 py-2.5 text-left cursor-pointer hover:text-foreground select-none"
                onClick={() => setSortAsc((v) => !v)}
              >
                Lot # {sortAsc ? "↑" : "↓"}
              </th>
              <th className="px-4 py-2.5 text-left">Owner occupied</th>
              <th className="px-4 py-2.5 text-right">Balance</th>
            </tr>
          </thead>
          <tbody>
            {sortedLots.map((lot) => (
              <tr
                key={lot.id}
                onClick={!isEditing ? () => router.push(`/subdivisions/${subdivisionId}/lots/${lot.id}`) : undefined}
                className={`border-t border-border/50 h-12 transition-colors ${!isEditing ? "cursor-pointer hover:bg-muted/30" : ""}`}
              >
                <td className="px-4">
                  {isEditing ? (
                    <EditableCell
                      value={lot.owner_name}
                      lotId={lot.id}
                      field="owner_name"
                      subdivisionId={subdivisionId}
                      isEditing={true}
                      placeholder="Unassigned"
                      onSaved={(v) => onLotUpdated(lot.id, "owner_name", v)}
                    />
                  ) : lot.owner_name ? (
                    <span className="font-medium text-foreground">{lot.owner_name}</span>
                  ) : (
                    <span className="text-muted-foreground">Unassigned</span>
                  )}
                </td>
                <td className="px-4">
                  <EditableCell
                    value={lot.owner_email}
                    lotId={lot.id}
                    field="owner_email"
                    subdivisionId={subdivisionId}
                    isEditing={isEditing}
                    placeholder="—"
                    onSaved={(v) => onLotUpdated(lot.id, "owner_email", v)}
                  />
                </td>
                <td className="px-4">
                  <EditableCell
                    value={lot.lot_entitlement > 0 ? lot.lot_entitlement : null}
                    lotId={lot.id}
                    field="lot_entitlement"
                    subdivisionId={subdivisionId}
                    isEditing={isEditing}
                    type="number"
                    placeholder="Not set"
                    onSaved={(v) => onLotUpdated(lot.id, "lot_entitlement", v)}
                  />
                </td>
                <td className="px-4">
                  <EditableCell
                    value={lot.unit_number}
                    lotId={lot.id}
                    field="unit_number"
                    subdivisionId={subdivisionId}
                    isEditing={isEditing}
                    placeholder="—"
                    onSaved={(v) => onLotUpdated(lot.id, "unit_number", v)}
                  />
                </td>
                <td className="px-4 font-medium text-foreground">
                  {lot.lot_number}
                </td>
                <td className="px-4">
                  {isEditing ? (
                    <button
                      type="button"
                      onClick={async () => {
                        const newVal = !lot.owner_occupied;
                        const result = await updateLotField(subdivisionId, lot.id, "owner_occupied", newVal);
                        if (!result.error) {
                          onLotUpdated(lot.id, "owner_occupied", newVal as unknown as string | number | null);
                        }
                      }}
                      className="cursor-pointer"
                    >
                      <Badge variant={lot.owner_occupied ? "success" : "neutral"}>
                        {lot.owner_occupied ? "Yes" : "No"}
                      </Badge>
                    </button>
                  ) : (
                    <Badge variant={lot.owner_occupied ? "success" : "neutral"}>
                      {lot.owner_occupied ? "Yes" : "No"}
                    </Badge>
                  )}
                </td>
                <td className="px-4 text-right tabular-nums">
                  {lot.balance === 0 ? (
                    <span className="text-[hsl(160,100%,37%)]">{formatCurrency(0)}</span>
                  ) : lot.balance > 0 ? (
                    <span className="text-destructive">{formatCurrency(lot.balance)}</span>
                  ) : (
                    <span className="text-[hsl(160,100%,37%)]">{formatCurrency(lot.balance)}</span>
                  )}
                </td>
              </tr>
            ))}
            {sortedLots.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-sm text-muted-foreground">
                  No lots found. Create lots from the subdivision setup wizard.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
