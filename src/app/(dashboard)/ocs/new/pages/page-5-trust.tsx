"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Info, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { BankSelect } from "@/components/shared/bank-select";
import { saveStep, type DraftJson } from "../actions";

// Common AU BSB prefixes → bank name. Not exhaustive — covers ~95% of real
// trust-account openings. Full table (~2k entries) deferred.
const BSB_PREFIXES: Record<string, string> = {
  "01": "ANZ", "03": "Westpac", "06": "CBA", "08": "NAB",
  "18": "Macquarie Bank", "63": "Bendigo Bank",
  "73": "Westpac", "76": "Westpac",
};

function tierForLotCount(n: number, servicesOnly: boolean): number {
  if (servicesOnly) return 5;
  if (n >= 100) return 1;
  if (n >= 51) return 2;
  if (n >= 10) return 3;
  if (n >= 3) return 4;
  return 5;
}
function lookupBank(bsb: string): string | null {
  const digits = bsb.replace(/\D/g, "");
  if (digits.length < 2) return null;
  return BSB_PREFIXES[digits.slice(0, 2)] ?? null;
}
function formatBsb(input: string): string {
  const d = input.replace(/\D/g, "").slice(0, 6);
  return d.length <= 3 ? d : `${d.slice(0, 3)}-${d.slice(3)}`;
}
function isValidBsb(s: string): boolean {
  return s.replace(/\D/g, "").length === 6;
}
function isValidAccountNumber(s: string): boolean {
  return /^\d{6,9}$/.test(s.replace(/\D/g, ""));
}

// Single-fund inputs. Defined at module scope so React doesn't unmount the
// children on every parent render — that's what was stealing focus on every
// keystroke (item 20: BSB / account-number boxes pushing the cursor out).

type FundFields = {
  bankId: string;
  accountName: string;
  bsb: string;
  accountNumber: string;
};

interface FundFieldsProps {
  value: FundFields;
  onChange: (next: FundFields) => void;
  invalid: { bank: boolean; name: boolean; bsb: boolean; acc: boolean };
  idPrefix: string;
}

function FundFieldsBlock({ value, onChange, invalid, idPrefix }: FundFieldsProps) {
  const detected = useMemo(() => lookupBank(value.bsb), [value.bsb]);
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-bank`}>
          Bank <span className="text-destructive">*</span>
        </Label>
        <BankSelect
          id={`${idPrefix}-bank`}
          value={value.bankId}
          onChange={(v) => onChange({ ...value, bankId: v })}
          error={invalid.bank}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-name`}>
          Account name <span className="text-destructive">*</span>
        </Label>
        <Input
          id={`${idPrefix}-name`}
          value={value.accountName}
          onChange={(e) => onChange({ ...value, accountName: e.target.value })}
          aria-invalid={invalid.name || undefined}
        />
      </div>
      <div className="grid grid-cols-[180px_1fr] gap-3">
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-bsb`}>
            BSB <span className="text-destructive">*</span>
          </Label>
          <Input
            id={`${idPrefix}-bsb`}
            placeholder="XXX-XXX"
            value={value.bsb}
            onChange={(e) => onChange({ ...value, bsb: formatBsb(e.target.value) })}
            inputMode="numeric"
            maxLength={7}
            aria-invalid={invalid.bsb || undefined}
          />
          {detected && <p className="text-xs text-muted-foreground">Matches {detected}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-acc`}>
            Account number <span className="text-destructive">*</span>
          </Label>
          <Input
            id={`${idPrefix}-acc`}
            placeholder="12345678"
            value={value.accountNumber}
            onChange={(e) => onChange({ ...value, accountNumber: e.target.value.replace(/\D/g, "").slice(0, 9) })}
            inputMode="numeric"
            aria-invalid={invalid.acc || undefined}
          />
        </div>
      </div>
    </div>
  );
}

interface InvalidFlags { bank: boolean; name: boolean; bsb: boolean; acc: boolean }
const NO_INVALID: InvalidFlags = { bank: false, name: false, bsb: false, acc: false };

