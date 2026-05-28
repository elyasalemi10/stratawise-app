"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Info, Loader2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NumberInput } from "@/components/ui/number-input";
import { Switch } from "@/components/ui/switch";
import { saveStep, completeWizard, type DraftJson, type DraftLot } from "../actions";
import { WizardActions } from "./_components/wizard-actions";

// Wizard Step 4 sub-step 1 , Opening balances.
//
// Anchored to the management start date (Step 1). Per-lot arrears live in a
// single full table , every lot is listed and the manager fills in the rows
// that actually have a balance to record. Type switch toggles between Debit
// (lot owes the OC) and Credit (OC owes the lot).

export function Step4OpeningBalances({
  draftId,
  initialDraft,
  onBack,
  onComplete,
}: {
  draftId: string;
  initialDraft: DraftJson;
  onBack: () => void;
  onComplete: (result: { ocCode: string; sourceDraftId?: string; nextOcIndex?: number | null }) => void;
}) {
  const managementStart = initialDraft.manager_appointment_date ?? "";

  const [operating, setOperating] = useState<string>(
    initialDraft.opening_operating_balance != null ? String(initialDraft.opening_operating_balance) : "",
  );
  const hasMaintenance = initialDraft.has_maintenance_plan_fund ?? false;
  const [maintenance, setMaintenance] = useState<string>(
    initialDraft.opening_maintenance_plan_balance != null
      ? String(initialDraft.opening_maintenance_plan_balance)
      : "",
  );
  const [operatingInvalid, setOperatingInvalid] = useState(false);
  const [maintenanceInvalid, setMaintenanceInvalid] = useState(false);

  // Every lot is in the arrears table from the start. Each row has a
  // Debit/Credit switch (Switch OFF = Debit / lot owes the OC; ON = Credit
  // / OC owes the lot) and an Amount field. Empty amount = no arrears.
  const lots = initialDraft.lots ?? [];
  const [arrearsByLot, setArrearsByLot] = useState<Record<number, { isCredit: boolean; amount: string }>>(() => {
    const init: Record<number, { isCredit: boolean; amount: string }> = {};
    for (const l of lots) {
      const v = Number(l.opening_balance ?? 0);
      init[l.lot_number] = {
        isCredit: v < 0,
        amount: v === 0 ? "" : String(Math.abs(v)),
      };
    }
    return init;
  });

  const [pending, setPending] = useState(false);

  function updateRow(lotNumber: number, patch: Partial<{ isCredit: boolean; amount: string }>) {
    setArrearsByLot((prev) => ({
      ...prev,
      [lotNumber]: { ...prev[lotNumber], ...patch },
    }));
  }

  function parseMoney(s: string): number | null {
    if (!s.trim()) return null;
    const n = parseFloat(s.replace(/[$,\s]/g, ""));
    return Number.isFinite(n) ? n : NaN as unknown as number;
  }

  // When the manager opted to defer banking on Step 4 there are no bank
  // accounts to seed with opening balances. Skip every numeric check and
  // jump straight to completeWizard; the OC ships without a bank_accounts
  // row and Settings → Banking handles the rest later.
  const bankingDeferred = initialDraft.banking_deferred === true;

  async function onCreate() {
    if (bankingDeferred) {
      setPending(true);
      const result = await completeWizard(draftId);
      if (result.error || !result.ocCode) {
        setPending(false);
        toast.error(result.error ?? "Failed to create the OC");
        return;
      }
      // Spinner stays ON through the navigation onComplete fires , no flash.
      onComplete({
        ocCode: result.ocCode,
        sourceDraftId: result.sourceDraftId,
        nextOcIndex: result.nextOcIndex,
      });
      return;
    }

    if (!managementStart) {
      toast.error("Management start date is missing. Go back to Step 1 to set it.");
      return;
    }
    const problems: string[] = [];
    const operatingN = parseMoney(operating);
    const maintN = hasMaintenance ? parseMoney(maintenance) : null;
    if (operatingN === null || Number.isNaN(operatingN)) {
      problems.push("Operating fund balance is required.");
      setOperatingInvalid(true);
    } else { setOperatingInvalid(false); }
    if (hasMaintenance && (maintN === null || Number.isNaN(maintN))) {
      problems.push("Maintenance plan fund balance is required.");
      setMaintenanceInvalid(true);
    } else {
      setMaintenanceInvalid(false);
    }

    if (problems.length) {
      toast.error(problems.length === 1 ? problems[0] : "Fix the highlighted fields.");
      return;
    }

    const updatedLots: DraftLot[] = lots.map((l) => {
      const row = arrearsByLot[l.lot_number];
      const v = parseFloat(row?.amount ?? "") || 0;
      return { ...l, opening_balance: row?.isCredit ? -v : v };
    });

    setPending(true);
    const r = await saveStep(draftId, {
      opening_balance_date: managementStart,
      opening_operating_balance: operatingN ?? 0,
      opening_maintenance_plan_balance: hasMaintenance ? (maintN ?? 0) : undefined,
      lots: updatedLots,
    }, 4, 1);
    if (r.error) {
      setPending(false);
      toast.error(r.error);
      return;
    }
    const result = await completeWizard(draftId);
    if (result.error || !result.ocCode) {
      setPending(false);
      toast.error(result.error ?? "Failed to create the OC");
      return;
    }
    // Spinner stays ON through the navigation onComplete fires , no flash.
    onComplete({
      ocCode: result.ocCode,
      sourceDraftId: result.sourceDraftId,
      nextOcIndex: result.nextOcIndex,
    });
  }

  if (bankingDeferred) {
    return (
      <div className="space-y-6">
        <div className="text-center">
          <h2 className="text-lg font-semibold text-foreground">Ready to create</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            You opted to set up bank accounts later. The OC is ready to be
            created , opening balances will be captured when you configure
            banking from Settings → Banking.
          </p>
        </div>
        <div className="flex items-center justify-between pt-2">
          <Button type="button" variant="secondary" onClick={onBack}>Back</Button>
          <Button type="button" onClick={onCreate} disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            Create OC
          </Button>
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-6">
        <div className="text-center">
          <h2 className="text-lg font-semibold text-foreground">Opening balances</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            As at management start date:{" "}
            <span className="font-medium text-foreground">
              {managementStart
                ? new Date(managementStart).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })
                : "(set on Step 1)"}
            </span>
          </p>
        </div>

        <div className={hasMaintenance ? "grid grid-cols-2 gap-4" : "space-y-3"}>
          <div className="space-y-1.5">
            <Label htmlFor="op-bal">
              Operating fund balance <span className="text-destructive">*</span>
            </Label>
            <NumberInput
              thousandsSeparator
              id="op-bal"
              allowNegative
              value={operating}
              onChange={(v) => { setOperating(v); if (operatingInvalid) setOperatingInvalid(false); }}
              invalid={operatingInvalid}
              prefix="$"
              placeholder="Balance"
            />
          </div>
          {hasMaintenance && (
            <div className="space-y-1.5">
              <Label htmlFor="maint-bal">
                Maintenance plan fund balance <span className="text-destructive">*</span>
              </Label>
              <NumberInput
                thousandsSeparator
                id="maint-bal"
                allowNegative
                value={maintenance}
                onChange={(v) => { setMaintenance(v); if (maintenanceInvalid) setMaintenanceInvalid(false); }}
                invalid={maintenanceInvalid}
                prefix="$"
                placeholder="Balance"
              />
            </div>
          )}
        </div>

        {/* Per-lot opening arrears , every lot listed; manager fills in the
            rows that actually have a balance. Switch toggles between Debit
            (default OFF) and Credit. */}
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <h3 className="text-sm font-semibold text-foreground">Per-lot opening arrears</h3>
            <Tooltip>
              <TooltipTrigger
                render={
                  <button type="button" aria-label="Debit / Credit explained" className="text-muted-foreground hover:text-foreground cursor-help">
                    <Info className="h-3.5 w-3.5" />
                  </button>
                }
              />
              <TooltipContent>
                <span><strong>Debit</strong> = the lot owes the OC. <strong>Credit</strong> = the OC owes the lot.</span>
              </TooltipContent>
            </Tooltip>
          </div>

          <div className="rounded-md border border-border bg-card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-primary text-primary-foreground">
                <tr className="text-xs font-medium">
                  <th className="px-3 py-2 text-left w-20">Lot</th>
                  <th className="px-3 py-2 text-left">Name</th>
                  <th className="px-3 py-2 text-left w-40">Type</th>
                  <th className="px-3 py-2 text-left w-48">Amount</th>
                </tr>
              </thead>
              <tbody className="[&_tr:nth-child(odd)]:bg-card [&_tr:nth-child(even)]:bg-muted/20">
                {lots.map((lot) => {
                  const row = arrearsByLot[lot.lot_number] ?? { isCredit: false, amount: "" };
                  return (
                    <tr key={lot.lot_number}>
                      <td className="px-3 py-1.5 tabular-nums">{lot.lot_number}</td>
                      <td className="px-3 py-1.5 text-muted-foreground truncate" title={lot.owner_name || ""}>
                        {lot.owner_name || ","}
                      </td>
                      <td className="px-3 py-1.5">
                        <div className="inline-flex items-center gap-2">
                          <Switch
                            checked={row.isCredit}
                            onCheckedChange={(v) => updateRow(lot.lot_number, { isCredit: v === true })}
                            aria-label={`Switch to ${row.isCredit ? "Debit" : "Credit"} for lot ${lot.lot_number}`}
                          />
                          <span className="text-xs font-medium text-foreground w-12">
                            {row.isCredit ? "Credit" : "Debit"}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-1.5">
                        <NumberInput
                          thousandsSeparator
                          prefix="$"
                          value={row.amount}
                          onChange={(v) => updateRow(lot.lot_number, { amount: v })}
                          className="h-8"
                          placeholder="Amount"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <WizardActions
          draftId={draftId}
          onBack={onBack}
          onContinue={onCreate}
          continueLabel="Create OC"
          continuePending={pending}
          getCurrentPatch={() => {
            const operatingN = parseFloat(operating);
            const maintN = parseFloat(maintenance);
            return {
              opening_balance_date: managementStart || undefined,
              opening_operating_balance: Number.isFinite(operatingN) ? operatingN : undefined,
              opening_maintenance_plan_balance:
                hasMaintenance && Number.isFinite(maintN) ? maintN : undefined,
            };
          }}
        />
      </div>
    </TooltipProvider>
  );
}
