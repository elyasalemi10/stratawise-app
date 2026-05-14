"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Info, Loader2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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
      // Per-lot arrears are persisted by Step 4 (Lots) now — page 8 only
      // owns the per-OC fund balances + opening date.
      opening_balance_date: date,
      opening_admin_balance: adminN ?? 0,
      opening_capital_works_balance: capitalN ?? 0,
      opening_maintenance_plan_balance: hasMaintenance ? (maintN ?? 0) : undefined,
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
      </div>

      {/* Per-fund opening balances. The "Fund balances" header was removed
          — the field labels carry the meaning, the heading was repetitive. */}
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="admin-bal">
              Administrative fund <span className="text-destructive">*</span>
            </Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
              <NumberInput
                thousandsSeparator
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
                thousandsSeparator
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
                thousandsSeparator
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
          - Debit = the lot OWES the OC (positive arrears, the common case)
          - Credit = the OC OWES the lot (e.g. overpaid in the previous
            management's books, or a refund pending)
          Per-lot arrears were merged into Step 4 (Lots) in the May refresh
          — the manager fills lot + owner + arrears on one screen instead
          of scrolling back and forth between two tables. The page-8 step
          now only carries the per-OC fund balances. */}

      <div className="rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
        <p>
          Per-lot opening arrears were captured on <strong className="text-foreground">Step 4 (Lots)</strong>.
          {" "}Running total across all lots: <strong className="text-foreground tabular-nums">
            ${totalArrears.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </strong>.
        </p>
      </div>

      {/* The Macquarie post-create note used to live here. Now that DRN
          CSV upload happens inline on Page 5, there's nothing to surface
          here — the mappings are staged in the draft and write out when
          Create OC fires. */}

      <div className="flex justify-between pt-2">
        <Button type="button" variant="secondary" onClick={onBack}>Back</Button>
        <Button type="button" onClick={onCreate} disabled={pending}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          Create OC
        </Button>
      </div>
    </div>
  );
}
