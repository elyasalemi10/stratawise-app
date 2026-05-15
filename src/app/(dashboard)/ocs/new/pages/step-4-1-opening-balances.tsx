"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Info, Loader2, Plus, Trash2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NumberInput } from "@/components/ui/number-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { saveStep, completeWizard, type DraftJson, type DraftLot } from "../actions";

// Wizard Step 4.1 — Opening balances.
//
// As at the management start date (Step 1). No separate date picker — the
// ledger anchors to management_start_date.
//
// Per-lot arrears are OPT-IN now: empty by default, manager hits "Add lot
// with opening arrears" to pick a lot, then enters Debit/Credit + amount.

interface ArrearsRow {
  lot_number: number;
  isCredit: boolean;
  amount: string; // NumberInput string contract.
}

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

  const [admin, setAdmin] = useState<string>(
    initialDraft.opening_admin_balance != null ? String(initialDraft.opening_admin_balance) : "0",
  );
  const [capital, setCapital] = useState<string>(
    initialDraft.opening_capital_works_balance != null ? String(initialDraft.opening_capital_works_balance) : "0",
  );
  const hasMaintenance = initialDraft.has_maintenance_plan_fund ?? false;
  const [maintenance, setMaintenance] = useState<string>(
    initialDraft.opening_maintenance_plan_balance != null
      ? String(initialDraft.opening_maintenance_plan_balance)
      : "0",
  );
  const [adminInvalid, setAdminInvalid] = useState(false);
  const [capitalInvalid, setCapitalInvalid] = useState(false);
  const [maintenanceInvalid, setMaintenanceInvalid] = useState(false);

  // Per-lot arrears — opt-in. Seed from any pre-existing per-lot opening
  // balance values, otherwise empty.
  const lots = initialDraft.lots ?? [];
  const [rows, setRows] = useState<ArrearsRow[]>(() => {
    return lots
      .filter((l) => Number(l.opening_balance ?? 0) !== 0)
      .map((l) => {
        const v = Number(l.opening_balance ?? 0);
        return {
          lot_number: l.lot_number,
          isCredit: v < 0,
          amount: String(Math.abs(v)),
        };
      });
  });
  const [picker, setPicker] = useState<string>("");
  const [pending, setPending] = useState(false);

  const lotByNumber = useMemo(() => {
    const map = new Map<number, DraftLot>();
    lots.forEach((l) => map.set(l.lot_number, l));
    return map;
  }, [lots]);

  const remainingLots = lots.filter((l) => !rows.some((r) => r.lot_number === l.lot_number));

  const totalArrears = useMemo(
    () =>
      rows.reduce((s, r) => {
        const v = parseFloat(r.amount) || 0;
        return s + (r.isCredit ? -v : v);
      }, 0),
    [rows],
  );

  function addArrearsRow() {
    if (!picker) {
      toast.error("Pick a lot first.");
      return;
    }
    const lotNum = parseInt(picker, 10);
    if (!Number.isFinite(lotNum)) return;
    setRows((prev) => [...prev, { lot_number: lotNum, isCredit: false, amount: "" }]);
    setPicker("");
  }
  function removeRow(idx: number) {
    setRows((prev) => prev.filter((_, i) => i !== idx));
  }
  function updateRow(idx: number, patch: Partial<ArrearsRow>) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  function parseMoney(s: string): number | null {
    if (!s.trim()) return null;
    const n = parseFloat(s.replace(/[$,\s]/g, ""));
    return Number.isFinite(n) ? n : NaN as unknown as number;
  }

  async function onCreate() {
    if (!managementStart) {
      toast.error("Management start date is missing. Go back to Step 1 to set it.");
      return;
    }
    const problems: string[] = [];
    const adminN = parseMoney(admin);
    const capitalN = parseMoney(capital);
    const maintN = hasMaintenance ? parseMoney(maintenance) : null;
    if (adminN === null || Number.isNaN(adminN)) {
      problems.push("Administrative fund balance is required.");
      setAdminInvalid(true);
    } else { setAdminInvalid(false); }
    if (capitalN === null || Number.isNaN(capitalN)) {
      problems.push("Capital works fund balance is required.");
      setCapitalInvalid(true);
    } else { setCapitalInvalid(false); }
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

    // Roll arrears rows back into the lots[] array so completeWizard reads them.
    const arrearsByLot = new Map<number, number>();
    for (const r of rows) {
      const v = parseFloat(r.amount) || 0;
      arrearsByLot.set(r.lot_number, r.isCredit ? -v : v);
    }
    const updatedLots = lots.map((l) => ({
      ...l,
      opening_balance: arrearsByLot.get(l.lot_number) ?? 0,
    }));

    setPending(true);
    const r = await saveStep(draftId, {
      opening_balance_date: managementStart,
      opening_admin_balance: adminN ?? 0,
      opening_capital_works_balance: capitalN ?? 0,
      opening_maintenance_plan_balance: hasMaintenance ? (maintN ?? 0) : undefined,
      lots: updatedLots,
    }, 4, 1);
    if (r.error) {
      setPending(false);
      toast.error(r.error);
      return;
    }
    const result = await completeWizard(draftId);
    setPending(false);
    if (result.error || !result.ocCode) {
      toast.error(result.error ?? "Failed to create the OC");
      return;
    }
    onComplete({
      ocCode: result.ocCode,
      sourceDraftId: result.sourceDraftId,
      nextOcIndex: result.nextOcIndex,
    });
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

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="admin-bal">
                Administrative fund balance <span className="text-destructive">*</span>
              </Label>
              <NumberInput
                thousandsSeparator
                id="admin-bal"
                allowNegative
                value={admin}
                onChange={(v) => { setAdmin(v); if (adminInvalid) setAdminInvalid(false); }}
                invalid={adminInvalid}
                prefix="$"
                placeholder="0"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cap-bal">
                Capital works fund balance <span className="text-destructive">*</span>
              </Label>
              <NumberInput
                thousandsSeparator
                id="cap-bal"
                allowNegative
                value={capital}
                onChange={(v) => { setCapital(v); if (capitalInvalid) setCapitalInvalid(false); }}
                invalid={capitalInvalid}
                prefix="$"
                placeholder="0"
              />
            </div>
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
                placeholder="0"
              />
            </div>
          )}
        </div>

        {/* Per-lot opening arrears — opt-in via the picker + Add button. */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
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
            <span className="text-xs tabular-nums text-muted-foreground">
              Total: ${totalArrears.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>

          {rows.length > 0 && (
            <div className="rounded-md border border-border bg-card overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-muted-foreground">
                  <tr className="text-xs uppercase tracking-wide border-b border-border">
                    <th className="px-3 py-2 text-left font-medium w-16">Lot</th>
                    <th className="px-3 py-2 text-left font-medium">Owner</th>
                    <th className="px-3 py-2 text-left font-medium w-40">Type</th>
                    <th className="px-3 py-2 text-left font-medium w-44">Amount</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, idx) => {
                    const lot = lotByNumber.get(row.lot_number);
                    return (
                      <tr key={`${row.lot_number}-${idx}`}>
                        <td className="px-3 py-1.5 tabular-nums">{row.lot_number}</td>
                        <td className="px-3 py-1.5 text-muted-foreground truncate">{lot?.owner_name || "—"}</td>
                        <td className="px-3 py-1.5">
                          <div className="inline-flex rounded-md border border-border bg-card p-0.5">
                            <button
                              type="button"
                              onClick={() => updateRow(idx, { isCredit: false })}
                              className={`px-2.5 py-0.5 text-xs rounded-sm cursor-pointer ${!row.isCredit ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
                            >
                              Debit
                            </button>
                            <button
                              type="button"
                              onClick={() => updateRow(idx, { isCredit: true })}
                              className={`px-2.5 py-0.5 text-xs rounded-sm cursor-pointer ${row.isCredit ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
                            >
                              Credit
                            </button>
                          </div>
                        </td>
                        <td className="px-3 py-1.5">
                          <NumberInput
                            thousandsSeparator
                            prefix="$"
                            value={row.amount}
                            onChange={(v) => updateRow(idx, { amount: v })}
                            className="h-8"
                            placeholder="Amount"
                          />
                        </td>
                        <td className="px-3 py-1.5 text-right">
                          <button
                            type="button"
                            onClick={() => removeRow(idx)}
                            className="text-muted-foreground hover:text-destructive cursor-pointer"
                            aria-label="Remove row"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {remainingLots.length > 0 && (
            <div className="flex items-center gap-2">
              <Select value={picker || undefined} onValueChange={(v) => setPicker(v ?? "")}>
                <SelectTrigger className="w-72 h-9">
                  <SelectValue placeholder="Pick a lot…" />
                </SelectTrigger>
                <SelectContent>
                  {remainingLots.map((l) => (
                    <SelectItem key={l.lot_number} value={String(l.lot_number)}>
                      Lot {l.lot_number} — {l.owner_name || "—"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button type="button" variant="secondary" size="sm" onClick={addArrearsRow}>
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Add lot with opening arrears
              </Button>
            </div>
          )}
        </div>

        <div className="flex justify-between pt-2">
          <Button type="button" variant="secondary" onClick={onBack}>Back</Button>
          <Button type="button" onClick={onCreate} disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            Create OC
          </Button>
        </div>
      </div>
    </TooltipProvider>
  );
}
