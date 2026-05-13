"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, Info, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { DatePicker } from "@/components/shared/date-picker";
import { saveStep, completeWizard, type DraftJson, type DraftLot } from "../actions";

function tierForLotCount(n: number, servicesOnly: boolean): number {
  if (servicesOnly) return 5;
  if (n >= 100) return 1;
  if (n >= 51) return 2;
  if (n >= 10) return 3;
  if (n >= 3) return 4;
  return 5;
}

export function Page6Balances({
  draftId,
  initialDraft,
  totalLots,
  servicesOnly,
  onBack,
  onComplete,
}: {
  draftId: string;
  initialDraft: DraftJson;
  totalLots: number;
  servicesOnly: boolean;
  onBack: () => void;
  onComplete: (ocCode: string) => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const tier = useMemo(() => tierForLotCount(totalLots, servicesOnly), [totalLots, servicesOnly]);
  const isTier1or2 = tier <= 2;

  const [date, setDate] = useState(initialDraft.opening_balance_date ?? today);
  const [admin, setAdmin] = useState<string>(
    initialDraft.opening_admin_balance != null ? String(initialDraft.opening_admin_balance) : "",
  );
  const [capital, setCapital] = useState<string>(
    initialDraft.opening_capital_works_balance != null ? String(initialDraft.opening_capital_works_balance) : "",
  );
  // Tier 1/2 = mandatory, default on. Tier 3-5 = optional, default off.
  const [hasMaintenance, setHasMaintenance] = useState<boolean>(
    initialDraft.has_maintenance_plan_fund ?? isTier1or2,
  );
  const [maintenance, setMaintenance] = useState<string>(
    initialDraft.opening_maintenance_plan_balance != null
      ? String(initialDraft.opening_maintenance_plan_balance)
      : "",
  );

  // Per-lot opening arrears.
  const initialLots: DraftLot[] = initialDraft.lots ?? [];
  const [lots, setLots] = useState<DraftLot[]>(initialLots);

  const [adminInvalid, setAdminInvalid] = useState(false);
  const [capitalInvalid, setCapitalInvalid] = useState(false);
  const [maintenanceInvalid, setMaintenanceInvalid] = useState(false);
  const [pending, setPending] = useState(false);

  const totalArrears = useMemo(
    () => lots.reduce((s, l) => s + (Number(l.opening_balance) || 0), 0),
    [lots],
  );

  function updateLotBalance(idx: number, v: string) {
    setLots((prev) => prev.map((l, i) => i === idx ? { ...l, opening_balance: parseFloat(v) || 0 } : l));
  }

  function parseMoney(s: string): number | null {
    if (!s.trim()) return null;
    const n = parseFloat(s.replace(/[$,\s]/g, ""));
    return Number.isFinite(n) && n >= 0 ? n : NaN as unknown as number;
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
    if (!date) problems.push("Opening balance date is required");

    if (problems.length) {
      toast.error(problems.length === 1 ? problems[0] : "Fix the highlighted fields.");
      return;
    }

    setPending(true);
    const r = await saveStep(draftId, {
      opening_balance_date: date,
      opening_admin_balance: adminN ?? 0,
      opening_capital_works_balance: capitalN ?? 0,
      has_maintenance_plan_fund: hasMaintenance,
      opening_maintenance_plan_balance: hasMaintenance ? (maintN ?? 0) : undefined,
      lots,
    }, 6);
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
    onComplete(result.ocCode);
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
        <DatePicker value={date} onChange={setDate} />
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
              <Input
                id="admin-bal"
                inputMode="decimal"
                placeholder="0.00"
                value={admin}
                onChange={(e) => { setAdmin(e.target.value); if (adminInvalid) setAdminInvalid(false); }}
                aria-invalid={adminInvalid || undefined}
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
              <Input
                id="cap-bal"
                inputMode="decimal"
                placeholder="0.00"
                value={capital}
                onChange={(e) => { setCapital(e.target.value); if (capitalInvalid) setCapitalInvalid(false); }}
                aria-invalid={capitalInvalid || undefined}
                className="pl-7"
              />
            </div>
          </div>
        </div>

        {/* Maintenance plan fund */}
        <div className="rounded-md border border-border bg-card p-4 space-y-3">
          <div className="flex items-start gap-2">
            <Checkbox
              id="has-maintenance"
              checked={hasMaintenance}
              onCheckedChange={(v) => setHasMaintenance(v === true)}
              disabled={isTier1or2}
            />
            <div className="flex-1">
              <Label htmlFor="has-maintenance" className="text-sm font-medium cursor-pointer">
                This OC has a maintenance plan fund
                {isTier1or2 && (
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    (mandatory for Tier {tier})
                  </span>
                )}
              </Label>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Tier 1 and Tier 2 OCs must hold a separate reserve aligned to their 10-year maintenance plan.
                Tier 3–5 OCs may opt in.
              </p>
            </div>
          </div>
          {hasMaintenance && (
            <div className="space-y-1.5">
              <Label htmlFor="maint-bal">
                Maintenance plan fund <span className="text-destructive">*</span>
              </Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                <Input
                  id="maint-bal"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={maintenance}
                  onChange={(e) => { setMaintenance(e.target.value); if (maintenanceInvalid) setMaintenanceInvalid(false); }}
                  aria-invalid={maintenanceInvalid || undefined}
                  className="pl-7"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Per-lot opening arrears */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Per-lot opening arrears</h3>
            <p className="text-xs text-muted-foreground">
              Optional. Positive = lot owes the OC; negative = OC owes the lot (credit).
            </p>
          </div>
          <span
            className={`text-xs tabular-nums ${totalArrears > 0 ? "text-destructive" : totalArrears < 0 ? "text-green-700" : "text-muted-foreground"}`}
          >
            Total: ${totalArrears.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
        <div className="rounded-md border border-border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr className="text-xs uppercase tracking-wide">
                <th className="px-3 py-2 text-left font-medium">Lot #</th>
                <th className="px-3 py-2 text-left font-medium">Owner</th>
                <th className="px-3 py-2 text-right font-medium">Opening arrears</th>
              </tr>
            </thead>
            <tbody>
              {lots.map((lot, idx) => (
                <tr key={idx} className="border-t border-border">
                  <td className="px-3 py-1.5 tabular-nums">{lot.lot_number}</td>
                  <td className="px-3 py-1.5 text-muted-foreground">{lot.owner_name || "—"}</td>
                  <td className="px-3 py-1.5 text-right">
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
                      <Input
                        type="number"
                        step="0.01"
                        inputMode="decimal"
                        value={lot.opening_balance ?? ""}
                        onChange={(e) => updateLotBalance(idx, e.target.value)}
                        className="h-8 pl-7 text-right"
                        placeholder="0.00"
                      />
                    </div>
                  </td>
                </tr>
              ))}
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

      {!initialDraft.opening_balance_date && lots.length > 0 && totalArrears === 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-600 shrink-0" />
            <p className="text-xs text-amber-900">
              Leave lot arrears blank if you&apos;re starting fresh. Existing arrears can be added
              later from each lot&apos;s manage page.
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
