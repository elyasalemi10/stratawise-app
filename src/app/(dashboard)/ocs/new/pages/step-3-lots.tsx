"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { NumberInput } from "@/components/ui/number-input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { saveStep, type DraftJson, type DraftLot } from "../actions";

// Wizard Step 3 — Lots & Owners (main page).
//
// Captures the lot schedule with Type + Name + entitlements + owner-occupied
// flag. Sub-steps 3.1 (Postal & Contact) and 3.2 (Digital consent) fill in
// the per-owner contact + consent details.
//
// Tier is auto-derived from lot count + services-only flag. Manager confirms
// via the checkbox; the value is persisted to draft_json.tier_confirmed and
// stamped onto owners_corporations.tier_confirmed_at / by at completeWizard.

function computeAutoTier(lotCount: number, servicesOnly: boolean): { tier: number; description: string } {
  if (servicesOnly) return { tier: 5, description: "services-only" };
  if (lotCount >= 100) return { tier: 1, description: "100+ lots" };
  if (lotCount >= 51) return { tier: 2, description: "51–99 lots" };
  if (lotCount >= 10) return { tier: 3, description: "10–50 lots" };
  if (lotCount >= 3) return { tier: 4, description: "3–9 lots" };
  return { tier: 5, description: "2 lots" };
}

