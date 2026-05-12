"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  operatingAccountSchema,
  type OperatingAccountFormValues,
} from "@/lib/validations/onboarding-setup";
import { saveOperatingAccount } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function formatBsb(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 6);
  if (d.length <= 3) return d;
  return `${d.slice(0, 3)}-${d.slice(3)}`;
}

export function StepOperating({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const [pending, setPending] = useState(false);
  const [bsb, setBsb] = useState("");
  const [bsbInvalid, setBsbInvalid] = useState(false);
  const [acctInvalid, setAcctInvalid] = useState(false);
  const [nameInvalid, setNameInvalid] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<OperatingAccountFormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(operatingAccountSchema) as any,
  });

  async function onSubmit(data: OperatingAccountFormValues) {
    const problems: string[] = [];
    const bsbDigits = bsb.replace(/\D/g, "");
    const bsbOk = bsbDigits.length === 6;
    if (!bsbOk) problems.push("BSB must be 6 digits");
    const acctOk = /^\d{6,10}$/.test(data.operating_account_number.replace(/\D/g, ""));
    if (!acctOk) problems.push("Account number must be 6–10 digits");
    const nameOk = data.operating_account_name.trim().length >= 2;
    if (!nameOk) problems.push("Account name is required");

    setBsbInvalid(!bsbOk);
    setAcctInvalid(!acctOk);
    setNameInvalid(!nameOk);

    if (problems.length > 0) {
      toast.error(problems.length === 1 ? problems[0] : "Fix the highlighted fields.");
      return;
    }

    setPending(true);
    const result = await saveOperatingAccount({
      account_name: data.operating_account_name.trim(),
      bsb: bsbDigits,
      account_number: data.operating_account_number.replace(/\D/g, ""),
      bank_name: data.operating_bank_name?.trim() || undefined,
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
          The account that receives management fee transfers from each
          OC&apos;s trust account.
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} autoComplete="off" className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="operating-account-name">
            Account name <span className="text-destructive">*</span>
          </Label>
          <Input
            id="operating-account-name"
            placeholder="ABC Strata Management Pty Ltd"
            autoComplete="off"
            aria-invalid={nameInvalid || !!errors.operating_account_name}
            {...register("operating_account_name")}
            onChange={(e) => {
              setValue("operating_account_name", e.target.value);
              if (nameInvalid) setNameInvalid(false);
            }}
          />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="operating-bsb">
              BSB <span className="text-destructive">*</span>
            </Label>
            <Input
              id="operating-bsb"
              placeholder="012-345"
              autoComplete="off"
              inputMode="numeric"
              value={bsb}
              maxLength={7}
              onChange={(e) => {
                const formatted = formatBsb(e.target.value);
                setBsb(formatted);
                setValue("operating_bsb", formatted);
                if (bsbInvalid) setBsbInvalid(false);
              }}
              onPaste={(e) => {
                e.preventDefault();
                const formatted = formatBsb(e.clipboardData.getData("text"));
                setBsb(formatted);
                setValue("operating_bsb", formatted);
              }}
              aria-invalid={bsbInvalid || undefined}
            />
            <input type="hidden" {...register("operating_bsb")} />
          </div>

          <div className="space-y-1.5 col-span-2">
            <Label htmlFor="operating-account-number">
              Account number <span className="text-destructive">*</span>
            </Label>
            <Input
              id="operating-account-number"
              placeholder="12345678"
              autoComplete="off"
              inputMode="numeric"
              maxLength={10}
              aria-invalid={acctInvalid || !!errors.operating_account_number}
              {...register("operating_account_number")}
              onChange={(e) => {
                const cleaned = e.target.value.replace(/\D/g, "").slice(0, 10);
                setValue("operating_account_number", cleaned);
                if (acctInvalid) setAcctInvalid(false);
              }}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="operating-bank-name">Bank name</Label>
          <Input
            id="operating-bank-name"
            placeholder="Optional — e.g. Commonwealth Bank"
            autoComplete="off"
            {...register("operating_bank_name")}
          />
        </div>

        <div className="flex items-center justify-between pt-2">
          <Button type="button" variant="ghost" onClick={onBack} disabled={pending}>
            Back
          </Button>
          <Button type="submit" disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            Continue
          </Button>
        </div>
      </form>
    </div>
  );
}
