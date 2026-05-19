"use client";

import { Fragment, useMemo, useState } from "react";
import { toast } from "sonner";
import { Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { NumberInput } from "@/components/ui/number-input";
import { PhoneInput } from "@/components/shared/phone-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { saveStep, type DraftJson, type DraftLot } from "../actions";
import { WizardActions } from "./_components/wizard-actions";

// Wizard Step 3 sub-step 0 — Lots & Owners (main).

function InlineYesNoToggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={`inline-flex items-center gap-2.5 rounded-md border px-3 h-9 cursor-pointer transition-colors w-[120px] ${
        value ? "border-primary bg-primary/5 text-foreground" : "border-border bg-card text-muted-foreground hover:border-primary/40"
      }`}
    >
      <span className={`inline-flex h-5 w-9 items-center rounded-full transition-colors ${value ? "bg-primary" : "bg-border"}`}>
        <span className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${value ? "translate-x-4" : "translate-x-0.5"}`} />
      </span>
      <span className="text-sm">{value ? "Yes" : "No"}</span>
    </button>
  );
}

function computeAutoTier(lotCount: number, servicesOnly: boolean): { tier: number; description: string } {
  if (servicesOnly) return { tier: 5, description: "services-only" };
  if (lotCount >= 100) return { tier: 1, description: "100+ lots" };
  if (lotCount >= 51) return { tier: 2, description: "51–99 lots" };
  if (lotCount >= 10) return { tier: 3, description: "10–50 lots" };
  if (lotCount >= 3) return { tier: 4, description: "3–9 lots" };
  return { tier: 5, description: "2 lots" };
}

function defaultLot(idx: number): DraftLot {
  // 1-based chronological default for lot_number only. Unit number stays
  // blank so the manager has to enter it explicitly (Victorian strata
  // plans don't guarantee unit number == lot number, and the previous
  // auto-fill produced silent bugs where new lots got mislabelled).
  return {
    lot_number: idx + 1,
    owner_type: "individual",
  };
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
  const seedLots: DraftLot[] = initialDraft.lots && initialDraft.lots.length > 0
    ? initialDraft.lots
    : Array.from({ length: 2 }, (_, i) => defaultLot(i));

  const [lots, setLots] = useState<DraftLot[]>(seedLots);
  const [servicesOnly, setServicesOnly] = useState<boolean>(initialDraft.services_only ?? false);
  const [tierConfirmed, setTierConfirmed] = useState<boolean>(initialDraft.tier_confirmed ?? false);
  const [tierConfirmedInvalid, setTierConfirmedInvalid] = useState(false);

  // Number-of-lots textbox. Live-edits the lots array length: typing higher
  // appends defaultLot()s, lower truncates from the end. Backed by a string
  // so the field can be temporarily empty while the manager retypes.
  const [lotCountInput, setLotCountInput] = useState<string>(String(seedLots.length));
  const [lotCountInvalid, setLotCountInvalid] = useState(false);

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

  function applyLotCount(n: number) {
    if (n < 2) return; // OC Act minimum.
    setLots((prev) => {
      if (n === prev.length) return prev;
      if (n < prev.length) return prev.slice(0, n);
      // Grow: append default lots starting at the next lot number.
      const next = [...prev];
      for (let i = prev.length; i < n; i++) next.push(defaultLot(i));
      return next;
    });
  }

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
  function removeLot(idx: number) {
    setLots((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      setLotCountInput(String(next.length));
      return next;
    });
  }

  async function onContinue() {
    const problems: string[] = [];
    const nextLotErrors: typeof lotErrors = lots.map(() => ({}));

    if (lots.length < 2) {
      problems.push("An OC must have at least 2 lots.");
      setLotCountInvalid(true);
    } else {
      setLotCountInvalid(false);
    }

    const lotNumberCounts = new Map<number, number[]>();
    const unitNumberCounts = new Map<string, number[]>();

    lots.forEach((l, i) => {
      // owner_type defaults to "individual" in the UI dropdown, so the
      // stored undefined-value case should pass validation as if the user
      // had explicitly picked Individual. The previous check flagged
      // every default-Individual row red on Continue.
      const ownerType = l.owner_type ?? "individual";
      if (ownerType !== "individual" && ownerType !== "company") {
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
      // Item 18 — tenant required ONLY when occupancy is "tenanted". Vacant
      // lots may legitimately have no tenant info yet.
      const occ =
        l.occupancy_status ??
        (l.is_occupied_by_owner === false
          ? (l.tenant_name ?? "").trim()
            ? "tenanted"
            : "vacant"
          : "owner_occupied");
      if (occ === "tenanted" && !(l.tenant_name ?? "").trim()) {
        problems.push(`Lot ${l.lot_number || i + 1}: tenant name is required when the lot is tenanted (or set it to Vacant).`);
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
      problems.push("Confirm the tier is correct.");
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
    }, 3, 1); // Advance to Step 3 sub 1 (Service & contact).
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

      <div className="grid grid-cols-1 gap-4 md:grid-cols-[180px_1fr]">
        <div className="space-y-1.5">
          <Label htmlFor="lot-count">Number of lots</Label>
          <NumberInput
            id="lot-count"
            allowDecimal={false}
            value={lotCountInput}
            onChange={(v) => {
              setLotCountInput(v);
              if (lotCountInvalid) setLotCountInvalid(false);
              const n = parseInt(v, 10);
              if (Number.isFinite(n) && n >= 2 && n <= 1000) applyLotCount(n);
            }}
            invalid={lotCountInvalid}
            placeholder="Count"
          />
        </div>
        {/* Services-only — matches the GST-Registered row on Step 1: label
            on the left, inline Yes/No toggle on the right, no card.
            Toggling services-only changes the computed tier, so the
            tier-confirm checkbox below must be re-ticked to advance. */}
        <div className="flex h-9 items-center gap-3 self-end">
          <Label htmlFor="services-only">Services-only OC</Label>
          <InlineYesNoToggle
            value={servicesOnly}
            onChange={(v) => {
              setServicesOnly(v);
              if (tierConfirmed) setTierConfirmed(false);
            }}
          />
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
          <thead className="bg-primary text-primary-foreground">
            <tr className="text-xs font-medium">
              <th className="px-2 py-2 text-left w-32">Type</th>
              <th className="px-2 py-2 text-left">Name</th>
              <th className="px-2 py-2 text-left w-20">Lot</th>
              <th className="px-2 py-2 text-left w-24">Unit</th>
              <th className="px-2 py-2 text-left w-32">Entitlement</th>
              <th className="px-2 py-2 text-left w-32">Liability</th>
              <th className="px-2 py-2 text-left w-40 whitespace-nowrap">Occupancy</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody className="[&_tr:nth-child(odd)]:bg-card [&_tr:nth-child(even)]:bg-muted/20">
            {lots.map((lot, idx) => {
              const errs = lotErrors[idx] ?? {};
              // Item 18 — resolve canonical occupancy. Either the explicit
              // enum field or derive from the legacy boolean + tenant data.
              const occupancyStatus: "owner_occupied" | "tenanted" | "vacant" =
                lot.occupancy_status ??
                (lot.is_occupied_by_owner === false
                  ? (lot.tenant_name ?? "").trim()
                    ? "tenanted"
                    : "vacant"
                  : "owner_occupied");
              const ownerOccupied = occupancyStatus === "owner_occupied";
              const isTenanted = occupancyStatus === "tenanted";
              return (
                <Fragment key={idx}>
                  <tr>
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
                      {/* Item 18 — 3-way occupancy selector; choosing "Vacant"
                          skips the tenant inputs and is the default when the
                          manager doesn't yet know the tenant. */}
                      <Select
                        value={occupancyStatus}
                        onValueChange={(v) =>
                          updateLot(idx, {
                            occupancy_status: v as "owner_occupied" | "tenanted" | "vacant",
                            is_occupied_by_owner: v === "owner_occupied",
                            ...(v !== "tenanted"
                              ? { tenant_name: undefined, tenant_email: undefined, tenant_phone: undefined }
                              : {}),
                          })
                        }
                      >
                        <SelectTrigger className="h-8">
                          <SelectValue placeholder="Pick occupancy">
                            {occupancyStatus === "owner_occupied"
                              ? "Owner-occupied"
                              : occupancyStatus === "tenanted"
                                ? "Tenanted"
                                : "Vacant"}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="owner_occupied">Owner-occupied</SelectItem>
                          <SelectItem value="tenanted">Tenanted</SelectItem>
                          <SelectItem value="vacant">Vacant</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <button
                        type="button"
                        onClick={() => removeLot(idx)}
                        disabled={lots.length <= 2}
                        className="text-muted-foreground hover:text-destructive disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                        aria-label="Remove lot"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                  {isTenanted && (
                    <tr>
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
                          <PhoneInput
                            value={lot.tenant_phone ?? "+61 "}
                            onChange={(v) => updateLot(idx, { tenant_phone: v })}
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
                </Fragment>
              );
            })}
          </tbody>
          <tfoot className="bg-muted/30 text-xs font-medium">
            <tr>
              <td className="px-2 py-2" colSpan={4}>Totals</td>
              <td className="px-2 py-2 tabular-nums">{totalEntitlement.toLocaleString()}</td>
              <td className="px-2 py-2 tabular-nums">{totalLiability.toLocaleString()}</td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Tier badge — just "Tier N" + a short description. No "Computed
          tier:" prefix anymore. */}
      <div className="rounded-md border border-border bg-card p-4 space-y-3">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground text-xs font-semibold px-2 py-0.5">
            Tier {tier}
          </span>
          <span className="text-xs text-muted-foreground">({tierDesc})</span>
        </div>
        <div className="flex items-start gap-2">
          <Checkbox
            id="tier-confirmed"
            checked={tierConfirmed}
            onCheckedChange={(v) => { setTierConfirmed(v === true); if (tierConfirmedInvalid) setTierConfirmedInvalid(false); }}
            aria-invalid={tierConfirmedInvalid || undefined}
            className={`bg-card ${tierConfirmedInvalid ? "border-destructive" : ""}`}
          />
          <div className="-mt-0.5">
            <Label className="text-sm text-foreground">
              Confirm the tier is correct <span className="text-destructive">*</span>
            </Label>
          </div>
        </div>
      </div>

      <WizardActions
        draftId={draftId}
        onBack={onBack}
        onContinue={onContinue}
        continuePending={pending}
        getCurrentPatch={() => ({
          lots,
          total_lots: lots.length,
          services_only: servicesOnly,
          tier,
        })}
      />
    </div>
  );
}
