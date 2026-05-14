"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NumberInput } from "@/components/ui/number-input";
import { DatePicker } from "@/components/shared/date-picker";
import { saveStep, completeWizard, type DraftJson, type DraftLot } from "../actions";

export function Page8Balances({
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
  // No date prefill — managers must set the handover date explicitly. The
  // ledger anchors everything to this date, so we don't want a silent default
  // of "today" persisting because the manager skimmed past the field.
  const [date, setDate] = useState(initialDraft.opening_balance_date ?? "");
  // Fund balances can be negative (rare but legal — overdrawn admin float). We
  // hold them as strings so empty is distinct from 0; sign is set by typing a
  // leading "-".
  const [admin, setAdmin] = useState<string>(
    initialDraft.opening_admin_balance != null ? String(initialDraft.opening_admin_balance) : "",
  );
  const [capital, setCapital] = useState<string>(
    initialDraft.opening_capital_works_balance != null ? String(initialDraft.opening_capital_works_balance) : "",
  );
  // `has_maintenance_plan_fund` was decided on page 5 — read-only here.
  const hasMaintenance = initialDraft.has_maintenance_plan_fund ?? false;
  const [maintenance, setMaintenance] = useState<string>(
    initialDraft.opening_maintenance_plan_balance != null
      ? String(initialDraft.opening_maintenance_plan_balance)
      : "",
  );

  // Per-lot opening arrears.
  const initialLots: DraftLot[] = initialDraft.lots ?? [];
  const [lots, setLots] = useState<DraftLot[]>(initialLots);
  // UI-only: tracks whether each row's pill is on Credit (true) or Debit
  // (false). Initially derived from the saved sign. Decoupling it from the
  // numeric value lets the user pick Credit on an empty cell and have it
  // stick once they type a number.
  const [creditByRow, setCreditByRow] = useState<Record<number, boolean>>(() => {
    const init: Record<number, boolean> = {};
    initialLots.forEach((l, i) => {
      init[i] = (Number(l.opening_balance) || 0) < 0;
    });
    return init;
  });

  const [adminInvalid, setAdminInvalid] = useState(false);
  const [capitalInvalid, setCapitalInvalid] = useState(false);
  const [maintenanceInvalid, setMaintenanceInvalid] = useState(false);
  const [dateInvalid, setDateInvalid] = useState(false);
  const [pending, setPending] = useState(false);

  const totalArrears = useMemo(
    () => lots.reduce((s, l) => s + (Number(l.opening_balance) || 0), 0),
    [lots],
  );

  function updateLotBalance(idx: number, v: string) {
    setLots((prev) => prev.map((l, i) => i === idx ? { ...l, opening_balance: parseFloat(v) || 0 } : l));
  }

  // Opening balances can legitimately be negative — an OC that took a loan or
  // ran an overdrawn admin float at takeover. parseFloat handles the sign.
  function parseMoney(s: string): number | null {
    if (!s.trim()) return null;
    const n = parseFloat(s.replace(/[$,\s]/g, ""));
    return Number.isFinite(n) ? n : NaN as unknown as number;
  }

  async function onCreate() {
    const problems: string[] = [];
    const adminN = parseMoney(admin);
    const capitalN = parseMoney(capital);
    const maintN = hasMaintenance ? parseMoney(maintenance) : null;

    if (adminN === null || Number.isNaN(adminN)) {
      problems.push("Opening admin fund balance is required");
      setAdminInvalid(true);
    } else { setAdminInvalid(false); }
    if (capitalN === null || Number.isNaN(capitalN)) {
      problems.push("Opening capital works balance is required");
      setCapitalInvalid(true);
    } else { setCapitalInvalid(false); }
    if (hasMaintenance && (maintN === null || Number.isNaN(maintN))) {
      problems.push("Opening maintenance plan fund balance is required");
      setMaintenanceInvalid(true);
    } else { setMaintenanceInvalid(false); }
    if (!date) {
      problems.push("Opening balance date is required");
      setDateInvalid(true);
    } else {
      setDateInvalid(false);
    }

    if (problems.length) {
      toast.error(problems.length === 1 ? problems[0] : "Fix the highlighted fields.");
      return;
    }

    setPending(true);
    const r = await saveStep(draftId, {
      // Final step; current_step bumps to 8 so a resumed draft lands here.
      opening_balance_date: date,
      opening_admin_balance: adminN ?? 0,
      opening_capital_works_balance: capitalN ?? 0,
      opening_maintenance_plan_balance: hasMaintenance ? (maintN ?? 0) : undefined,
      lots,
    }, 8);
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
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-lg font-semibold text-foreground">Opening balances</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          The starting position as at handover date. Everything from here is tracked forward —
          we don&apos;t back-reconcile historical statements.
        </p>
      </div>

      {/* Date */}
      <div className="space-y-1.5">
        <Label>
          Opening balance date <span className="text-destructive">*</span>
        </Label>
        <DatePicker
          value={date}
          onChange={(v) => { setDate(v); if (dateInvalid) setDateInvalid(false); }}
          error={dateInvalid}
        />
        <p className="text-xs text-muted-foreground">
          Usually the day you took over management. Balances and lot arrears are as at this date.
        </p>
      </div>

      {/* Fund balances */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Fund balances</h3>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="admin-bal">
              Administrative fund <span className="text-destructive">*</span>
            </Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
              <NumberInput
                id="admin-bal"
                placeholder="Opening balance"
                allowNegative
                value={admin}
                onChange={(v) => { setAdmin(v); if (adminInvalid) setAdminInvalid(false); }}
                invalid={adminInvalid}
                className="pl-7"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cap-bal">
              Capital works fund <span className="text-destructive">*</span>
            </Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
              <NumberInput
                id="cap-bal"
                placeholder="Opening balance"
                allowNegative
                value={capital}
                onChange={(v) => { setCapital(v); if (capitalInvalid) setCapitalInvalid(false); }}
                invalid={capitalInvalid}
                className="pl-7"
              />
            </div>
          </div>
        </div>

        {/* Maintenance plan opening balance — toggle lives on page 5; this
            section only renders when the wizard already knows the OC has a
            maintenance fund. */}
        {hasMaintenance && (
          <div className="space-y-1.5">
            <Label htmlFor="maint-bal">
              Maintenance plan fund <span className="text-destructive">*</span>
            </Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
              <NumberInput
                id="maint-bal"
                placeholder="Opening balance"
                allowNegative
                value={maintenance}
                onChange={(v) => { setMaintenance(v); if (maintenanceInvalid) setMaintenanceInvalid(false); }}
                invalid={maintenanceInvalid}
                className="pl-7"
              />
            </div>
          </div>
        )}
      </div>

      {/* Per-lot opening arrears.
          The credit/debit picker is sticky per-row: a UI state that controls
          the sign applied to the typed amount on save. Previously the type
          was inferred from `opening_balance < 0`, which couldn't flip while
          the amount was still 0 (-0 === 0). `creditByRow` lets the manager
          pick Credit on an empty row and have it stick once they type a
          number. */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Per-lot opening arrears</h3>
          <span
            className={`text-xs tabular-nums ${totalArrears > 0 ? "text-destructive" : totalArrears < 0 ? "text-green-700" : "text-muted-foreground"}`}
          >
            Total: ${totalArrears.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
        <div className="rounded-md border border-border bg-muted/40 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-card text-muted-foreground">
              <tr className="text-xs uppercase tracking-wide border-b border-border">
                <th className="px-3 py-2 text-left font-medium w-16">Lot</th>
                <th className="px-3 py-2 text-left font-medium">Owner</th>
                <th className="px-3 py-2 text-left font-medium w-40">Type</th>
                <th className="px-3 py-2 text-left font-medium w-44">Amount</th>
              </tr>
            </thead>
            <tbody>
              {lots.map((lot, idx) => {
                const bal = Number(lot.opening_balance) || 0;
                const isCredit = creditByRow[idx] ?? (bal < 0);
                const absStr = Math.abs(bal) === 0 ? "" : String(Math.abs(bal));
                function setAmount(absVal: string) {
                  const n = parseFloat(absVal) || 0;
                  updateLotBalance(idx, String(isCredit ? -n : n));
                }
                function setType(toCredit: boolean) {
                  setCreditByRow((prev) => ({ ...prev, [idx]: toCredit }));
                  const cur = Math.abs(Number(lot.opening_balance) || 0);
                  if (cur > 0) updateLotBalance(idx, String(toCredit ? -cur : cur));
                }
                return (
                  <tr key={idx} className="border-t border-border">
                    <td className="px-3 py-1.5 tabular-nums">{lot.lot_number}</td>
                    <td className="px-3 py-1.5 text-muted-foreground truncate">{lot.owner_name || "—"}</td>
                    <td className="px-3 py-1.5">
                      <div className="inline-flex rounded-md border border-border bg-card p-0.5">
                        <button
                          type="button"
                          onClick={() => setType(false)}
                          className={`px-2.5 py-0.5 text-xs rounded-sm cursor-pointer ${!isCredit ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
                        >
                          Debit
                        </button>
                        <button
                          type="button"
                          onClick={() => setType(true)}
                          className={`px-2.5 py-0.5 text-xs rounded-sm cursor-pointer ${isCredit ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
                        >
                          Credit
                        </button>
                      </div>
                    </td>
                    <td className="px-3 py-1.5">
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
                        <NumberInput
                          value={absStr}
                          onChange={setAmount}
                          className="h-8 pl-7"
                          placeholder="Amount"
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Macquarie next-step note */}
      {initialDraft.bank_provider === "macquarie_deft" && (
        <div className="rounded-md border border-blue-200 bg-blue-50 p-3">
          <div className="flex items-start gap-2">
            <Info className="mt-0.5 h-4 w-4 text-blue-700 shrink-0" />
            <p className="text-xs text-blue-900">
              After you click <strong>Create OC</strong>, you&apos;ll be prompted to upload the
              DEFT Reference Number (DRN) export CSV from Macquarie Business Online. This maps each
              lot to its DRN so incoming TXN-file transactions auto-allocate.
            </p>
          </div>
        </div>
      )}

      <div className="flex justify-between pt-2">
        <Button type="button" variant="ghost" onClick={onBack}>Back</Button>
        <Button type="button" onClick={onCreate} disabled={pending}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          Create OC
        </Button>
      </div>
    </div>
  );
}
