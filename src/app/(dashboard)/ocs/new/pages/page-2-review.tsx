"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
          <Label htmlFor="oc-name">Legal OC Name</Label>
          <Input
            id="oc-name"
            placeholder={`Owners Corporation ${planNumber || "PS……"}`}
            value={ocName}
            onChange={(e) => setOcName(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            You can add a friendly trading name on the next page.
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
            <Label>
              Lot schedule — <span className="font-normal text-muted-foreground">{lots.length} lot{lots.length === 1 ? "" : "s"}</span>
            </Label>
            <Button type="button" variant="secondary" size="sm" onClick={addLot}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Add lot
            </Button>
          </div>

          {lots.length === 0 ? (
            <div className="rounded-md border border-dashed border-border bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
              No lots yet. Click &ldquo;Add lot&rdquo; to start.
            </div>
          ) : (
            <div className="rounded-md border border-border bg-card overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr className="text-xs uppercase tracking-wide">
                    <th className="px-3 py-2 text-left font-medium">Lot #</th>
                    <th className="px-3 py-2 text-right font-medium">Unit entitlement</th>
                    <th className="px-3 py-2 text-right font-medium">Lot liability</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {lots.map((lot, idx) => (
                    <tr key={idx} className="border-t border-border">
                      <td className="px-3 py-1.5">
                        <Input
                          type="number"
                          min={1}
                          value={lot.lot_number}
                          onChange={(e) => updateLot(idx, { lot_number: parseInt(e.target.value, 10) || 0 })}
                          className="h-8"
                        />
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        <Input
                          type="number"
                          step="any"
                          min={0}
                          value={lot.unit_entitlement}
                          onChange={(e) => updateLot(idx, { unit_entitlement: parseFloat(e.target.value) || 0 })}
                          className="h-8 text-right"
                        />
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        <Input
                          type="number"
                          step="any"
                          min={0}
                          value={lot.lot_liability}
                          onChange={(e) => updateLot(idx, { lot_liability: parseFloat(e.target.value) || 0 })}
                          className="h-8 text-right"
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
                  ))}
                </tbody>
                <tfoot className="bg-muted/30 text-xs font-medium">
                  <tr className="border-t border-border">
                    <td className="px-3 py-2">Totals</td>
                    <td className="px-3 py-2 text-right tabular-nums">{totalEntitlement.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{totalLiability.toLocaleString()}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {lots.length > 0 && !sensibleTotals && (
            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 text-amber-600 shrink-0" />
              <p className="text-xs text-amber-900">
                Totals sum to {totalEntitlement.toLocaleString()}. Most plans sum to 100 or 1000.
                Check the lot schedule on your plan.
              </p>
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
