"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Landmark, Clock } from "lucide-react";
import { BankSelect } from "@/components/shared/bank-select";
import { saveStep, completeWizard, type DraftJson } from "../actions";
import { WizardActions } from "./_components/wizard-actions";

// Wizard Step 4 , Banking.
//
// VIC operating + (optional) maintenance plan. The operating account is
// the one printed on every levy notice (EFT + BPAY). Maintenance can
// share that account or have its own.

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
          includeOther
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
  onComplete,
}: {
  draftId: string;
  initialDraft: DraftJson;
  totalLots: number;
  onBack: () => void;
  onNext: () => void;
  onComplete: (result: { ocCode: string; sourceDraftId?: string; nextOcIndex?: number | null }) => void;
}) {
  // Tier-1/2 mandates a maintenance plan fund (force on, disable the toggle).
  // Tier 3-5 default OFF; manager can opt in.
  const tier = initialDraft.tier ?? 5;
  const isTier1or2 = tier <= 2;

  const legacyAutoName = /^Owners Corporation\s+PS\d{6}[A-Z]\s+Trust Account$/i;
  const stripLegacy = (s: string | undefined) =>
    s && legacyAutoName.test(s.trim()) ? "" : (s ?? "");

  // Draft JSON keys stay `admin_*` for back-compat with in-flight wizards;
  // UI calls this the Operating account.
  const [operating, setOperating] = useState<FundFields>({
    bankId: initialDraft.admin_bank_id ?? "",
    accountName: stripLegacy(initialDraft.admin_account_name),
    bsb: initialDraft.admin_bsb ?? "",
    accountNumber: initialDraft.admin_account_number ?? "",
  });

  const [hasMaintenance, setHasMaintenance] = useState<boolean>(
    initialDraft.has_maintenance_plan_fund ?? isTier1or2,
  );
  const [maintenanceSameAsOperating, setMaintenanceSameAsOperating] = useState<boolean>(
    initialDraft.maintenance_same_as_admin ?? true,
  );
  const [maintenance, setMaintenance] = useState<FundFields>({
    bankId: initialDraft.maintenance_bank_id ?? "",
    accountName: stripLegacy(initialDraft.maintenance_account_name),
    bsb: initialDraft.maintenance_bsb ?? "",
    accountNumber: initialDraft.maintenance_account_number ?? "",
  });

  const [operatingInvalid, setOperatingInvalid] = useState<InvalidFlags>(NO_INVALID);
  const [maintenanceInvalid, setMaintenanceInvalid] = useState<InvalidFlags>(NO_INVALID);
  const [pending, setPending] = useState(false);

  const hasExistingBankDetails = !!(
    initialDraft.admin_bank_id ||
    initialDraft.admin_bsb ||
    initialDraft.admin_account_number
  );
  const [choice, setChoice] = useState<"now" | "later" | null>(
    initialDraft.banking_deferred
      ? "later"
      : hasExistingBankDetails
        ? "now"
        : null,
  );

  function validateFund(f: FundFields): InvalidFlags {
    return {
      bank: !f.bankId,
      name: f.accountName.trim().length < 1,
      bsb: !isValidBsb(f.bsb),
      acc: !isValidAccountNumber(f.accountNumber),
    };
  }

  function createDeferred() {
    setPending(true);
    void (async () => {
      const save = await saveStep(draftId, {
        banking_deferred: true,
        bank_provider: undefined,
        has_maintenance_plan_fund: false,
        admin_bank_id: undefined,
        admin_account_name: undefined,
        admin_bsb: undefined,
        admin_account_number: undefined,
        capital_same_as_admin: true,
        maintenance_same_as_admin: true,
      }, 4, 1);
      if (save.error) {
        setPending(false);
        toast.error(save.error);
        return;
      }
      const result = await completeWizard(draftId);
      if (result.error || !result.ocCode) {
        setPending(false);
        toast.error(result.error ?? "Failed to create the OC");
        return;
      }
      onComplete({
        ocCode: result.ocCode,
        sourceDraftId: result.sourceDraftId,
        nextOcIndex: result.nextOcIndex,
      });
    })();
  }

  function onContinue() {
    if (choice === "later") {
      createDeferred();
      return;
    }

    const problems: string[] = [];
    const opFlags = validateFund(operating);
    if (Object.values(opFlags).some(Boolean)) problems.push("Operating account details");

    let mFlags: InvalidFlags = NO_INVALID;
    if (hasMaintenance && !maintenanceSameAsOperating) {
      mFlags = validateFund(maintenance);
      if (Object.values(mFlags).some(Boolean)) problems.push("Maintenance plan fund details");
    }

    // Duplicate (BSB, account) across operating + maintenance = error.
    if (hasMaintenance && !maintenanceSameAsOperating
        && operating.bsb && operating.accountNumber
        && operating.bsb === maintenance.bsb
        && operating.accountNumber === maintenance.accountNumber) {
      problems.push(`Same BSB + account number used by both operating and maintenance plan. Use the "same account as operating" toggle instead.`);
      opFlags.bsb = true; opFlags.acc = true;
      mFlags.bsb = true; mFlags.acc = true;
    }

    setOperatingInvalid(opFlags);
    setMaintenanceInvalid(mFlags);

    if (problems.length) {
      toast.error(problems.length === 1 ? problems[0] : "Fix the highlighted fields.");
      return;
    }

    setPending(true);
    void (async () => {
      const r = await saveStep(draftId, {
        banking_deferred: false,
        bank_provider: operating.bankId === "macquarie" ? "macquarie_deft" : "other_csv",
        has_maintenance_plan_fund: hasMaintenance,
        admin_bank_id: operating.bankId,
        admin_account_name: operating.accountName.trim(),
        admin_bsb: operating.bsb,
        admin_account_number: operating.accountNumber,
        capital_same_as_admin: true,
        maintenance_same_as_admin: maintenanceSameAsOperating,
        maintenance_bank_id: !hasMaintenance || maintenanceSameAsOperating ? undefined : maintenance.bankId,
        maintenance_account_name: !hasMaintenance || maintenanceSameAsOperating ? undefined : maintenance.accountName.trim(),
        maintenance_bsb: !hasMaintenance || maintenanceSameAsOperating ? undefined : maintenance.bsb,
        maintenance_account_number: !hasMaintenance || maintenanceSameAsOperating ? undefined : maintenance.accountNumber,
      }, 4, 1);
      if (r.error) {
        setPending(false);
        toast.error(r.error);
        return;
      }
      await onNext();
    })();
  }

  void totalLots;

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-lg font-semibold text-foreground">Bank accounts</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          The OC&apos;s funds , separate from your management company&apos;s operating account.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => setChoice("now")}
          className={`flex items-start gap-3 rounded-md border-2 bg-card p-4 text-left transition-colors cursor-pointer ${
            choice === "now" ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
          }`}
        >
          <Landmark className="h-5 w-5 shrink-0 text-primary mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-foreground">Set up bank accounts now</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Enter the trust account details and opening balances.
            </p>
          </div>
        </button>
        <button
          type="button"
          onClick={() => setChoice("later")}
          className={`flex items-start gap-3 rounded-md border-2 bg-card p-4 text-left transition-colors cursor-pointer ${
            choice === "later" ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
          }`}
        >
          <Clock className="h-5 w-5 shrink-0 text-muted-foreground mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-foreground">Set up later</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Create the OC now, add accounts from Settings → Banking. Levy distribution stays paused until accounts exist.
            </p>
          </div>
        </button>
      </div>

      {choice === "now" && (
      <>
      <div className="rounded-md border border-border bg-card p-4 space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Operating account</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            These bank details appear on every levy notice this OC sends (BPAY/EFT). Owners pay into this account regardless of which fund the levy is for.
          </p>
        </div>
        <FundFieldsBlock
          value={operating}
          onChange={(v) => { setOperating(v); setOperatingInvalid(NO_INVALID); }}
          invalid={operatingInvalid}
          idPrefix="operating"
        />
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
                checked={maintenanceSameAsOperating}
                onCheckedChange={(v) => setMaintenanceSameAsOperating(v === true)}
              />
              <Label className="text-sm font-normal text-foreground">
                Use the same bank account as the operating account
              </Label>
            </div>
            {!maintenanceSameAsOperating && (
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
      </>
      )}

      <WizardActions
        draftId={draftId}
        onBack={onBack}
        onContinue={onContinue}
        disabled={choice === null}
        continuePending={pending}
        continueLabel={choice === "later" ? "Create OC" : "Continue"}
        getCurrentPatch={() => ({
          banking_deferred: choice === "later",
          admin_bank_id: operating.bankId || undefined,
          admin_account_name: operating.accountName.trim() || undefined,
          admin_bsb: operating.bsb || undefined,
          admin_account_number: operating.accountNumber || undefined,
          has_maintenance_plan_fund: hasMaintenance,
          maintenance_same_as_admin: maintenanceSameAsOperating,
          maintenance_bank_id: !hasMaintenance || maintenanceSameAsOperating ? undefined : maintenance.bankId,
          maintenance_account_name: !hasMaintenance || maintenanceSameAsOperating ? undefined : maintenance.accountName.trim(),
          maintenance_bsb: !hasMaintenance || maintenanceSameAsOperating ? undefined : maintenance.bsb,
          maintenance_account_number: !hasMaintenance || maintenanceSameAsOperating ? undefined : maintenance.accountNumber,
        })}
      />
    </div>
  );
}