export function Page5Trust({
  draftId,
  initialDraft,
  ocName,
  totalLots,
  onBack,
  onNext,
}: {
  draftId: string;
  initialDraft: DraftJson;
  ocName: string;
  totalLots: number;
  onBack: () => void;
  onNext: () => void;
}) {
  const tier = tierForLotCount(totalLots, initialDraft.services_only ?? false);
  const isTier1or2 = tier <= 2;

  const [admin, setAdmin] = useState<FundFields>({
    bankId: initialDraft.admin_bank_id ?? "",
    accountName: initialDraft.admin_account_name ?? (ocName ? `${ocName} Trust Account` : ""),
    bsb: initialDraft.admin_bsb ?? "",
    accountNumber: initialDraft.admin_account_number ?? "",
  });

  const [capitalSameAsAdmin, setCapitalSameAsAdmin] = useState<boolean>(
    initialDraft.capital_same_as_admin ?? true,
  );
  const [capital, setCapital] = useState<FundFields>({
    bankId: initialDraft.capital_bank_id ?? "",
    accountName: initialDraft.capital_account_name ?? (ocName ? `${ocName} Capital Works Trust Account` : ""),
    bsb: initialDraft.capital_bsb ?? "",
    accountNumber: initialDraft.capital_account_number ?? "",
  });

  // Tier 1/2 mandates a maintenance plan fund; force it on for those tiers.
  // Tier 3-5 can opt in via the toggle.
  const [hasMaintenance, setHasMaintenance] = useState<boolean>(
    initialDraft.has_maintenance_plan_fund ?? isTier1or2,
  );
  const [maintenanceSameAsAdmin, setMaintenanceSameAsAdmin] = useState<boolean>(
    initialDraft.maintenance_same_as_admin ?? true,
  );
  const [maintenance, setMaintenance] = useState<FundFields>({
    bankId: initialDraft.maintenance_bank_id ?? "",
    accountName: initialDraft.maintenance_account_name ?? (ocName ? `${ocName} Maintenance Plan Trust Account` : ""),
    bsb: initialDraft.maintenance_bsb ?? "",
    accountNumber: initialDraft.maintenance_account_number ?? "",
  });

  const [adminInvalid, setAdminInvalid] = useState<InvalidFlags>(NO_INVALID);
  const [capitalInvalid, setCapitalInvalid] = useState<InvalidFlags>(NO_INVALID);
  const [maintenanceInvalid, setMaintenanceInvalid] = useState<InvalidFlags>(NO_INVALID);
  const [pending, setPending] = useState(false);

  function validateFund(f: FundFields): InvalidFlags {
    return {
      bank: !f.bankId,
      name: f.accountName.trim().length < 2,
      bsb: !isValidBsb(f.bsb),
      acc: !isValidAccountNumber(f.accountNumber),
    };
  }

  function onContinue() {
    const problems: string[] = [];
    const adminFlags = validateFund(admin);
    if (Object.values(adminFlags).some(Boolean)) problems.push("Admin fund details");
    setAdminInvalid(adminFlags);

    let capFlags: InvalidFlags = NO_INVALID;
    if (!capitalSameAsAdmin) {
      capFlags = validateFund(capital);
      if (Object.values(capFlags).some(Boolean)) problems.push("Capital works fund details");
    }
    setCapitalInvalid(capFlags);

    let mFlags: InvalidFlags = NO_INVALID;
    if (hasMaintenance && !maintenanceSameAsAdmin) {
      mFlags = validateFund(maintenance);
      if (Object.values(mFlags).some(Boolean)) problems.push("Maintenance plan fund details");
    }
    setMaintenanceInvalid(mFlags);

    // Item 21: no two ACTIVE funds may share a (BSB, account) unless they're
    // explicitly tied to admin via the "same as admin" toggle. This catches a
    // user typing the same BSB+account into two separate independent funds.
    const pairs: Array<{ label: string; bsb: string; acc: string }> = [
      { label: "admin", bsb: admin.bsb, acc: admin.accountNumber },
    ];
    if (!capitalSameAsAdmin) pairs.push({ label: "capital works", bsb: capital.bsb, acc: capital.accountNumber });
    if (hasMaintenance && !maintenanceSameAsAdmin) pairs.push({ label: "maintenance plan", bsb: maintenance.bsb, acc: maintenance.accountNumber });
    const seen = new Map<string, string>();
    for (const p of pairs) {
      if (!p.bsb || !p.acc) continue;
      const key = `${p.bsb}|${p.acc}`;
      const dup = seen.get(key);
      if (dup) {
        problems.push(`Same BSB + account number used by both ${dup} and ${p.label}. Use the "same account as admin" toggle instead.`);
        break;
      }
      seen.set(key, p.label);
    }

    if (problems.length) {
      toast.error(problems.length === 1 ? problems[0] : "Fix the highlighted fields.");
      return;
    }

    setPending(true);
    void (async () => {
      const r = await saveStep(draftId, {
        bank_provider: admin.bankId === "macquarie" ? "macquarie_deft" : "other_csv",
        has_maintenance_plan_fund: hasMaintenance,
        admin_bank_id: admin.bankId,
        admin_account_name: admin.accountName.trim(),
        admin_bsb: admin.bsb,
        admin_account_number: admin.accountNumber,
        capital_same_as_admin: capitalSameAsAdmin,
        capital_bank_id: capitalSameAsAdmin ? undefined : capital.bankId,
        capital_account_name: capitalSameAsAdmin ? undefined : capital.accountName.trim(),
        capital_bsb: capitalSameAsAdmin ? undefined : capital.bsb,
        capital_account_number: capitalSameAsAdmin ? undefined : capital.accountNumber,
        maintenance_same_as_admin: maintenanceSameAsAdmin,
        maintenance_bank_id: !hasMaintenance || maintenanceSameAsAdmin ? undefined : maintenance.bankId,
        maintenance_account_name: !hasMaintenance || maintenanceSameAsAdmin ? undefined : maintenance.accountName.trim(),
        maintenance_bsb: !hasMaintenance || maintenanceSameAsAdmin ? undefined : maintenance.bsb,
        maintenance_account_number: !hasMaintenance || maintenanceSameAsAdmin ? undefined : maintenance.accountNumber,
      }, 6);
      setPending(false);
      if (r.error) {
        toast.error(r.error);
        return;
      }
      onNext();
    })();
  }

  const macquarieSelected = admin.bankId === "macquarie";

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-lg font-semibold text-foreground">Trust accounts</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          The OC&apos;s funds — separate from your management company&apos;s operating account.
          The admin fund is always present; capital works and (optionally) maintenance plan
          can share the same account or use their own.
        </p>
      </div>

      {/* Admin fund. */}
      <div className="rounded-md border border-border bg-card p-4 space-y-3">
        <div className="flex items-baseline justify-between">
          <h3 className="text-sm font-semibold text-foreground">Administrative fund</h3>
          <span className="text-xs text-muted-foreground">Always present</span>
        </div>
        <FundFieldsBlock
          value={admin}
          onChange={(v) => { setAdmin(v); setAdminInvalid(NO_INVALID); }}
          invalid={adminInvalid}
          idPrefix="admin"
        />
      </div>

      {/* Capital works fund. */}
      <div className="rounded-md border border-border bg-card p-4 space-y-3">
        <div className="flex items-baseline justify-between">
          <h3 className="text-sm font-semibold text-foreground">Capital works fund</h3>
        </div>
        <div className="flex items-center gap-3">
          <Checkbox
            id="capital-same"
            checked={capitalSameAsAdmin}
            onCheckedChange={(v) => setCapitalSameAsAdmin(v === true)}
          />
          <Label className="text-sm font-normal text-foreground">
            Use the same trust account as the admin fund
          </Label>
        </div>
        {!capitalSameAsAdmin && (
          <FundFieldsBlock
            value={capital}
            onChange={(v) => { setCapital(v); setCapitalInvalid(NO_INVALID); }}
            invalid={capitalInvalid}
            idPrefix="capital"
          />
        )}
      </div>

      {/* Maintenance plan fund (optional toggle; forced for Tier 1/2). */}
      <div className="rounded-md border border-border bg-card p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Maintenance plan fund</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {isTier1or2
                ? `Mandatory for Tier ${tier}.`
                : "Optional reserve aligned to a long-term maintenance plan."}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="has-maintenance"
              checked={hasMaintenance}
              onCheckedChange={(v) => setHasMaintenance(v === true)}
              disabled={isTier1or2}
            />
            <Label className="text-sm font-normal text-foreground">
              This OC has a maintenance plan fund
            </Label>
          </div>
        </div>
        {hasMaintenance && (
          <>
            <div className="flex items-center gap-3 border-t border-border pt-3">
              <Checkbox
                id="maintenance-same"
                checked={maintenanceSameAsAdmin}
                onCheckedChange={(v) => setMaintenanceSameAsAdmin(v === true)}
              />
              <Label className="text-sm font-normal text-foreground">
                Use the same trust account as the admin fund
              </Label>
            </div>
            {!maintenanceSameAsAdmin && (
              <FundFieldsBlock
                value={maintenance}
                onChange={(v) => { setMaintenance(v); setMaintenanceInvalid(NO_INVALID); }}
                invalid={maintenanceInvalid}
                idPrefix="maintenance"
              />
            )}
          </>
        )}
      </div>

      {/* Macquarie DEFT info banner — keyed off admin fund's bank. */}
      {macquarieSelected && (
        <div className="rounded-md border border-green-200 bg-green-50 p-3">
          <div className="flex items-start gap-2">
            <Info className="mt-0.5 h-4 w-4 text-green-700 shrink-0" />
            <div className="text-xs text-green-900">
              Macquarie&apos;s DEFT system tags every incoming transaction with the payer&apos;s
              <strong> DEFT Reference Number</strong>. You&apos;ll upload your DRN export CSV
              from Macquarie Business Online after setup, and we&apos;ll auto-allocate
              transactions from the TXN/PAY files you import each week.
            </div>
          </div>
        </div>
      )}

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
