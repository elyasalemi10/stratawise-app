"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NumberInput } from "@/components/ui/number-input";
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
  const [ocNumber, setOcNumber] = useState<number>(initialDraft.oc_number ?? 1);
  const [ocName, setOcName] = useState(initialDraft.oc_name ?? "");
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
  // while the user is still typing (CLAUDE.md validation rule).
  const [lotErrors, setLotErrors] = useState<Array<{ unit?: boolean; entitlement?: boolean }>>([]);
  const [pending, setPending] = useState(false);

  const totalEntitlement = useMemo(
    () => lots.reduce((s, l) => s + (Number(l.unit_entitlement) || 0), 0),
    [lots],
  );
  const totalLiability = useMemo(
    () => lots.reduce((s, l) => s + (Number(l.lot_liability) || 0), 0),
    [lots],
  );

  const sensibleTotals = useMemo(() => {
    const round = [100, 1000, 10000];
    const allEqual = lots.length > 0 && lots.every((l) => l.unit_entitlement === lots[0].unit_entitlement);
    return round.includes(totalEntitlement) || allEqual;
  }, [lots, totalEntitlement]);

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
    const planOk = !planNumber || PS_REGEX.test(planNumber.toUpperCase());
    if (!planOk) problems.push('Plan number format is "PS" + 6 digits + 1 letter (e.g. PS812345X)');
    setPlanNumberInvalid(!planOk);

    // Build the per-row error flags fresh on every submit.
    const nextLotErrors: Array<{ unit?: boolean; entitlement?: boolean }> = lots.map(() => ({}));

    // Every lot must have entitlement > 0, and at least 2 lots.
    if (lots.length < 2) {
      problems.push("An OC must have at least 2 lots.");
    }
    const zeroEntitlement: number[] = [];
    const missingUnit: number[] = [];
    lots.forEach((l, i) => {
      if (!(Number(l.unit_entitlement) > 0)) {
        zeroEntitlement.push(l.lot_number);
        nextLotErrors[i].entitlement = true;
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
      oc_number: ocNumber,
      oc_name: ocName || (planNumber ? `Owners Corporation ${planNumber.toUpperCase()}` : undefined),
      address: address.formatted,
      street_number: address.street_number,
      street_name: address.street_name,
      suburb: address.suburb,
      state: address.state,
      postcode: address.postcode,
      total_lots: lots.length,
      lots,
    }, 3);
    setPending(false);
    if (r.error) {
      toast.error(r.error);
      return;
    }
    onNext();
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
              placeholder="PS812345X"
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
            <Label htmlFor="oc-number">OC number</Label>
            {detectedOcs.length > 1 ? (
              <select
                id="oc-number"
                value={ocNumber}
                onChange={(e) => setOcNumber(parseInt(e.target.value, 10))}
                className="flex h-9 w-full rounded-md border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              >
                {detectedOcs.map((o) => (
                  <option key={o.oc_number} value={o.oc_number}>
                    OC{o.oc_number} — {o.lot_count} lots
                  </option>
                ))}
              </select>
            ) : (
              <Input
                id="oc-number"
                type="number"
                min={1}
                value={ocNumber}
                onChange={(e) => setOcNumber(parseInt(e.target.value, 10) || 1)}
              />
            )}
            <p className="text-xs text-muted-foreground">
              If the plan creates multiple OCs, this is the one you&apos;re setting up now. You can add the others later.
            </p>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="oc-name">
            Legal OC name <span className="text-xs font-normal text-muted-foreground">(optional)</span>
          </Label>
          <Input
            id="oc-name"
            placeholder="Leave blank to auto-name from the plan number"
            value={ocName}
            onChange={(e) => setOcName(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Defaults to &ldquo;Owners Corporation {planNumber || "PS……"}&rdquo; if you leave this blank. You can add a friendly trading name on the next page.
          </p>
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
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr className="text-xs uppercase tracking-wide">
                    <th className="px-3 py-2 text-left font-medium">Lot #</th>
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
                    <tr key={idx} className="border-t border-border">
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
                          placeholder="e.g. 3B"
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
                    <td className="px-3 py-2 text-left tabular-nums">{totalEntitlement.toLocaleString()}</td>
                    <td className="px-3 py-2 text-left tabular-nums">{totalLiability.toLocaleString()}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

        </div>
      </div>

      <div className="flex justify-between pt-2">
        <Button type="button" variant="ghost" onClick={onBack}>Back</Button>
        <Button type="button" onClick={onContinue} disabled={pending}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          Continue
        </Button>
      </div>
    </div>
  );
}
