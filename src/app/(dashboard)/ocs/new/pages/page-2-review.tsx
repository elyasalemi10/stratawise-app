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
  const [lots, setLots] = useState<DraftLot[]>(initialDraft.lots ?? []);
  // Per-row field invalidity flags. Populated only on submit, cleared back
  // to false on the matching field's onChange — so the inputs DON'T turn red
  // while the user is still typing (CLAUDE.md validation rule). Lot liability
  // must be > 0 (statutory share of common-property costs); 0 isn't legal.
  const [lotErrors, setLotErrors] = useState<Array<{ unit?: boolean; entitlement?: boolean; liability?: boolean }>>([]);
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
        if ("unit_entitlement" in patch) cur.entitlement = false;
        if ("lot_liability" in patch) cur.liability = false;
        next[idx] = cur;
        return next;
      });
    }
  }
  function addLot() {
    const nextNum = lots.length === 0 ? 1 : Math.max(...lots.map((l) => l.lot_number)) + 1;
    setLots((prev) => [...prev, { lot_number: nextNum, unit_entitlement: 0, lot_liability: 0 }]);
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

    // OC number is required (parses to a positive integer).
    const ocNumberParsed = parseInt(ocNumber, 10);
    if (!ocNumber.trim() || !Number.isFinite(ocNumberParsed) || ocNumberParsed < 1) {
      problems.push("OC number is required.");
      setOcNumberInvalid(true);
    } else {
      setOcNumberInvalid(false);
    }

    // Build the per-row error flags fresh on every submit.
    const nextLotErrors: Array<{ unit?: boolean; entitlement?: boolean; liability?: boolean }> = lots.map(() => ({}));

    // Every lot must have entitlement > 0 AND liability > 0, and at least 2 lots.
    if (lots.length < 2) {
      problems.push("An OC must have at least 2 lots.");
    }
    const zeroEntitlement: number[] = [];
    const zeroLiability: number[] = [];
    const missingUnit: number[] = [];
    lots.forEach((l, i) => {
      if (!(Number(l.unit_entitlement) > 0)) {
        zeroEntitlement.push(l.lot_number);
        nextLotErrors[i].entitlement = true;
      }
      if (!(Number(l.lot_liability) > 0)) {
        zeroLiability.push(l.lot_number);
        nextLotErrors[i].liability = true;
      }
      if (!l.unit_number || !l.unit_number.trim()) {
        missingUnit.push(l.lot_number);
        nextLotErrors[i].unit = true;
      }
    });
    if (zeroEntitlement.length > 0) {
      const ids = zeroEntitlement.slice(0, 3).map((n) => `Lot ${n}`).join(", ");
      const more = zeroEntitlement.length > 3 ? ` and ${zeroEntitlement.length - 3} more` : "";
      problems.push(`Unit entitlement must be greater than 0 for every lot (${ids}${more}).`);
    }
    if (zeroLiability.length > 0) {
      const ids = zeroLiability.slice(0, 3).map((n) => `Lot ${n}`).join(", ");
      const more = zeroLiability.length > 3 ? ` and ${zeroLiability.length - 3} more` : "";
      problems.push(`Lot liability must be greater than 0 for every lot (${ids}${more}).`);
    }
    if (missingUnit.length > 0) {
      const ids = missingUnit.slice(0, 3).map((n) => `Lot ${n}`).join(", ");
      const more = missingUnit.length > 3 ? ` and ${missingUnit.length - 3} more` : "";
      problems.push(`Unit is required for every lot (${ids}${more}).`);
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

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-lg font-semibold text-foreground">Review the extracted details</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          We pulled these from your plan. Edit anything that&apos;s wrong.
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
              placeholder="Plan-of-subdivision number"
              value={planNumber}
              onChange={(e) => {
                setPlanNumber(e.target.value.toUpperCase());
                if (planNumberInvalid) setPlanNumberInvalid(false);
              }}
              maxLength={9}
              aria-invalid={planNumberInvalid || undefined}
              className="uppercase"
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
          <VicAddressAutocomplete id="address" value={address} onChange={setAddress} />
        </div>

        {/* Lot schedule */}
        <div className="space-y-2 pt-2">
          <div className="flex items-center justify-between">
            <Label>Lot schedule</Label>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={addLot}
              className={lots.length < 2 ? "border border-destructive ring-2 ring-destructive/20" : undefined}
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
                        <NumberInput
                          value={lot.unit_entitlement ? String(lot.unit_entitlement) : ""}
                          onChange={(v) => updateLot(idx, { unit_entitlement: parseFloat(v) || 0 })}
                          invalid={errs.entitlement || undefined}
                          className="h-8"
                        />
                      </td>
                      <td className="px-3 py-1.5" data-cell={`${idx}:3`}>
                        <NumberInput
                          value={lot.lot_liability ? String(lot.lot_liability) : ""}
                          onChange={(v) => updateLot(idx, { lot_liability: parseFloat(v) || 0 })}
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
