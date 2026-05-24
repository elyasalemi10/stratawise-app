"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { saveOperatingAccount } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NumberInput } from "@/components/ui/number-input";
import { BankSelect } from "@/components/shared/bank-select";
import { AUSTRALIAN_BANKS } from "@/lib/data/australian-banks";

function formatBsb(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 6);
  if (d.length <= 3) return d;
  return `${d.slice(0, 3)}-${d.slice(3)}`;
}

export function StepOperating({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const [pending, setPending] = useState(false);
  const [accountName, setAccountName] = useState("");
  const [bsb, setBsb] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [bankId, setBankId] = useState("");
  const [otherBankName, setOtherBankName] = useState("");

  const [nameInvalid, setNameInvalid] = useState(false);
  const [bsbInvalid, setBsbInvalid] = useState(false);
  const [acctInvalid, setAcctInvalid] = useState(false);

  // The whole step is optional. If every field is blank the manager can skip
  // straight through; once they start filling it in we validate the trio.
  const isBlank =
    !accountName.trim() && !bsb.replace(/\D/g, "") && !accountNumber.replace(/\D/g, "");

  async function onSubmit() {
    if (isBlank) {
      onNext();
      return;
    }

    const problems: string[] = [];
    const bsbDigits = bsb.replace(/\D/g, "");
    const acctDigits = accountNumber.replace(/\D/g, "");

    const nameOk = accountName.trim().length >= 2;
    if (!nameOk) problems.push("Account name is required.");
    const bsbOk = bsbDigits.length === 6;
    if (!bsbOk) problems.push("BSB must be 6 digits.");
    const acctOk = /^\d{6,10}$/.test(acctDigits);
    if (!acctOk) problems.push("Account number must be 6–10 digits.");

    setNameInvalid(!nameOk);
    setBsbInvalid(!bsbOk);
    setAcctInvalid(!acctOk);

    if (problems.length > 0) {
      toast.error(problems.length === 1 ? problems[0] : "Fix the highlighted fields.");
      return;
    }

    const bankName = bankId === "other"
      ? otherBankName.trim() || undefined
      : AUSTRALIAN_BANKS.find((b) => b.id === bankId)?.name;

    setPending(true);
    const result = await saveOperatingAccount({
      account_name: accountName.trim(),
      bsb: bsbDigits,
      account_number: acctDigits,
      bank_name: bankName || undefined,
    });

    if ("error" in result) {
      setPending(false);
      toast.error(result.error);
      return;
    }

    onNext();
  }

  return (
    <div>
      <div className="text-center mb-8">
        <h2 className="text-lg font-semibold text-foreground">Your operating account</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Where management fee transfers from each OC&apos;s trust account land.
          Optional , you can add it later in Settings.
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="operating-account-name">Account name</Label>
          <Input
            id="operating-account-name"
            placeholder="Account name"
            autoComplete="off"
            value={accountName}
            onChange={(e) => { setAccountName(e.target.value); if (nameInvalid) setNameInvalid(false); }}
            aria-invalid={nameInvalid || undefined}
          />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="operating-bsb">BSB</Label>
            <Input
              id="operating-bsb"
              placeholder="6-digit BSB"
              autoComplete="off"
              inputMode="numeric"
              value={bsb}
              maxLength={7}
              onChange={(e) => { setBsb(formatBsb(e.target.value)); if (bsbInvalid) setBsbInvalid(false); }}
              onPaste={(e) => { e.preventDefault(); setBsb(formatBsb(e.clipboardData.getData("text"))); }}
              aria-invalid={bsbInvalid || undefined}
            />
          </div>

          <div className="space-y-1.5 col-span-2">
            <Label htmlFor="operating-account-number">Account number</Label>
            <NumberInput
              id="operating-account-number"
              allowDecimal={false}
              value={accountNumber}
              onChange={(v) => { setAccountNumber(v); if (acctInvalid) setAcctInvalid(false); }}
              invalid={acctInvalid}
              placeholder="Account number"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="operating-bank">Bank</Label>
          <BankSelect id="operating-bank" value={bankId} onChange={setBankId} includeOther />
          {bankId === "other" && (
            <Input
              placeholder="Bank name"
              value={otherBankName}
              onChange={(e) => setOtherBankName(e.target.value)}
              autoFocus
            />
          )}
        </div>

        <div className="flex items-center justify-between pt-2">
          <Button type="button" variant="secondary" onClick={onBack} disabled={pending}>
            Back
          </Button>
          <Button type="button" onClick={onSubmit} disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            {isBlank ? "Skip for now" : "Continue"}
          </Button>
        </div>
      </div>
    </div>
  );
}