export function Step3Lots({
  draftId,
  initialDraft,
  onBack,
  onNext,
}: {
  draftId: string;
  initialDraft: DraftJson;
  onBack: () => void;
  onNext: () => void;
}) {
  // Seed at least 2 lots so the table renders something on first load.
  const seedLots: DraftLot[] = initialDraft.lots && initialDraft.lots.length > 0
    ? initialDraft.lots
    : Array.from({ length: 2 }, (_, i) => ({ lot_number: i + 1, unit_number: String(i + 1), owner_type: "individual" }));

  const [lots, setLots] = useState<DraftLot[]>(seedLots);
  const [servicesOnly, setServicesOnly] = useState<boolean>(initialDraft.services_only ?? false);
  const [tierConfirmed, setTierConfirmed] = useState<boolean>(initialDraft.tier_confirmed ?? false);
  const [tierConfirmedInvalid, setTierConfirmedInvalid] = useState(false);

  const [lotErrors, setLotErrors] = useState<Array<{
    name?: boolean; type?: boolean; lotNumber?: boolean; unit?: boolean;
    entitlement?: boolean; liability?: boolean; tenantName?: boolean;
  }>>([]);
  const [pending, setPending] = useState(false);

  const totalEntitlement = useMemo(
    () => lots.reduce((s, l) => s + (Number(l.unit_entitlement) || 0), 0),
    [lots],
  );
  const totalLiability = useMemo(
    () => lots.reduce((s, l) => s + (Number(l.lot_liability) || 0), 0),
    [lots],
  );
  const { tier, description: tierDesc } = computeAutoTier(lots.length, servicesOnly);

  function updateLot(idx: number, patch: Partial<DraftLot>) {
    setLots((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
    if (lotErrors[idx]) {
      setLotErrors((prev) => {
        const next = [...prev];
        const cur = { ...(next[idx] ?? {}) };
        if ("owner_name" in patch) cur.name = false;
        if ("owner_type" in patch) cur.type = false;
        if ("lot_number" in patch) cur.lotNumber = false;
        if ("unit_number" in patch) cur.unit = false;
        if ("unit_entitlement" in patch) cur.entitlement = false;
        if ("lot_liability" in patch) cur.liability = false;
        if ("tenant_name" in patch) cur.tenantName = false;
        next[idx] = cur;
        return next;
      });
    }
  }
  function addLot() {
    const nextNum = lots.length === 0 ? 1 : Math.max(...lots.map((l) => l.lot_number)) + 1;
    setLots((prev) => [
      ...prev,
      { lot_number: nextNum, unit_number: String(nextNum), owner_type: "individual" },
    ]);
  }
  function removeLot(idx: number) {
    setLots((prev) => prev.filter((_, i) => i !== idx));
  }

  async function onContinue() {
    const problems: string[] = [];
    const nextLotErrors: typeof lotErrors = lots.map(() => ({}));

    if (lots.length < 2) {
      problems.push("An OC must have at least 2 lots.");
    }

    const lotNumberCounts = new Map<number, number[]>();
    const unitNumberCounts = new Map<string, number[]>();

    lots.forEach((l, i) => {
      if (!l.owner_type) {
        problems.push(`Lot ${l.lot_number || i + 1}: type is required.`);
        nextLotErrors[i].type = true;
      }
      if (!(l.owner_name ?? "").trim()) {
        problems.push(`Lot ${l.lot_number || i + 1}: name is required.`);
        nextLotErrors[i].name = true;
      }
      if (!Number.isFinite(l.lot_number) || l.lot_number <= 0) {
        problems.push(`Row ${i + 1}: lot number must be a positive integer.`);
        nextLotErrors[i].lotNumber = true;
      } else {
        const arr = lotNumberCounts.get(l.lot_number) ?? [];
        arr.push(i);
        lotNumberCounts.set(l.lot_number, arr);
      }
      const unitKey = (l.unit_number ?? "").trim();
      if (!unitKey) {
        problems.push(`Row ${i + 1}: unit number is required.`);
        nextLotErrors[i].unit = true;
      } else {
        const arr = unitNumberCounts.get(unitKey.toUpperCase()) ?? [];
        arr.push(i);
        unitNumberCounts.set(unitKey.toUpperCase(), arr);
      }
      const ent = l.unit_entitlement;
      if (ent == null || Number.isNaN(Number(ent)) || Number(ent) <= 0) {
        problems.push(`Lot ${l.lot_number || i + 1}: units of entitlement must be greater than 0.`);
        nextLotErrors[i].entitlement = true;
      }
      const lia = l.lot_liability;
      if (lia == null || Number.isNaN(Number(lia)) || Number(lia) < 0) {
        problems.push(`Lot ${l.lot_number || i + 1}: lot liability is required (0 is allowed).`);
        nextLotErrors[i].liability = true;
      }
      // Tenant name required when not owner-occupied.
      if (l.is_occupied_by_owner === false && !(l.tenant_name ?? "").trim()) {
        problems.push(`Lot ${l.lot_number || i + 1}: tenant name is required when not owner-occupied.`);
        nextLotErrors[i].tenantName = true;
      }
    });

    for (const [lotNo, indices] of lotNumberCounts) {
      if (indices.length > 1) {
        problems.push(`Duplicate lot number: ${lotNo}`);
        indices.forEach((i) => { nextLotErrors[i].lotNumber = true; });
      }
    }
    for (const [unit, indices] of unitNumberCounts) {
      if (indices.length > 1) {
        problems.push(`Duplicate unit number: ${unit}`);
        indices.forEach((i) => { nextLotErrors[i].unit = true; });
      }
    }
    setLotErrors(nextLotErrors);

    if (!tierConfirmed) {
      problems.push("Confirm the computed tier is correct before continuing.");
      setTierConfirmedInvalid(true);
    } else {
      setTierConfirmedInvalid(false);
    }

    if (problems.length) {
      toast.error(problems.length === 1 ? problems[0] : "Fix the highlighted fields.");
      return;
    }

    setPending(true);
    const r = await saveStep(draftId, {
      lots,
      total_lots: lots.length,
      services_only: servicesOnly,
      tier,
      tier_confirmed: true,
    }, 3, 1); // Advance to Step 3.1 (Postal & Contact).
    if (r.error) {
      setPending(false);
      toast.error(r.error);
      return;
    }
    await onNext();
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-lg font-semibold text-foreground">Lot schedule</h2>
      </div>

      <div className="flex items-end justify-between gap-6">
        <div className="space-y-1.5 w-40">
          <Label htmlFor="lot-count">Number of lots</Label>
          <Input
            id="lot-count"
            readOnly
            value={lots.length}
            className="bg-muted text-foreground cursor-default"
          />
        </div>
        <div className="flex items-start gap-2 pb-2">
          <Checkbox
            id="services-only"
            checked={servicesOnly}
            onCheckedChange={(v) => setServicesOnly(v === true)}
          />
          <div className="-mt-0.5">
            <Label className="text-sm font-medium text-foreground">Services-only scheme</Label>
            <p className="text-xs text-muted-foreground">
              Tick if this OC exists only to share services with no residential / commercial lots. Forces Tier 5.
            </p>
          </div>
        </div>
      </div>

      <div
        className="rounded-md border border-border bg-card overflow-hidden"
        onKeyDown={(e) => {
          if (!(e.target instanceof HTMLInputElement)) return;
          const target = e.target as HTMLInputElement;
          const cell = target.closest<HTMLElement>("[data-cell]");
          if (!cell) return;
          const [rowStr, colStr] = (cell.dataset.cell ?? "").split(":");
          const row = parseInt(rowStr, 10);
          const col = parseInt(colStr, 10);
          if (Number.isNaN(row) || Number.isNaN(col)) return;
          const move = (r: number, c: number) => {
            const node = (e.currentTarget as HTMLElement).querySelector<HTMLElement>(`[data-cell="${r}:${c}"]`);
            const input = node?.querySelector("input") ?? null;
            if (input) {
              e.preventDefault();
              input.focus();
              input.select?.();
            }
          };
          const caret = target.selectionStart ?? 0;
          const len = target.value.length;
          if (e.key === "ArrowUp") move(row - 1, col);
          else if (e.key === "ArrowDown") move(row + 1, col);
          else if (e.key === "ArrowLeft" && caret === 0) move(row, col - 1);
          else if (e.key === "ArrowRight" && caret === len) move(row, col + 1);
        }}
      >
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-muted-foreground">
            <tr className="text-xs uppercase tracking-wide border-b border-border">
              <th className="px-2 py-2 text-left font-medium w-32">Type</th>
              <th className="px-2 py-2 text-left font-medium">Name</th>
              <th className="px-2 py-2 text-left font-medium w-20">Lot</th>
              <th className="px-2 py-2 text-left font-medium w-24">Unit</th>
              <th className="px-2 py-2 text-left font-medium w-32">Entitlement</th>
              <th className="px-2 py-2 text-left font-medium w-32">Liability</th>
              <th className="px-2 py-2 text-left font-medium w-32">Owner occupied</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {lots.map((lot, idx) => {
              const errs = lotErrors[idx] ?? {};
              const ownerOccupied = lot.is_occupied_by_owner !== false;
              return (
                <>
                  <tr key={idx}>
                    <td className="px-2 py-1.5">
                      <Select
                        value={lot.owner_type ?? "individual"}
                        onValueChange={(v) => updateLot(idx, { owner_type: (v as "individual" | "company") ?? "individual" })}
                      >
                        <SelectTrigger className="h-8" aria-invalid={errs.type || undefined}>
                          <SelectValue>{lot.owner_type === "company" ? "Company" : "Individual"}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="individual">Individual</SelectItem>
                          <SelectItem value="company">Company</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-2 py-1.5" data-cell={`${idx}:0`}>
                      <Input
                        value={lot.owner_name ?? ""}
                        onChange={(e) => updateLot(idx, { owner_name: e.target.value })}
                        aria-invalid={errs.name || undefined}
                        placeholder="Owner name"
                        className="h-8"
                      />
                    </td>
                    <td className="px-2 py-1.5" data-cell={`${idx}:1`}>
                      <NumberInput
                        allowDecimal={false}
                        value={lot.lot_number ? String(lot.lot_number) : ""}
                        onChange={(v) => updateLot(idx, { lot_number: parseInt(v, 10) || 0 })}
                        invalid={errs.lotNumber || undefined}
                        className="h-8"
                      />
                    </td>
                    <td className="px-2 py-1.5" data-cell={`${idx}:2`}>
                      <Input
                        value={lot.unit_number ?? ""}
                        onChange={(e) => updateLot(idx, { unit_number: e.target.value })}
                        aria-invalid={errs.unit || undefined}
                        className="h-8"
                      />
                    </td>
                    <td className="px-2 py-1.5" data-cell={`${idx}:3`}>
                      <NumberInput
                        value={lot.unit_entitlement != null ? String(lot.unit_entitlement) : ""}
                        onChange={(v) => updateLot(idx, { unit_entitlement: v === "" ? undefined : parseFloat(v) })}
                        invalid={errs.entitlement || undefined}
                        className="h-8"
                      />
                    </td>
                    <td className="px-2 py-1.5" data-cell={`${idx}:4`}>
                      <NumberInput
                        value={lot.lot_liability != null ? String(lot.lot_liability) : ""}
                        onChange={(v) => updateLot(idx, { lot_liability: v === "" ? undefined : parseFloat(v) })}
                        invalid={errs.liability || undefined}
                        className="h-8"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <div className="inline-flex items-center gap-2">
                        <Switch
                          checked={ownerOccupied}
                          onCheckedChange={(v) => updateLot(idx, { is_occupied_by_owner: v === true })}
                          aria-label={`Owner occupied for lot ${lot.lot_number}`}
                        />
                        <span className={`text-xs font-medium ${ownerOccupied ? "text-foreground" : "text-muted-foreground"}`}>
                          {ownerOccupied ? "Yes" : "No"}
                        </span>
                      </div>
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <button
                        type="button"
                        onClick={() => removeLot(idx)}
                        className="text-muted-foreground hover:text-destructive cursor-pointer"
                        aria-label="Remove lot"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                  {!ownerOccupied && (
                    <tr className="bg-muted/20">
                      <td className="px-2 py-1.5" />
                      <td className="px-2 py-1.5" colSpan={7}>
                        <div className="grid grid-cols-3 gap-2">
                          <Input
                            placeholder="Tenant name"
                            value={lot.tenant_name ?? ""}
                            onChange={(e) => updateLot(idx, { tenant_name: e.target.value })}
                            aria-invalid={errs.tenantName || undefined}
                            className="h-8"
                          />
                          <Input
                            placeholder="Tenant phone"
                            value={lot.tenant_phone ?? ""}
                            onChange={(e) => updateLot(idx, { tenant_phone: e.target.value })}
                            className="h-8"
                          />
                          <Input
                            placeholder="Tenant email"
                            type="email"
                            value={lot.tenant_email ?? ""}
                            onChange={(e) => updateLot(idx, { tenant_email: e.target.value })}
                            className="h-8"
                          />
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
          <tfoot className="bg-muted/30 text-xs font-medium">
            <tr className="border-t border-border">
              <td className="px-2 py-2" colSpan={4}>Totals</td>
              <td className="px-2 py-2 tabular-nums">{totalEntitlement.toLocaleString()}</td>
              <td className="px-2 py-2 tabular-nums">{totalLiability.toLocaleString()}</td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>

      <div>
        <Button type="button" variant="secondary" size="sm" onClick={addLot}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Add lot
        </Button>
      </div>

      {/* Tier badge + confirmation. Read-only — manager can only change tier
          by editing the lot count or the services-only flag above. */}
      <div className="rounded-md border border-border bg-card p-4 space-y-3">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground text-xs font-semibold px-2 py-0.5">
            Computed tier: Tier {tier}
          </span>
          <span className="text-xs text-muted-foreground">({tierDesc})</span>
        </div>
        <div className="flex items-start gap-2">
          <Checkbox
            id="tier-confirmed"
            checked={tierConfirmed}
            onCheckedChange={(v) => { setTierConfirmed(v === true); if (tierConfirmedInvalid) setTierConfirmedInvalid(false); }}
            aria-invalid={tierConfirmedInvalid || undefined}
            className={tierConfirmedInvalid ? "border-destructive" : undefined}
          />
          <div className="-mt-0.5">
            <Label className="text-sm text-foreground">
              I confirm this tier is correct for this OC <span className="text-destructive">*</span>
            </Label>
          </div>
        </div>
      </div>

      <div className="flex justify-between pt-2">
        <Button type="button" variant="secondary" onClick={onBack}>Back</Button>
        <Button type="button" onClick={onContinue} disabled={pending}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          Continue
        </Button>
      </div>
    </div>
  );
}
