"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NumberInput } from "@/components/ui/number-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { VicAddressAutocomplete, type ParsedAddress } from "@/components/shared/vic-address-autocomplete";
import { saveStep, type DraftJson, type DraftLot } from "../actions";

// Plan-of-Subdivision number regex: PS + 6 digits + 1 uppercase letter.
const PS_REGEX = /^PS\d{6}[A-Z]$/;

type DetectedOcLite = {
  oc_number: number;
  lot_count: number;
  oc_name?: string | null;
};

export function Page2Review({
  draftId,
  initialDraft,
  detectedOcs,
  onNext,
  onBack,
}: {
  draftId: string;
  initialDraft: DraftJson;
  detectedOcs: DetectedOcLite[];
  onNext: () => void;
  onBack: () => void;
}) {
  const [planNumber, setPlanNumber] = useState(initialDraft.plan_number ?? "");
  const [planNumberInvalid, setPlanNumberInvalid] = useState(false);
  // OC number is held as a string so the input can be temporarily empty while
  // the user is editing (CLAUDE.md "allow empty until Continue" rule). Parsed
  // on submit and flagged if missing/invalid.
  const [ocNumber, setOcNumber] = useState<string>(
    initialDraft.oc_number != null ? String(initialDraft.oc_number) : "",
  );
  const [ocNumberInvalid, setOcNumberInvalid] = useState(false);
  const [address, setAddress] = useState<ParsedAddress>({
    street_number: initialDraft.street_number ?? "",
    street_name: initialDraft.street_name ?? "",
    suburb: initialDraft.suburb ?? "",
    state: "VIC",
    postcode: initialDraft.postcode ?? "",
    formatted: initialDraft.address ?? "",
  });
  const [addressInvalid, setAddressInvalid] = useState(false);
  const [lots, setLots] = useState<DraftLot[]>(initialDraft.lots ?? []);
  // Per-row field invalidity flags. Populated only on submit, cleared back
  // to false on the matching field's onChange — so the inputs DON'T turn red
  // while the user is still typing (CLAUDE.md validation rule). Lot liability
  // must be > 0 (statutory share of common-property costs); 0 isn't legal.
  const [lotErrors, setLotErrors] = useState<Array<{ unit?: boolean; entitlement?: boolean; liability?: boolean; lotNumber?: boolean }>>([]);
  // Whether to flag the "Add lot" button red. The OC-Act-minimum check is
  // < 2 lots, but we don't want a destructive red ring to appear the moment
  // the user lands on the page — only after they actually try to advance.
  const [addLotInvalid, setAddLotInvalid] = useState(false);
  const [pending, setPending] = useState(false);

  const totalEntitlement = useMemo(
    () => lots.reduce((s, l) => s + (Number(l.unit_entitlement) || 0), 0),
    [lots],
  );
  const totalLiability = useMemo(
    () => lots.reduce((s, l) => s + (Number(l.lot_liability) || 0), 0),
    [lots],
  );


  function updateLot(idx: number, patch: Partial<DraftLot>) {
    setLots((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
    // Clear submit-time invalidity flags for any field that's just been
    // touched, so the red border disappears as soon as the user starts
    // fixing the value.
    if (lotErrors[idx]) {
      setLotErrors((prev) => {
        const next = [...prev];
        const cur = { ...(next[idx] ?? {}) };
        if ("unit_number" in patch) cur.unit = false;
        if ("lot_number" in patch) cur.lotNumber = false;
        if ("unit_entitlement" in patch) cur.entitlement = false;
        if ("lot_liability" in patch) cur.liability = false;
        next[idx] = cur;
        return next;
      });
    }
  }
  function addLot() {
    const nextNum = lots.length === 0 ? 1 : Math.max(...lots.map((l) => l.lot_number)) + 1;
    // Leave entitlement/liability undefined so the new row's inputs start
    // EMPTY rather than seeded with 0 — the manager always wants to type
    // the value, and 0 in entitlement is illegal anyway.
    setLots((prev) => [...prev, { lot_number: nextNum }]);
  }
  function removeLot(idx: number) {
    setLots((prev) => prev.filter((_, i) => i !== idx));
  }

  async function onContinue() {
    const problems: string[] = [];
    // Plan number is required.
    if (!planNumber.trim()) {
      problems.push("Plan number is required.");
      setPlanNumberInvalid(true);
    } else if (!PS_REGEX.test(planNumber.toUpperCase())) {
      problems.push('Plan number format is "PS" + 6 digits + 1 letter (e.g. PS812345X)');
      setPlanNumberInvalid(true);
    } else {
      setPlanNumberInvalid(false);
    }

    // Address parts — every component must be present. Plan parsers can
    // return an address with missing pieces; managers have to fill them in
    // before we can produce levy notices (postal label needs them all).
    const addressParts = {
      street_number: (address.street_number ?? "").trim(),
      street_name: (address.street_name ?? "").trim(),
      suburb: (address.suburb ?? "").trim(),
      postcode: (address.postcode ?? "").trim(),
    };
    const missingAddressParts: string[] = [];
    if (!addressParts.street_number) missingAddressParts.push("street number");
    if (!addressParts.street_name) missingAddressParts.push("street name");
    if (!addressParts.suburb) missingAddressParts.push("suburb");
    if (!addressParts.postcode) missingAddressParts.push("postcode");
    if (missingAddressParts.length > 0) {
      problems.push(`Address is missing: ${missingAddressParts.join(", ")}.`);
      setAddressInvalid(true);
    } else {
      setAddressInvalid(false);
    }

    // OC number is required (parses to a positive integer).
    const ocNumberParsed = parseInt(ocNumber, 10);
    if (!ocNumber.trim() || !Number.isFinite(ocNumberParsed) || ocNumberParsed < 1) {
      problems.push("OC number is required.");
      setOcNumberInvalid(true);
    } else {
      setOcNumberInvalid(false);
    }

    // Build the per-row error flags fresh on every submit.
    const nextLotErrors: Array<{ unit?: boolean; entitlement?: boolean; liability?: boolean; lotNumber?: boolean }> = lots.map(() => ({}));

    // Every lot must have entitlement > 0 AND liability > 0, and at least 2 lots.
    if (lots.length < 2) {
      problems.push("An OC must have at least 2 lots.");
      setAddLotInvalid(true);
    } else {
      setAddLotInvalid(false);
    }
    // Entitlement: must be present and > 0. Liability: must be present;
    // 0 is legal (e.g. services-only lots with no share of common-property
    // running costs). Both fields can be EMPTY during typing — only flagged
    // when the manager actually tries to continue.
    const missingEntitlement: number[] = [];
    const missingLiability: number[] = [];
    const missingUnit: number[] = [];
    lots.forEach((l, i) => {
      const ent = l.unit_entitlement;
      if (ent == null || Number.isNaN(Number(ent)) || Number(ent) <= 0) {
        missingEntitlement.push(l.lot_number);
        nextLotErrors[i].entitlement = true;
      }
      const lia = l.lot_liability;
      if (lia == null || Number.isNaN(Number(lia)) || Number(lia) < 0) {
        missingLiability.push(l.lot_number);
        nextLotErrors[i].liability = true;
      }
      if (!l.unit_number || !l.unit_number.trim()) {
        missingUnit.push(l.lot_number);
        nextLotErrors[i].unit = true;
      }
    });
    if (missingEntitlement.length > 0) {
      const ids = missingEntitlement.slice(0, 3).map((n) => `Lot ${n}`).join(", ");
      const more = missingEntitlement.length > 3 ? ` and ${missingEntitlement.length - 3} more` : "";
      problems.push(`Unit entitlement must be greater than 0 for every lot (${ids}${more}).`);
    }
    if (missingLiability.length > 0) {
      const ids = missingLiability.slice(0, 3).map((n) => `Lot ${n}`).join(", ");
      const more = missingLiability.length > 3 ? ` and ${missingLiability.length - 3} more` : "";
      problems.push(`Lot liability is required for every lot — 0 is allowed (${ids}${more}).`);
    }
    if (missingUnit.length > 0) {
      const ids = missingUnit.slice(0, 3).map((n) => `Lot ${n}`).join(", ");
      const more = missingUnit.length > 3 ? ` and ${missingUnit.length - 3} more` : "";
      problems.push(`Unit is required for every lot (${ids}${more}).`);
    }

    // Duplicate-detection. A plan of subdivision uniquely identifies each
    // lot by both lot_number and unit_number, so accepting duplicates here
    // would let the manager create two lots that point at the same physical
    // dwelling — the downstream lots / levies / DRN tables would then have
    // multiple records claiming the same identity. Block at submit.
    const lotNumberCounts = new Map<number, number[]>();
    const unitNumberCounts = new Map<string, number[]>();
    lots.forEach((l, i) => {
      if (l.lot_number) {
        const arr = lotNumberCounts.get(l.lot_number) ?? [];
        arr.push(i);
        lotNumberCounts.set(l.lot_number, arr);
      }
      const unitKey = (l.unit_number ?? "").trim().toUpperCase();
      if (unitKey) {
        const arr = unitNumberCounts.get(unitKey) ?? [];
        arr.push(i);
        unitNumberCounts.set(unitKey, arr);
      }
    });
    const dupLotNumbers: number[] = [];
    for (const [lotNo, indices] of lotNumberCounts) {
      if (indices.length > 1) {
        dupLotNumbers.push(lotNo);
        indices.forEach((i) => { nextLotErrors[i].lotNumber = true; });
      }
    }
    const dupUnits: string[] = [];
    for (const [unit, indices] of unitNumberCounts) {
      if (indices.length > 1) {
        dupUnits.push(unit);
        indices.forEach((i) => { nextLotErrors[i].unit = true; });
      }
    }
    if (dupLotNumbers.length > 0) {
      const ids = dupLotNumbers.slice(0, 3).map((n) => `Lot ${n}`).join(", ");
      const more = dupLotNumbers.length > 3 ? ` and ${dupLotNumbers.length - 3} more` : "";
      problems.push(`Duplicate lot numbers — every lot must be unique (${ids}${more}).`);
    }
    if (dupUnits.length > 0) {
      const ids = dupUnits.slice(0, 3).map((u) => `Unit ${u}`).join(", ");
      const more = dupUnits.length > 3 ? ` and ${dupUnits.length - 3} more` : "";
      problems.push(`Duplicate unit numbers — every unit must be unique (${ids}${more}).`);
    }
    setLotErrors(nextLotErrors);

    if (problems.length) {
      toast.error(problems.length === 1 ? problems[0] : "Fix the highlighted fields.");
      return;
    }

    setPending(true);
    const r = await saveStep(draftId, {
      plan_number: planNumber.toUpperCase() || undefined,
      oc_number: ocNumberParsed,
      // Don't persist a separate "legal OC name". owners_corporations.name is
      // resolved from trading_name → address at completeWizard time, so the
      // wizard doesn't need a field for it.
      address: address.formatted,
      street_number: address.street_number,
      street_name: address.street_name,
      suburb: address.suburb,
      state: address.state,
      postcode: address.postcode,
      total_lots: lots.length,
      lots,
    }, 3);
    if (r.error) {
      setPending(false);
      toast.error(r.error);
      return;
    }
    // Keep the spinner up through the refresh + step transition so the button
    // doesn't visibly "stop loading" before the next page renders.
    await onNext();
  }

  // Two header variants depending on whether the user came from the
  // plan-parse path (detected OCs non-empty) or from skip-and-enter-
  // manually (no detected OCs). The skip path has nothing to "review",
  // so the copy reflects that — they're entering everything by hand.
  const cameFromSkip = detectedOcs.length === 0;
  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-lg font-semibold text-foreground">
          {cameFromSkip ? "Enter the OC details" : "Review the extracted details"}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {cameFromSkip
            ? "Fill in the basics for this OC and add each lot below."
            : "We pulled these from your plan. Edit anything that's wrong."}
        </p>
      </div>

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="plan-number">
              Plan-of-subdivision number <span className="text-destructive">*</span>
            </Label>
            <Input
              id="plan-number"
              placeholder="Plan of subdivision number"
              value={planNumber}
              onChange={(e) => {
                setPlanNumber(e.target.value.toUpperCase());
                if (planNumberInvalid) setPlanNumberInvalid(false);
              }}
              maxLength={9}
              aria-invalid={planNumberInvalid || undefined}
              // `uppercase` would also paint the placeholder uppercase
              // (CSS doesn't differentiate). normal-case on the placeholder
              // keeps the hint readable.
              className="uppercase placeholder:normal-case"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="oc-number">
              OC number <span className="text-destructive">*</span>
            </Label>
            {detectedOcs.length > 1 ? (
              <Select
                value={ocNumber}
                onValueChange={(v) => { setOcNumber(v ?? ""); if (ocNumberInvalid) setOcNumberInvalid(false); }}
              >
                <SelectTrigger id="oc-number" aria-invalid={ocNumberInvalid || undefined}>
                  <SelectValue placeholder="Select the OC" />
                </SelectTrigger>
                <SelectContent>
                  {detectedOcs.map((o) => (
                    <SelectItem key={o.oc_number} value={String(o.oc_number)}>
                      OC{o.oc_number} — {o.lot_count} lots
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <NumberInput
                id="oc-number"
                allowDecimal={false}
                value={ocNumber}
                onChange={(v) => { setOcNumber(v); if (ocNumberInvalid) setOcNumberInvalid(false); }}
                placeholder="Owners Corporation number"
                invalid={ocNumberInvalid}
              />
            )}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="address">
            Address <span className="text-destructive">*</span>
          </Label>
          <VicAddressAutocomplete
            id="address"
            value={address}
            onChange={(v) => { setAddress(v); if (addressInvalid) setAddressInvalid(false); }}
            error={addressInvalid}
          />
          {addressInvalid && (
            <p className="text-xs text-destructive">
              Address must include street number, street name, suburb, and postcode.
            </p>
          )}
        </div>

        {/* Lot schedule */}
        <div className="space-y-2 pt-2">
          <div className="flex items-center justify-between">
            <Label>Lot schedule</Label>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => { addLot(); if (addLotInvalid) setAddLotInvalid(false); }}
              className={addLotInvalid ? "border border-destructive ring-2 ring-destructive/20" : undefined}
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Add lot
            </Button>
          </div>

          {lots.length === 0 ? (
            <div className="rounded-md border border-dashed border-border bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
              No lots yet. Click &ldquo;Add lot&rdquo; to start.
            </div>
          ) : (
            <div
              className="rounded-md border border-border bg-muted/40 overflow-hidden"
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
                  const node = (e.currentTarget as HTMLElement).querySelector<HTMLElement>(
                    `[data-cell="${r}:${c}"]`,
                  );
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
                <thead className="bg-card text-muted-foreground">
                  <tr className="text-xs uppercase tracking-wide border-b border-border">
                    <th className="px-3 py-2 text-left font-medium">Lot</th>
                    <th className="px-3 py-2 text-left font-medium">Unit</th>
                    <th className="px-3 py-2 text-left font-medium">Units of entitlement</th>
                    <th className="px-3 py-2 text-left font-medium">Lot liability</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {lots.map((lot, idx) => {
                    const errs = lotErrors[idx] ?? {};
                    return (
                    <tr key={idx}>
                      <td className="px-3 py-1.5" data-cell={`${idx}:0`}>
                        <NumberInput
                          allowDecimal={false}
                          value={lot.lot_number ? String(lot.lot_number) : ""}
                          onChange={(v) => updateLot(idx, { lot_number: parseInt(v, 10) || 0 })}
                          invalid={errs.lotNumber || undefined}
                          className="h-8"
                        />
                      </td>
                      <td className="px-3 py-1.5" data-cell={`${idx}:1`}>
                        <Input
                          value={lot.unit_number ?? ""}
                          onChange={(e) => updateLot(idx, { unit_number: e.target.value })}
                          placeholder="Unit"
                          aria-invalid={errs.unit || undefined}
                          className="h-8"
                        />
                      </td>
                      <td className="px-3 py-1.5" data-cell={`${idx}:2`}>
                        {/* Empty stays empty (undefined) — the submit
                            validator catches missing entitlement/liability
                            at Continue time. Typing 0 stays as 0. The
                            previous `v === "" ? 0` coalescion forced 0
                            on blank inputs and made empty unreachable. */}
                        <NumberInput
                          value={lot.unit_entitlement != null ? String(lot.unit_entitlement) : ""}
                          onChange={(v) => updateLot(idx, { unit_entitlement: v === "" ? undefined : parseFloat(v) })}
                          invalid={errs.entitlement || undefined}
                          className="h-8"
                        />
                      </td>
                      <td className="px-3 py-1.5" data-cell={`${idx}:3`}>
                        <NumberInput
                          value={lot.lot_liability != null ? String(lot.lot_liability) : ""}
                          onChange={(v) => updateLot(idx, { lot_liability: v === "" ? undefined : parseFloat(v) })}
                          invalid={errs.liability || undefined}
                          className="h-8"
                        />
                      </td>
                      <td className="px-3 py-1.5 text-right">
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
                  );})}
                </tbody>
                <tfoot className="bg-muted/30 text-xs font-medium">
                  <tr className="border-t border-border">
                    <td className="px-3 py-2" colSpan={2}>Totals</td>
                    {/* Totals align with the NumberInput's text inside each
                        cell — the input itself has px-3 horizontal padding,
                        so the column-level px-3 alone leaves the totals
                        flush-left under the cell border. Add the input's
                        left padding here too (pl-6 total) to line up. */}
                    <td className="px-3 pl-6 py-2 text-left tabular-nums">{totalEntitlement.toLocaleString()}</td>
                    <td className="px-3 pl-6 py-2 text-left tabular-nums">{totalLiability.toLocaleString()}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

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
