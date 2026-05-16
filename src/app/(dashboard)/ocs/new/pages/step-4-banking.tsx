"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { BankSelect } from "@/components/shared/bank-select";
import { saveStep, type DraftJson } from "../actions";
import { WizardActions } from "./_components/wizard-actions";

// Wizard Step 4 — Banking.
//
// Per-fund trust account details. Admin fund is always present. Capital
// works + (optional) Maintenance plan can either share the admin fund's
// account or have their own.
//
// Macquarie DEFT panel (DRN CSV import) lives in OC Settings post-creation;
// not captured by the new wizard.

const BSB_PREFIXES: Record<string, string> = {
  "01": "ANZ", "03": "Westpac", "06": "CBA", "08": "NAB",
  "18": "Macquarie Bank", "63": "Bendigo Bank",
  "73": "Westpac", "76": "Westpac",
};

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

type FundFields = {
  bankId: string;
  accountName: string;
  bsb: string;
  accountNumber: string;
};

interface InvalidFlags { bank: boolean; name: boolean; bsb: boolean; acc: boolean }
const NO_INVALID: InvalidFlags = { bank: false, name: false, bsb: false, acc: false };

interface FundFieldsProps {
  value: FundFields;
  onChange: (next: FundFields) => void;
  invalid: InvalidFlags;
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
          placeholder="Account name as it appears on bank statements"
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
            placeholder="6-digit BSB"
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
            placeholder="Bank account number"
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

export function Step4Banking({
  draftId,
  initialDraft,
  totalLots,
  onBack,
  onNext,
}: {
  draftId: string;
  initialDraft: DraftJson;
  totalLots: number;
  onBack: () => void;
  onNext: () => void;
}) {
  // Tier-1/2 mandates a maintenance plan fund (force on, disable the toggle).
  // Tier 3-5 default OFF; manager can opt in.
  const tier = initialDraft.tier ?? 5;
  const isTier1or2 = tier <= 2;

  const legacyAutoName = /^Owners Corporation\s+PS\d{6}[A-Z]\s+Trust Account$/i;
  const stripLegacy = (s: string | undefined) =>
    s && legacyAutoName.test(s.trim()) ? "" : (s ?? "");

  const [admin, setAdmin] = useState<FundFields>({
    bankId: initialDraft.admin_bank_id ?? "",
    accountName: stripLegacy(initialDraft.admin_account_name),
    bsb: initialDraft.admin_bsb ?? "",
    accountNumber: initialDraft.admin_account_number ?? "",
  });

  const [capitalSameAsAdmin, setCapitalSameAsAdmin] = useState<boolean>(
    initialDraft.capital_same_as_admin ?? true,
  );
  const [capital, setCapital] = useState<FundFields>({
    bankId: initialDraft.capital_bank_id ?? "",
    accountName: stripLegacy(initialDraft.capital_account_name),
    bsb: initialDraft.capital_bsb ?? "",
    accountNumber: initialDraft.capital_account_number ?? "",
  });

  const [hasMaintenance, setHasMaintenance] = useState<boolean>(
    initialDraft.has_maintenance_plan_fund ?? isTier1or2,
  );
  const [maintenanceSameAsAdmin, setMaintenanceSameAsAdmin] = useState<boolean>(
    initialDraft.maintenance_same_as_admin ?? true,
  );
  const [maintenance, setMaintenance] = useState<FundFields>({
    bankId: initialDraft.maintenance_bank_id ?? "",
    accountName: stripLegacy(initialDraft.maintenance_account_name),
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
      name: f.accountName.trim().length < 1,
      bsb: !isValidBsb(f.bsb),
      acc: !isValidAccountNumber(f.accountNumber),
    };
  }

  function onContinue() {
    const problems: string[] = [];
    const adminFlags = validateFund(admin);
    if (Object.values(adminFlags).some(Boolean)) problems.push("Admin fund details");

    let capFlags: InvalidFlags = NO_INVALID;
    if (!capitalSameAsAdmin) {
      capFlags = validateFund(capital);
      if (Object.values(capFlags).some(Boolean)) problems.push("Capital works fund details");
    }

    let mFlags: InvalidFlags = NO_INVALID;
    if (hasMaintenance && !maintenanceSameAsAdmin) {
      mFlags = validateFund(maintenance);
      if (Object.values(mFlags).some(Boolean)) problems.push("Maintenance plan fund details");
    }

    // Duplicate (BSB, account) across two ACTIVE funds = error.
    type Slot = "admin" | "capital" | "maintenance";
    const pairs: Array<{ slot: Slot; label: string; bsb: string; acc: string }> = [
      { slot: "admin", label: "admin", bsb: admin.bsb, acc: admin.accountNumber },
    ];
    if (!capitalSameAsAdmin) pairs.push({ slot: "capital", label: "capital works", bsb: capital.bsb, acc: capital.accountNumber });
    if (hasMaintenance && !maintenanceSameAsAdmin) pairs.push({ slot: "maintenance", label: "maintenance plan", bsb: maintenance.bsb, acc: maintenance.accountNumber });
    const seen = new Map<string, { slot: Slot; label: string }>();
    const dupSlots = new Set<Slot>();
    let dupMessage: string | null = null;
    for (const p of pairs) {
      if (!p.bsb || !p.acc) continue;
      const key = `${p.bsb}|${p.acc}`;
      const prev = seen.get(key);
      if (prev) {
        dupSlots.add(prev.slot);
        dupSlots.add(p.slot);
        dupMessage = `Same BSB + account number used by both ${prev.label} and ${p.label}. Use the "same account as admin" toggle instead.`;
      } else {
        seen.set(key, { slot: p.slot, label: p.label });
      }
    }
    if (dupMessage) problems.push(dupMessage);

    if (dupSlots.has("admin")) { adminFlags.bsb = true; adminFlags.acc = true; }
    if (dupSlots.has("capital")) { capFlags.bsb = true; capFlags.acc = true; }
    if (dupSlots.has("maintenance")) { mFlags.bsb = true; mFlags.acc = true; }
    setAdminInvalid(adminFlags);
    setCapitalInvalid(capFlags);
    setMaintenanceInvalid(mFlags);

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
      }, 4, 1); // Advance to Step 4.1 (Opening balances).
      if (r.error) {
        setPending(false);
        toast.error(r.error);
        return;
      }
      await onNext();
    })();
  }

  // Silence unused-prop lint when totalLots isn't read directly here.
  void totalLots;

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-lg font-semibold text-foreground">Bank accounts</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          The OC&apos;s funds — separate from your management company&apos;s operating account.
        </p>
      </div>

      <div className="rounded-md border border-border bg-card p-4 space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Administrative fund</h3>
        <FundFieldsBlock
          value={admin}
          onChange={(v) => { setAdmin(v); setAdminInvalid(NO_INVALID); }}
          invalid={adminInvalid}
          idPrefix="admin"
        />
      </div>

      <div className="rounded-md border border-border bg-card p-4 space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Capital works fund</h3>
        <div className="flex items-center gap-3">
          <Checkbox
            id="capital-same"
            checked={capitalSameAsAdmin}
            onCheckedChange={(v) => setCapitalSameAsAdmin(v === true)}
          />
          <Label className="text-sm font-normal text-foreground">
            Use the same bank account as the admin fund
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

      <div className="rounded-md border border-border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-foreground">Maintenance plan fund</h3>
          <Switch
            checked={hasMaintenance}
            onCheckedChange={(v) => setHasMaintenance(v === true)}
            disabled={isTier1or2}
            aria-label="This OC has a maintenance plan reserve fund"
          />
        </div>
        {isTier1or2 && (
          <p className="text-xs text-muted-foreground">Mandatory for Tier {tier}.</p>
        )}
        {hasMaintenance && (
          <>
            <div className="flex items-center gap-3 border-t border-border pt-3">
              <Checkbox
                id="maintenance-same"
                checked={maintenanceSameAsAdmin}
                onCheckedChange={(v) => setMaintenanceSameAsAdmin(v === true)}
              />
              <Label className="text-sm font-normal text-foreground">
                Use the same bank account as the admin fund
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

      <WizardActions
        draftId={draftId}
        onBack={onBack}
        onContinue={onContinue}
        continuePending={pending}
        getCurrentPatch={() => ({
          bank_provider: admin.bankId === "macquarie" ? "macquarie_deft" : "other_csv",
          has_maintenance_plan_fund: hasMaintenance,
          admin_bank_id: admin.bankId,
          admin_account_name: admin.accountName.trim() || undefined,
          admin_bsb: admin.bsb,
          admin_account_number: admin.accountNumber,
          capital_same_as_admin: capitalSameAsAdmin,
          capital_bank_id: capitalSameAsAdmin ? undefined : capital.bankId,
          capital_account_name: capitalSameAsAdmin ? undefined : capital.accountName.trim() || undefined,
          capital_bsb: capitalSameAsAdmin ? undefined : capital.bsb,
          capital_account_number: capitalSameAsAdmin ? undefined : capital.accountNumber,
          maintenance_same_as_admin: maintenanceSameAsAdmin,
          maintenance_bank_id:
            !hasMaintenance || maintenanceSameAsAdmin ? undefined : maintenance.bankId,
          maintenance_account_name:
            !hasMaintenance || maintenanceSameAsAdmin ? undefined : maintenance.accountName.trim() || undefined,
          maintenance_bsb:
            !hasMaintenance || maintenanceSameAsAdmin ? undefined : maintenance.bsb,
          maintenance_account_number:
            !hasMaintenance || maintenanceSameAsAdmin ? undefined : maintenance.accountNumber,
        })}
      />
    </div>
  );
}
