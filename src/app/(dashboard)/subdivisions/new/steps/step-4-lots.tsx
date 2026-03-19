"use client";

import { useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { step4Schema, type Step4Values } from "@/lib/validations/subdivision-wizard";
import { updateSubdivisionStep4 } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";

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
  const [generated, setGenerated] = useState(false);

  const {
    register,
    handleSubmit,
    control,
    watch,
    formState: { errors },
  } = useForm<Step4Values>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(step4Schema) as any,
    defaultValues: {
      total_lots: 0,
      lots: [],
    },
  });

  const { fields, replace } = useFieldArray({
    control,
    name: "lots",
  });

  const lotsWatch = watch("lots");

  // Calculate total entitlement
  const totalEntitlement = lotsWatch?.reduce(
    (sum, lot) => sum + (Number(lot?.lot_entitlement) || 0),
    0
  ) ?? 0;

  function generateLots() {
    const count = parseInt(lotCount, 10);
    if (isNaN(count) || count < 2) {
      toast.error("Please enter at least 2 lots");
      return;
    }

    const newLots = Array.from({ length: count }, (_, i) => ({
      lot_number: i + 1,
      unit_number: "",
      owner_type: "individual" as const,
      owner_name: "",
      owner_email: "",
      owner_phone: "",
      lot_entitlement: 0,
    }));

    replace(newLots);
    setGenerated(true);
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
    "flex h-8 w-full rounded-md border border-border bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary";
  const inputClass =
    "h-8 text-xs px-2";

  return (
    <form onSubmit={handleSubmit(onSubmit)} autoComplete="off" className="space-y-4">
      {/* Number of lots input */}
      <div className="space-y-1.5">
        <Label htmlFor="lot_count">
          Number of lots <span className="text-destructive">*</span>
        </Label>
        <div className="flex gap-2">
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
              if (e.key === "Enter") {
                e.preventDefault();
                generateLots();
              }
            }}
          />
          <Button type="button" variant="secondary" onClick={generateLots}>
            Generate
          </Button>
        </div>
        {errors.total_lots && (
          <p className="text-xs text-destructive mt-1">{errors.total_lots.message}</p>
        )}
      </div>

      {/* Lots table */}
      {generated && fields.length > 0 && (
        <div className="space-y-3">
          {/* Total entitlement display */}
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
                  <th className="px-2 py-2 text-left w-14">Lot</th>
                  <th className="px-2 py-2 text-left w-24">Type</th>
                  <th className="px-2 py-2 text-left">Owner name</th>
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
                      <span className="text-xs font-medium text-muted-foreground">
                        {index + 1}
                      </span>
                      <input type="hidden" {...register(`lots.${index}.lot_number`)} value={index + 1} />
                    </td>
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
                        placeholder="Name"
                        {...register(`lots.${index}.owner_name`)}
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
            <p className="text-xs text-destructive">{errors.lots.message}</p>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-between pt-4">
        <Button type="button" variant="ghost" onClick={onBack}>
          &larr; Back
        </Button>
        <Button type="submit" disabled={pending || !generated}>
          {pending ? <><Spinner className="mr-2" /> Continue</> : "Continue"}
        </Button>
      </div>
    </form>
  );
}
