"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { step3Schema, type Step3Values } from "@/lib/validations/subdivision-wizard";
import { updateSubdivisionStep3 } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { BankSelect } from "@/components/shared/bank-select";

const CONNECTION_TYPES = [
  { value: "basiq", label: "Automatic bank feed" },
  { value: "manual", label: "Manual statement upload" },
] as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function Step3Banking({
  subdivisionId,
  onNext,
  onBack,
  initialData,
}: {
  subdivisionId: string;
  onNext: () => void;
  onBack: () => void;
  initialData?: any;
}) {
  const [pending, setPending] = useState(false);
  const existingBank = initialData?.bankAccounts?.[0];
  const [bank, setBank] = useState(existingBank?.bank_name ?? "");
  const [bankError, setBankError] = useState("");

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<Step3Values>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(step3Schema) as any,
    defaultValues: {
      bank_connection_type: initialData?.subdivision?.bank_connection_type ?? "manual",
      bank_name: existingBank?.bank_name ?? "",
      account_name: existingBank?.account_name ?? "",
      bsb: existingBank?.bsb ?? "",
      account_number: existingBank?.account_number ?? "",
    },
  });

  async function onSubmit(data: Step3Values) {
    if (!bank) {
      setBankError("Please select a bank");
      return;
    }
    setBankError("");

    setPending(true);
    const result = await updateSubdivisionStep3(subdivisionId, { ...data, bank_name: bank });
    setPending(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }

    onNext();
  }

  // Auto-format BSB with dash
  function handleBsbChange(e: React.ChangeEvent<HTMLInputElement>) {
    let val = e.target.value.replace(/\D/g, "");
    if (val.length > 6) val = val.slice(0, 6);
    if (val.length > 3) {
      val = `${val.slice(0, 3)}-${val.slice(3)}`;
    }
    e.target.value = val;
    register("bsb").onChange(e);
  }

  const selectClass =
    "flex h-9 w-full rounded-md border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary";

  return (
    <form onSubmit={handleSubmit(onSubmit)} autoComplete="off" className="space-y-4">
      {/* Connection type */}
      <div className="space-y-1.5">
        <Label htmlFor="connection_type">
          Connection type <span className="text-destructive">*</span>
        </Label>
        <select id="connection_type" className={selectClass} {...register("bank_connection_type")}>
          {CONNECTION_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>

      {/* Bank */}
      <div className="space-y-1.5">
        <Label htmlFor="bank">
          Bank <span className="text-destructive">*</span>
        </Label>
        <BankSelect
          value={bank}
          onChange={(val) => {
            setBank(val);
            setValue("bank_name", val);
            setBankError("");
          }}
          error={!!bankError}
          id="bank"
        />
        {bankError && (
          <p className="text-xs text-destructive mt-1">{bankError}</p>
        )}
      </div>

      {/* Account name */}
      <div className="space-y-1.5">
        <Label htmlFor="account_name">
          Account name <span className="text-destructive">*</span>
        </Label>
        <Input
          id="account_name"
          placeholder="Owners Corporation Fund"
          autoComplete="off"
          aria-invalid={!!errors.account_name}
          {...register("account_name")}
        />
        {errors.account_name && (
          <p className="text-xs text-destructive mt-1">{errors.account_name.message}</p>
        )}
      </div>

      {/* BSB + Account number */}
      <div className="grid grid-cols-[140px_1fr] gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="bsb">
            BSB <span className="text-destructive">*</span>
          </Label>
          <Input
            id="bsb"
            placeholder="123-456"
            autoComplete="off"
            maxLength={7}
            aria-invalid={!!errors.bsb}
            {...register("bsb")}
            onChange={handleBsbChange}
          />
          {errors.bsb && (
            <p className="text-xs text-destructive mt-1">{errors.bsb.message}</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="account_number">
            Account number <span className="text-destructive">*</span>
          </Label>
          <Input
            id="account_number"
            placeholder="1234567890"
            autoComplete="off"
            maxLength={10}
            aria-invalid={!!errors.account_number}
            {...register("account_number")}
            onChange={(e) => {
              e.target.value = e.target.value.replace(/\D/g, "");
              register("account_number").onChange(e);
            }}
          />
          {errors.account_number && (
            <p className="text-xs text-destructive mt-1">{errors.account_number.message}</p>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-between pt-4">
        <Button type="button" variant="ghost" onClick={onBack}>
          &larr; Back
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? <><Spinner className="mr-2" /> Continue</> : "Continue"}
        </Button>
      </div>
    </form>
  );
}
