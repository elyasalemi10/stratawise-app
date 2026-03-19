"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { step5Schema, type Step5Values } from "@/lib/validations/subdivision-wizard";
import { completeSubdivisionSetup } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";

export function Step5Balances({
  subdivisionId,
  onComplete,
  onBack,
}: {
  subdivisionId: string;
  onComplete: () => void;
  onBack: () => void;
}) {
  const [pending, setPending] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Step5Values>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(step5Schema) as any,
    defaultValues: {
      admin_opening_balance: 0,
      capital_works_opening_balance: 0,
      opening_balance_date: new Date().toISOString().split("T")[0],
    },
  });

  async function onSubmit(data: Step5Values) {
    setPending(true);
    const result = await completeSubdivisionSetup(subdivisionId, data);
    setPending(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }

    toast.success("Subdivision created successfully");
    onComplete();
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
            placeholder="0.00"
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
            placeholder="0.00"
            aria-invalid={!!errors.capital_works_opening_balance}
            {...register("capital_works_opening_balance")}
          />
        </div>
        {errors.capital_works_opening_balance && (
          <p className="text-xs text-destructive mt-1">{errors.capital_works_opening_balance.message}</p>
        )}
      </div>

      {/* Opening balance date */}
      <div className="space-y-1.5">
        <Label htmlFor="balance_date">
          Opening balance date <span className="text-destructive">*</span>
        </Label>
        <Input
          id="balance_date"
          type="date"
          aria-invalid={!!errors.opening_balance_date}
          {...register("opening_balance_date")}
        />
        {errors.opening_balance_date && (
          <p className="text-xs text-destructive mt-1">{errors.opening_balance_date.message}</p>
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
