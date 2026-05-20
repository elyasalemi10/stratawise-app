"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { updateLotField } from "./actions";
import { getLotInvitationStatus } from "./invitation-actions";
import { InviteStatusPopover } from "../lots/invite-status-popover";
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
  /** Pre-loaded invite-status map from the parent. /lots passes this so we
   *  don't refetch the same data here AND in the bulk-invite dialog. When
   *  omitted (legacy /manage path), the component fetches itself. */
  inviteStatusMap?: Map<string, string>;
  /** Called after an invite is sent so the parent refreshes the pill map. */
  onInviteChanged?: () => void;
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

export function LotsTab({ lots, ocId, isEditing = false, onLotUpdated, isLotOwner, totalEntitlement, inviteStatusMap, onInviteChanged }: LotsTabProps) {
  // Consume the prop so the unused-prop lint doesn't fire on /manage — the
  // value isn't rendered any more per the no-totals spec.
  void totalEntitlement;
  const ocCode = useOCCode();
  const router = useRouter();
  const [inviteStatus, setInviteStatus] = useState<Map<string, string>>(() => inviteStatusMap ?? new Map());

  // Fetch invitation status for all lots — only when the parent didn't
  // pre-load it. /lots passes inviteStatusMap so this fetch is skipped;
  // /manage still drives it itself.
  useEffect(() => {
    if (inviteStatusMap) {
      setInviteStatus(inviteStatusMap);
      return;
    }
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
  }, [lots, ocId, inviteStatusMap]);

  // Sorted ascending by lot_number for now. Per-column filters / sorts will
  // come in a follow-up — the header is plain text without an arrow.
  const sortedLots = [...lots].sort((a, b) => a.lot_number - b.lot_number);

  const formatCurrency = (n: number) =>
    new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(Math.abs(n));

  function getInviteStatusForLot(lotId: string): "not_invited" | "noted" | "pending" | "accepted" {
    const status = inviteStatus.get(lotId);
    if (status === "accepted") return "accepted";
    if (status === "pending") return "pending";
    if (status === "noted") return "noted";
    return "not_invited";
  }

  return (
    <div className="space-y-3">
      {/* Uses the design-system <Table variant="striped"> primitive — odd
          rows white, even rows --muted, hover --secondary-hover. The
          stripe colour is now a proper token instead of an arbitrary
          hsl(). Column widths held with table-fixed + a <colgroup> so
          Lot / Unit / Invite status never wrap onto two lines; long Name
          / Email truncate with a title-attr fallback. */}
      <div className="rounded-lg border border-border overflow-hidden">
        <Table variant="striped" className="table-fixed">
          <colgroup>
            <col className="w-28" />
            <col className="w-28" />
            <col />
            {!isLotOwner && <col className="w-[22%]" />}
            <col className="w-40" />
            {!isLotOwner && <col className="w-40" />}
            {!isLotOwner && <col className="w-32" />}
          </colgroup>
          <TableHeader>
            <TableRow>
              <TableHead>Lot number</TableHead>
              <TableHead>Unit number</TableHead>
              <TableHead>Name</TableHead>
              {!isLotOwner && <TableHead>Email</TableHead>}
              <TableHead>Units of entitlement</TableHead>
              {!isLotOwner && <TableHead>Invite status</TableHead>}
              {!isLotOwner && <TableHead className="text-right">Balance</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedLots.map((lot) => {
              const ownerLabel =
                lot.owner_display_name ??
                (lot.owner_status === "pending_invitation" ? "Pending invitation" : null);

              return (
                <TableRow
                  key={lot.id}
                  onClick={!isEditing && !isLotOwner ? () => router.push(`/ocs/${ocCode}/lots/${lot.id}`) : undefined}
                  className={!isEditing && !isLotOwner ? "cursor-pointer" : ""}
                >
                  <TableCell className="font-medium text-foreground tabular-nums whitespace-nowrap">{lot.lot_number}</TableCell>
                  <TableCell className="text-muted-foreground tabular-nums whitespace-nowrap">{lot.unit_number ?? ""}</TableCell>
                  <TableCell className="truncate">
                    {ownerLabel ? (
                      <span className={`font-medium ${lot.owner_status === "member" ? "text-foreground" : "text-muted-foreground"}`} title={ownerLabel}>
                        {ownerLabel}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Unassigned</span>
                    )}
                  </TableCell>
                  {!isLotOwner && (
                    <TableCell className="text-muted-foreground truncate" title={lot.owner_contact_email ?? ""}>
                      {lot.owner_contact_email ?? ""}
                    </TableCell>
                  )}
                  <TableCell>
                    <EditableCell
                      value={lot.lot_entitlement > 0 ? lot.lot_entitlement : null}
                      lotId={lot.id}
                      field="lot_entitlement"
                      ocId={ocId}
                      isEditing={isEditing}
                      type="number"
                      onSaved={(v) => onLotUpdated(lot.id, "lot_entitlement", v)}
                    />
                  </TableCell>
                  {!isLotOwner && (
                    <TableCell
                      className="whitespace-nowrap"
                      // stopPropagation so clicking the pill doesn't also
                      // trigger the row's navigate-to-lot-detail handler.
                      onClick={(e) => e.stopPropagation()}
                    >
                      <InviteStatusPopover
                        ocId={ocId}
                        lotId={lot.id}
                        lotNumber={lot.lot_number}
                        status={getInviteStatusForLot(lot.id)}
                        ownerName={lot.owner_display_name ?? null}
                        ownerEmail={lot.owner_contact_email ?? null}
                        ownerPhone={lot.owner_contact_phone ?? null}
                        onInviteChanged={onInviteChanged}
                      />
                    </TableCell>
                  )}
                  {!isLotOwner && (
                    <TableCell className="text-right tabular-nums whitespace-nowrap">
                      {lot.balance === 0 ? (
                        <span className="text-[hsl(160,100%,37%)]">{formatCurrency(0)}</span>
                      ) : lot.balance > 0 ? (
                        <span className="text-destructive">{formatCurrency(lot.balance)}</span>
                      ) : (
                        <span className="text-[hsl(160,100%,37%)]">{formatCurrency(lot.balance)}</span>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
            {sortedLots.length === 0 && (
              <TableRow>
                <TableCell colSpan={isLotOwner ? 4 : 7} className="py-12 text-center text-muted-foreground">
                  No lots found. Create lots from the oc setup wizard.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
