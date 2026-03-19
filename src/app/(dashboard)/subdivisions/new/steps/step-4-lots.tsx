"use client";

import { useState, useEffect } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { step4Schema, type Step4Values } from "@/lib/validations/subdivision-wizard";
import { updateSubdivisionStep4 } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";

function createEmptyLots(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    lot_number: String(i + 1),
    unit_number: "",
    owner_type: "individual" as const,
    owner_name: "",
    owner_email: "",
    owner_phone: "",
    lot_entitlement: 0,
  }));
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

  const { fields, replace } = useFieldArray({ control, name: "lots" });
  const lotsWatch = watch("lots");

  // Dynamically generate table when lot count changes
  useEffect(() => {
    const count = parseInt(lotCount, 10);
    if (!isNaN(count) && count >= 2) {
      replace(createEmptyLots(count));
      setValue("total_lots", count);
    } else if (lotCount === "" || lotCount === "0" || lotCount === "1") {
      replace([]);
      setValue("total_lots", 0);
    }
  }, [lotCount, replace, setValue]);

  // Calculate total entitlement
  const totalEntitlement = lotsWatch?.reduce(
    (sum, lot) => sum + (Number(lot?.lot_entitlement) || 0),
    0
  ) ?? 0;

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
    "flex h-8 w-full rounded-md border border-border bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary";
  const inputClass = "h-8 text-xs px-2";

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
            setLotCount(val);
          }}
          onKeyDown={(e) => {
            if (["e", "E", "+", "-", "."].includes(e.key)) e.preventDefault();
          }}
        />
        {errors.total_lots && (
          <p className="text-xs text-destructive mt-1">{errors.total_lots.message}</p>
        )}
      </div>

      {/* Lots table — appears instantly when count >= 2 */}
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
                        className={selectClass}
                        {...register(`lots.${index}.owner_type`)}
                      >
                        <option value="individual">Individual</option>
                        <option value="company">Company</option>
                      </select>
                    </td>
                    <td className="px-2 py-1.5">
                      <Input
                        className={inputClass}
                        placeholder="Full name"
                        {...register(`lots.${index}.owner_name`)}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <Input
                        className={inputClass}
                        placeholder={String(index + 1)}
                        {...register(`lots.${index}.lot_number`)}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <Input
                        className={inputClass}
                        placeholder="Unit"
                        {...register(`lots.${index}.unit_number`)}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <Input
                        className={inputClass}
                        inputMode="numeric"
                        placeholder="0"
                        {...register(`lots.${index}.lot_entitlement`)}
                        onKeyDown={(e) => {
                          if (["e", "E", "+", "-"].includes(e.key)) e.preventDefault();
                        }}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <Input
                        className={inputClass}
                        type="email"
                        placeholder="email@example.com"
                        {...register(`lots.${index}.owner_email`)}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <Input
                        className={inputClass}
                        placeholder="0412 345 678"
                        {...register(`lots.${index}.owner_phone`)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {errors.lots && (
            <p className="text-xs text-destructive">{typeof errors.lots === "object" && "message" in errors.lots ? errors.lots.message : "Please check lot details"}</p>
          )}
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
