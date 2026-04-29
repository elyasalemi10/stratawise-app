"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { format } from "date-fns";
import { step5Schema, type Step5Values } from "@/lib/validations/subdivision-wizard";
import { completeSubdivisionSetup } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { DatePicker } from "@/components/shared/date-picker";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function Step5Balances({
  subdivisionId,
  onComplete,
  onBack,
  initialData,
}: {
  subdivisionId: string;
  onComplete: (redirectUrl: string) => void;
  onBack: () => void;
  initialData?: any[];
}) {
  const adminAccount = initialData?.find((a: any) => a.fund_type === "administrative");
  const cwAccount = initialData?.find((a: any) => a.fund_type === "capital_works");

  const [pending, setPending] = useState(false);
  const [balanceDate, setBalanceDate] = useState(
    adminAccount?.opening_balance_date ?? format(new Date(), "yyyy-MM-dd")
  );
  const [dateError, setDateError] = useState("");

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Step5Values>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(step5Schema) as any,
    defaultValues: {
      admin_opening_balance: adminAccount?.opening_balance ? Number(adminAccount.opening_balance) : ("" as unknown as number),
      capital_works_opening_balance: cwAccount?.opening_balance ? Number(cwAccount.opening_balance) : ("" as unknown as number),
      opening_balance_date: adminAccount?.opening_balance_date ?? format(new Date(), "yyyy-MM-dd"),
    },
  });

  async function onSubmit(data: Step5Values) {
    if (!balanceDate) {
      setDateError("Opening balance date is required");
      return;
    }
    setDateError("");

    setPending(true);
    const result = await completeSubdivisionSetup(subdivisionId, {
      ...data,
      opening_balance_date: balanceDate,
    });
    setPending(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }

    toast.success("Subdivision created successfully");
    onComplete(result.redirectUrl ?? "/dashboard");
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} autoComplete="off" className="space-y-4">
      {/* Admin fund opening balance */}
      <div className="space-y-1.5">
        <Label htmlFor="admin_balance">
          Administrative fund opening balance <span className="text-destructive">*</span>
        </Label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
            $
          </span>
          <Input
            id="admin_balance"
            type="number"
            step="0.01"
            min="0"
            className="pl-7"
            placeholder=""
            aria-invalid={!!errors.admin_opening_balance}
            {...register("admin_opening_balance")}
          />
        </div>
        {errors.admin_opening_balance && (
          <p className="text-xs text-destructive mt-1">{errors.admin_opening_balance.message}</p>
        )}
      </div>

      {/* Capital works fund opening balance */}
      <div className="space-y-1.5">
        <Label htmlFor="cw_balance">
          Capital works fund opening balance <span className="text-destructive">*</span>
        </Label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
            $
          </span>
          <Input
            id="cw_balance"
            type="number"
            step="0.01"
            min="0"
            className="pl-7"
            placeholder=""
            aria-invalid={!!errors.capital_works_opening_balance}
            {...register("capital_works_opening_balance")}
          />
        </div>
        {errors.capital_works_opening_balance && (
          <p className="text-xs text-destructive mt-1">{errors.capital_works_opening_balance.message}</p>
        )}
      </div>

      {/* Opening balance date — Calendar picker */}
      <div className="space-y-1.5">
        <Label>
          Opening balance date <span className="text-destructive">*</span>
        </Label>
        <DatePicker
          value={balanceDate}
          onChange={(val) => {
            setBalanceDate(val);
            setDateError("");
          }}
          error={!!dateError}
        />
        {dateError && (
          <p className="text-xs text-destructive mt-1">{dateError}</p>
        )}
      </div>

      {/* Actions */}
      <div className="flex justify-between pt-4">
        <Button type="button" variant="ghost" onClick={onBack}>
          &larr; Back
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? <><Spinner className="mr-2" /> Complete setup</> : "Complete setup"}
        </Button>
      </div>
    </form>
  );
}
