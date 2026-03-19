"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { step2Schema, type Step2Values } from "@/lib/validations/subdivision-wizard";
import { updateSubdivisionStep2 } from "../actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";

const MONTHS = [
  { value: 1, label: "January" },
  { value: 2, label: "February" },
  { value: 3, label: "March" },
  { value: 4, label: "April" },
  { value: 5, label: "May" },
  { value: 6, label: "June" },
  { value: 7, label: "July" },
  { value: 8, label: "August" },
  { value: 9, label: "September" },
  { value: 10, label: "October" },
  { value: 11, label: "November" },
  { value: 12, label: "December" },
];

const LEVY_FREQUENCIES = [
  { value: 1, label: "Annually (1)" },
  { value: 2, label: "Semi-annually (2)" },
  { value: 4, label: "Quarterly (4)" },
  { value: 6, label: "Bi-monthly (6)" },
  { value: 12, label: "Monthly (12)" },
];

export function Step2Settings({
  subdivisionId,
  onNext,
  onBack,
}: {
  subdivisionId: string;
  onNext: () => void;
  onBack: () => void;
}) {
  const [pending, setPending] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Step2Values>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(step2Schema) as any,
    defaultValues: {
      financial_year_start_month: 7,
      levy_year_start_month: 7,
      levies_per_year: 4,
    },
  });

  async function onSubmit(data: Step2Values) {
    setPending(true);
    const result = await updateSubdivisionStep2(subdivisionId, data);
    setPending(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }

    onNext();
  }

  const selectClass =
    "flex h-9 w-full rounded-md border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary";

  return (
    <form onSubmit={handleSubmit(onSubmit)} autoComplete="off" className="space-y-4">
      {/* Financial year start month */}
      <div className="space-y-1.5">
        <Label htmlFor="fy_month">
          Financial year start month <span className="text-destructive">*</span>
        </Label>
        <select id="fy_month" className={selectClass} {...register("financial_year_start_month")}>
          {MONTHS.map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
        {errors.financial_year_start_month && (
          <p className="text-xs text-destructive mt-1">{errors.financial_year_start_month.message}</p>
        )}
      </div>

      {/* Levy year start month */}
      <div className="space-y-1.5">
        <Label htmlFor="levy_month">
          Levy year start month <span className="text-destructive">*</span>
        </Label>
        <select id="levy_month" className={selectClass} {...register("levy_year_start_month")}>
          {MONTHS.map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
        {errors.levy_year_start_month && (
          <p className="text-xs text-destructive mt-1">{errors.levy_year_start_month.message}</p>
        )}
      </div>

      {/* Levies per year */}
      <div className="space-y-1.5">
        <Label htmlFor="levies_per_year">
          Levies per year <span className="text-destructive">*</span>
        </Label>
        <select id="levies_per_year" className={selectClass} {...register("levies_per_year")}>
          {LEVY_FREQUENCIES.map((f) => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </select>
        {errors.levies_per_year && (
          <p className="text-xs text-destructive mt-1">{errors.levies_per_year.message}</p>
        )}
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
