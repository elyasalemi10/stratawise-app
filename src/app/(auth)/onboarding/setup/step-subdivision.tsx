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
import { Spinner } from "@/components/ui/spinner";
import { SuburbSelect } from "@/components/shared/suburb-select";

export function StepSubdivision({
  onNext,
  onBack,
}: {
  onNext: () => void;
  onBack: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [suburb, setSuburb] = useState("");

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<SubdivisionFormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(subdivisionSchema) as any,
    defaultValues: { state: "VIC" },
  });

  async function onSubmit(data: SubdivisionFormValues) {
    setPending(true);
    const address = `${data.street}, ${suburb}, VIC`;
    const result = await createSubdivision({
      plan_number: data.plan_number,
      name: data.name,
      address,
      total_lots: data.total_lots,
      state: data.state,
    });
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
          <Label htmlFor="street">
            Street address <span className="text-destructive">*</span>
          </Label>
          <Input
            id="street"
            placeholder="1-12/45 Smith Street"
            aria-invalid={!!errors.street}
            {...register("street")}
          />
          {errors.street && (
            <p className="text-xs text-destructive mt-1">{errors.street.message}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="suburb">
            Suburb <span className="text-destructive">*</span>
          </Label>
          <SuburbSelect
            id="suburb"
            value={suburb}
            onChange={(val) => {
              setSuburb(val);
              setValue("suburb", val);
            }}
            error={!!errors.suburb}
          />
          {errors.suburb && (
            <p className="text-xs text-destructive mt-1">{errors.suburb.message}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="total_lots">
            Number of lots <span className="text-destructive">*</span>
          </Label>
          <Input
            id="total_lots"
            inputMode="numeric"
            placeholder="12"
            aria-invalid={!!errors.total_lots}
            {...register("total_lots")}
            onKeyDown={(e) => {
              if (["e", "E", "+", "-", "."].includes(e.key)) {
                e.preventDefault();
              }
            }}
            onChange={(e) => {
              const val = e.target.value.replace(/[^0-9]/g, "");
              e.target.value = val;
              register("total_lots").onChange(e);
            }}
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
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" onClick={onNext}>
              Skip for now
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <><Spinner className="mr-2" /> Continue</> : "Continue"}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
