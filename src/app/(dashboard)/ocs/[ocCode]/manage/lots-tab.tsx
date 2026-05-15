"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { updateLotField } from "./actions";
import { getLotInvitationStatus } from "./invitation-actions";
import type { LotWithFinancials } from "@/lib/actions/oc";
import { useOCCode } from "@/lib/oc-context";

interface LotsTabProps {
  lots: LotWithFinancials[];
  ocId: string;
  onLotUpdated: (lotId: string, field: string, value: string | number | null) => void;
  /** Optional: legacy /manage page can pass this to make cells editable. The
   *  user-facing /lots page passes nothing — edits happen on the lot detail
   *  page now. */
  isEditing?: boolean;
  isLotOwner?: boolean;
  /** Legacy: /manage previously rendered "Total units of entitlement" here.
   *  Kept as an optional prop so the page still compiles; the value isn't
   *  rendered any more per the no-totals spec. */
  totalEntitlement?: number;
}

function EditableCell({
  value,
  lotId,
  field,
  ocId,
  isEditing,
  type = "text",
  onSaved,
}: {
  value: string | number | null;
  lotId: string;
  field: string;
  ocId: string;
  isEditing: boolean;
  type?: "text" | "number";
  onSaved: (value: string | number | null) => void;
}) {
  const [editValue, setEditValue] = useState(String(value ?? ""));
  const [saving, setSaving] = useState(false);

  const save = useCallback(async () => {
    const newValue = type === "number" ? (editValue ? Number(editValue) : null) : (editValue || null);
    const originalValue = type === "number" ? (value ?? null) : (value ?? null);
    if (newValue === originalValue || String(newValue) === String(originalValue)) return;

    setSaving(true);
    const result = await updateLotField(ocId, lotId, field, newValue);
    setSaving(false);
    if (result.error) {
      toast.error(result.error);
      setEditValue(String(value ?? ""));
    } else {
      onSaved(newValue);
    }
  }, [editValue, value, lotId, field, ocId, type, onSaved]);

  if (!isEditing) {
    // Empty cells stay empty (CLAUDE.md). The visual silence is the
    // indicator — no em-dash, no "Not set", no "N/A".
    if (type === "number" && value !== null && value !== undefined && Number(value) > 0) {
      return <span className="tabular-nums">{value}</span>;
    }
    if (value) return <span>{value}</span>;
    return null;
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

export function LotsTab({ lots, ocId, isEditing = false, onLotUpdated, isLotOwner, totalEntitlement }: LotsTabProps) {
  // Consume the prop so the unused-prop lint doesn't fire on /manage — the
  // value isn't rendered any more per the no-totals spec.
  void totalEntitlement;
  const ocCode = useOCCode();
  const router = useRouter();
  const [inviteStatus, setInviteStatus] = useState<Map<string, string>>(new Map());

  // Fetch invitation status for all lots
  useEffect(() => {
    const lotIds = lots.map((l) => l.id);
    if (lotIds.length === 0) return;
    getLotInvitationStatus(ocId, lotIds).then((statusMap) => {
      const map = new Map<string, string>();
      if (statusMap instanceof Map) {
        statusMap.forEach((v, k) => map.set(k, v));
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Object.entries(statusMap as any).forEach(([k, v]) => map.set(k, v as string));
      }
      setInviteStatus(map);
    });
  }, [lots, ocId]);

  // Sorted ascending by lot_number for now. Per-column filters / sorts will
  // come in a follow-up — the header is plain text without an arrow.
  const sortedLots = [...lots].sort((a, b) => a.lot_number - b.lot_number);

  const formatCurrency = (n: number) =>
    new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(Math.abs(n));

  function getInviteStatusBadge(lotId: string) {
    const status = inviteStatus.get(lotId);
    if (status === "accepted") return <Badge variant="success">Accepted</Badge>;
    if (status === "pending") return <Badge variant="warning">Pending</Badge>;
    if (status === "noted") return <Badge variant="info">Owner noted</Badge>;
    return <Badge variant="neutral">Not invited</Badge>;
  }

  return (
    <div className="space-y-3">
      {/* Table text bumped to text-base for readability — strata managers
          scan this several times a day. Headers stay at text-sm font-medium
          (normal case) so they're distinct without yelling. */}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-base">
          <thead>
            <tr className="bg-muted/40 text-sm font-medium text-muted-foreground border-b border-border">
              <th className="px-4 py-3 text-left w-24">Lot number</th>
              <th className="px-4 py-3 text-left w-24">Unit number</th>
              <th className="px-4 py-3 text-left">Name</th>
              {!isLotOwner && <th className="px-4 py-3 text-left">Email</th>}
              <th className="px-4 py-3 text-left w-44">Units of entitlement</th>
              {!isLotOwner && <th className="px-4 py-3 text-left w-40">Invite status</th>}
              {!isLotOwner && <th className="px-4 py-3 text-right w-32">Balance</th>}
            </tr>
          </thead>
          {/* Alternating row colours + a slightly brighter hover. The hover
              selector lives inside the same tbody descendant block so it
              beats nth-child specificity. */}
          <tbody className="[&_tr:nth-child(odd)]:bg-card [&_tr:nth-child(even)]:bg-muted/30 [&_tr:hover]:bg-muted/60">
            {sortedLots.map((lot) => {
              const ownerLabel =
                lot.owner_display_name ??
                (lot.owner_status === "pending_invitation" ? "Pending invitation" : null);

              return (
                <tr
                  key={lot.id}
                  onClick={!isEditing && !isLotOwner ? () => router.push(`/ocs/${ocCode}/lots/${lot.id}`) : undefined}
                  className={`h-14 transition-colors ${
                    !isEditing && !isLotOwner ? "cursor-pointer" : ""
                  }`}
                >
                  <td className="px-4 font-medium text-foreground tabular-nums">{lot.lot_number}</td>
                  <td className="px-4 text-muted-foreground tabular-nums">{lot.unit_number ?? ""}</td>
                  <td className="px-4">
                    {ownerLabel ? (
                      <span className={`font-medium ${lot.owner_status === "member" ? "text-foreground" : "text-muted-foreground"}`}>
                        {ownerLabel}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Unassigned</span>
                    )}
                  </td>
                  {!isLotOwner && (
                    <td className="px-4 text-muted-foreground">
                      {lot.owner_contact_email ?? ""}
                    </td>
                  )}
                  <td className="px-4">
                    <EditableCell
                      value={lot.lot_entitlement > 0 ? lot.lot_entitlement : null}
                      lotId={lot.id}
                      field="lot_entitlement"
                      ocId={ocId}
                      isEditing={isEditing}
                      type="number"
                      onSaved={(v) => onLotUpdated(lot.id, "lot_entitlement", v)}
                    />
                  </td>
                  {!isLotOwner && <td className="px-4">{getInviteStatusBadge(lot.id)}</td>}
                  {!isLotOwner && (
                    <td className="px-4 text-right tabular-nums">
                      {lot.balance === 0 ? (
                        <span className="text-[hsl(160,100%,37%)]">{formatCurrency(0)}</span>
                      ) : lot.balance > 0 ? (
                        <span className="text-destructive">{formatCurrency(lot.balance)}</span>
                      ) : (
                        <span className="text-[hsl(160,100%,37%)]">{formatCurrency(lot.balance)}</span>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
            {sortedLots.length === 0 && (
              <tr>
                <td colSpan={isLotOwner ? 4 : 7} className="px-4 py-12 text-center text-base text-muted-foreground">
                  No lots found. Create lots from the oc setup wizard.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
