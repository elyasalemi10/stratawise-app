"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { subdivisionSchema, type SubdivisionFormValues } from "@/lib/validations/onboarding-setup";
import { createSubdivision } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function StepSubdivision({
  onNext,
  onBack,
}: {
  onNext: () => void;
  onBack: () => void;
}) {
  const [pending, setPending] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SubdivisionFormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(subdivisionSchema) as any,
    defaultValues: { state: "VIC" },
  });

  async function onSubmit(data: SubdivisionFormValues) {
    setPending(true);
    const result = await createSubdivision(data);
    setPending(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }

    toast.success("Subdivision created");
    onNext();
  }

  return (
    <div>
      <h2 className="text-lg font-semibold text-foreground">
        Create your first subdivision
      </h2>
      <p className="mt-1 text-sm text-muted-foreground mb-6">
        You can add more subdivisions later from the dashboard.
      </p>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="plan_number">
            Plan number <span className="text-destructive">*</span>
          </Label>
          <Input
            id="plan_number"
            placeholder="PS123456A"
            aria-invalid={!!errors.plan_number}
            {...register("plan_number")}
          />
          {errors.plan_number && (
            <p className="text-xs text-destructive mt-1">{errors.plan_number.message}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="name">
            Subdivision name <span className="text-destructive">*</span>
          </Label>
          <Input
            id="name"
            placeholder="Riverside Townhouses"
            aria-invalid={!!errors.name}
            {...register("name")}
          />
          {errors.name && (
            <p className="text-xs text-destructive mt-1">{errors.name.message}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="address">
            Address <span className="text-destructive">*</span>
          </Label>
          <Input
            id="address"
            placeholder="1-12/45 Smith Street, Richmond VIC 3121"
            aria-invalid={!!errors.address}
            {...register("address")}
          />
          {errors.address && (
            <p className="text-xs text-destructive mt-1">{errors.address.message}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="total_lots">
            Number of lots <span className="text-destructive">*</span>
          </Label>
          <Input
            id="total_lots"
            type="number"
            min={2}
            placeholder="12"
            aria-invalid={!!errors.total_lots}
            {...register("total_lots")}
          />
          {errors.total_lots && (
            <p className="text-xs text-destructive mt-1">{errors.total_lots.message}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="state">State</Label>
          <Input
            id="state"
            value="VIC"
            disabled
            className="bg-muted text-muted-foreground cursor-not-allowed"
            title="More states coming soon"
            {...register("state")}
          />
          <p className="text-xs text-muted-foreground">More states coming soon</p>
        </div>

        <div className="flex justify-between pt-2">
          <Button type="button" variant="ghost" onClick={onBack}>
            &larr; Back
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Creating..." : "Continue"}
          </Button>
        </div>
      </form>
    </div>
  );
}
