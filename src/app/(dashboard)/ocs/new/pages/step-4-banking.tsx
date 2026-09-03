"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Landmark, Clock } from "lucide-react";
import { bankFromBsb } from "@/lib/data/australian-banks";
import { cn } from "@/lib/utils";
import { saveStep, completeWizard, type DraftJson } from "../actions";
import { WizardActions } from "./_components/wizard-actions";

// Wizard Step 4 , Banking.
//
// VIC operating + (optional) maintenance plan. The operating account is
// the one printed on every levy notice (EFT). Maintenance can
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
  accountName: string;
  bsb: string;
  accountNumber: string;
};

interface InvalidFlags { name: boolean; bsb: boolean; acc: boolean }
const NO_INVALID: InvalidFlags = { name: false, bsb: false, acc: false };

interface FundFieldsProps {
  value: FundFields;
  onChange: (next: FundFields) => void;
  invalid: InvalidFlags;
  idPrefix: string;
}

function FundFieldsBlock({ value, onChange, invalid, idPrefix }: FundFieldsProps) {
  const bank = bankFromBsb(value.bsb);
  return (
    <div className="space-y-3">
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
      {/* BSB then account number, both sized to what they hold rather than
          stretched across the row , an account number is nine digits and was
          getting the width of a sentence. The spare width goes to the right
          of both. */}
      <div className="grid grid-cols-[200px_200px_1fr] gap-3">
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-bsb`}>
            BSB <span className="text-destructive">*</span>
          </Label>
          <div className="relative">
            <Input
              id={`${idPrefix}-bsb`}
              placeholder="6-digit BSB"
              value={value.bsb}
              onChange={(e) => onChange({ ...value, bsb: formatBsb(e.target.value) })}
              inputMode="numeric"
              maxLength={7}
              aria-invalid={invalid.bsb || undefined}
              className="pl-9"
            />
            {/* The BSB names the bank, so the badge appears as it is typed ,
                confirmation you are entering the account you think you are,
                at the moment you would notice a wrong digit. Faded in rather
                than popped so it does not snatch attention mid-keystroke. */}
            <span
              aria-hidden
              className={cn(
                "pointer-events-none absolute left-2.5 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center transition-opacity duration-200",
                bank ? "opacity-100" : "opacity-0",
              )}
            >
              {bank?.logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={bank.logo} alt="" className="size-4 rounded-sm object-contain" />
              ) : (
                <Landmark className="size-4 text-muted-foreground" />
              )}
            </span>
          </div>
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
  const legacyAutoName = /^Owners Corporation\s+PS\d{6}[A-Z]\s+Trust Account$/i;
  const stripLegacy = (s: string | undefined) =>
    s && legacyAutoName.test(s.trim()) ? "" : (s ?? "");

  // Draft JSON keys stay `admin_*` for back-compat with in-flight wizards;
  // UI calls this the Operating account.
  const [operating, setOperating] = useState<FundFields>({
    accountName: stripLegacy(initialDraft.admin_account_name),
    bsb: initialDraft.admin_bsb ?? "",
    accountNumber: initialDraft.admin_account_number ?? "",
  });

  const [operatingInvalid, setOperatingInvalid] = useState<InvalidFlags>(NO_INVALID);
  const [pending, setPending] = useState(false);

  const hasExistingBankDetails = !!(
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
        has_maintenance_plan_fund: false,
        admin_account_name: undefined,
        admin_bsb: undefined,
        admin_account_number: undefined,
        capital_same_as_admin: true,
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

    setOperatingInvalid(opFlags);

    if (problems.length) {
      toast.error(problems.length === 1 ? problems[0] : "Fix the highlighted fields.");
      return;
    }

    setPending(true);
    void (async () => {
      const r = await saveStep(draftId, {
        banking_deferred: false,
        has_maintenance_plan_fund: false,
        admin_account_name: operating.accountName.trim(),
        admin_bsb: operating.bsb,
        admin_account_number: operating.accountNumber,
        capital_same_as_admin: true,
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
            These bank details appear on every levy notice this OC sends. Owners pay into this account regardless of which fund the levy is for.
          </p>
        </div>
        <FundFieldsBlock
          value={operating}
          onChange={(v) => { setOperating(v); setOperatingInvalid(NO_INVALID); }}
          invalid={operatingInvalid}
          idPrefix="operating"
        />
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
          admin_account_name: operating.accountName.trim() || undefined,
          admin_bsb: operating.bsb || undefined,
          admin_account_number: operating.accountNumber || undefined,
          has_maintenance_plan_fund: false,
        })}
      />
    </div>
  );
}
