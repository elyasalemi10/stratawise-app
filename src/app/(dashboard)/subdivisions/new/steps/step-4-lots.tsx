"use client";

import { useState, useCallback } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { step4Schema, type Step4Values } from "@/lib/validations/subdivision-wizard";
import { updateSubdivisionStep4 } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

function createEmptyLot(index: number) {
  return {
    lot_number: String(index + 1),
    unit_number: "",
    owner_type: "individual" as const,
    owner_name: "",
    owner_email: "",
    owner_phone: "",
    lot_entitlement: "" as unknown as number,
  };
}

export function Step4Lots({
  subdivisionId,
  onNext,
  onBack,
}: {
  subdivisionId: string;
  onNext: () => void;
  onBack: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [lotCount, setLotCount] = useState("");

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { errors },
  } = useForm<Step4Values>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(step4Schema) as any,
    defaultValues: {
      total_lots: 0,
      lots: [],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "lots" });
  const lotsWatch = watch("lots");

  // Adjust lots when count changes — preserve existing data
  const adjustLots = useCallback((newCount: number) => {
    const currentCount = fields.length;
    if (newCount > currentCount) {
      // Append new rows
      const toAdd = Array.from(
        { length: newCount - currentCount },
        (_, i) => createEmptyLot(currentCount + i)
      );
      append(toAdd);
    } else if (newCount < currentCount && newCount >= 2) {
      // Remove from the bottom
      const toRemove = Array.from(
        { length: currentCount - newCount },
        (_, i) => currentCount - 1 - i
      );
      toRemove.forEach((idx) => remove(idx));
    }
    setValue("total_lots", newCount);
  }, [fields.length, append, remove, setValue]);

  // Handle lot count input
  function handleLotCountChange(val: string) {
    setLotCount(val);
    const count = parseInt(val, 10);
    if (!isNaN(count) && count >= 2) {
      adjustLots(count);
    }
  }

  // Calculate total entitlement
  const totalEntitlement = lotsWatch?.reduce(
    (sum, lot) => sum + (Number(lot?.lot_entitlement) || 0),
    0
  ) ?? 0;

  // Get field-level error
  function lotFieldError(index: number, field: string): boolean {
    const lotErrors = errors.lots;
    if (!lotErrors || !Array.isArray(lotErrors)) return false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rowErrors = lotErrors[index] as any;
    return !!rowErrors?.[field];
  }

  async function onSubmit(data: Step4Values) {
    setPending(true);
    const result = await updateSubdivisionStep4(subdivisionId, {
      ...data,
      total_lots: fields.length,
    });
    setPending(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }

    onNext();
  }

  const selectClass =
    "flex h-8 w-full rounded-md border bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary";

  return (
    <form onSubmit={handleSubmit(onSubmit)} autoComplete="off" className="space-y-4">
      {/* Number of lots */}
      <div className="space-y-1.5">
        <Label htmlFor="lot_count">
          Number of lots <span className="text-destructive">*</span>
        </Label>
        <Input
          id="lot_count"
          inputMode="numeric"
          placeholder="e.g. 12"
          value={lotCount}
          className="max-w-[160px]"
          onChange={(e) => {
            const val = e.target.value.replace(/[^0-9]/g, "");
            handleLotCountChange(val);
          }}
          onKeyDown={(e) => {
            if (["e", "E", "+", "-", "."].includes(e.key)) e.preventDefault();
          }}
        />
        {lotCount && parseInt(lotCount) < 2 && parseInt(lotCount) > 0 && (
          <p className="text-xs text-destructive mt-1">Minimum 2 lots required</p>
        )}
      </div>

      {/* Lots table */}
      {fields.length >= 2 && (
        <div className="space-y-3">
          {/* Total entitlement */}
          <div className="flex items-center justify-end gap-2">
            <span className="text-xs text-muted-foreground">Total units of entitlement:</span>
            <span className="text-sm font-bold tabular-nums text-foreground">
              {totalEntitlement}
            </span>
          </div>

          {/* Table */}
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  <th className="px-2 py-2 text-left w-24">Type</th>
                  <th className="px-2 py-2 text-left">Owner name</th>
                  <th className="px-2 py-2 text-left w-20">Lot no.</th>
                  <th className="px-2 py-2 text-left w-20">Unit no.</th>
                  <th className="px-2 py-2 text-left w-24">Entitlement</th>
                  <th className="px-2 py-2 text-left">Email</th>
                  <th className="px-2 py-2 text-left w-28">Phone</th>
                </tr>
              </thead>
              <tbody>
                {fields.map((field, index) => (
                  <tr key={field.id} className="border-t border-border/50">
                    <td className="px-2 py-1.5">
                      <select
                        className={cn(selectClass, "border-border")}
                        {...register(`lots.${index}.owner_type`)}
                      >
                        <option value="individual">Individual</option>
                        <option value="company">Company</option>
                      </select>
                    </td>
                    <td className="px-2 py-1.5">
                      <Input
                        className={cn(
                          "h-8 text-xs px-2",
                          lotFieldError(index, "owner_name") && "border-destructive"
                        )}
                        placeholder="Full name"
                        {...register(`lots.${index}.owner_name`)}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <Input
                        className={cn(
                          "h-8 text-xs px-2",
                          lotFieldError(index, "lot_number") && "border-destructive"
                        )}
                        placeholder={String(index + 1)}
                        {...register(`lots.${index}.lot_number`)}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <Input
                        className="h-8 text-xs px-2"
                        placeholder=""
                        {...register(`lots.${index}.unit_number`)}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <Input
                        className={cn(
                          "h-8 text-xs px-2",
                          lotFieldError(index, "lot_entitlement") && "border-destructive"
                        )}
                        inputMode="numeric"
                        placeholder=""
                        {...register(`lots.${index}.lot_entitlement`)}
                        onKeyDown={(e) => {
                          if (["e", "E", "+", "-"].includes(e.key)) e.preventDefault();
                        }}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <Input
                        className={cn(
                          "h-8 text-xs px-2",
                          lotFieldError(index, "owner_email") && "border-destructive"
                        )}
                        type="email"
                        placeholder=""
                        {...register(`lots.${index}.owner_email`)}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <Input
                        className="h-8 text-xs px-2"
                        placeholder=""
                        {...register(`lots.${index}.owner_phone`)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-between pt-4">
        <Button type="button" variant="ghost" onClick={onBack}>
          &larr; Back
        </Button>
        <Button type="submit" disabled={pending || fields.length < 2}>
          {pending ? <><Spinner className="mr-2" /> Continue</> : "Continue"}
        </Button>
      </div>
    </form>
  );
}
