"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { subdivisionSchema, type SubdivisionFormValues } from "@/lib/validations/onboarding-setup";
import { createSubdivision } from "@/app/(auth)/onboarding/setup/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { SuburbSelect } from "@/components/shared/suburb-select";

export default function NewSubdivisionPage() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [suburb, setSuburb] = useState("");
  const [suburbError, setSuburbError] = useState("");

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
    if (!suburb) {
      setSuburbError("Please select a suburb");
      return;
    }
    setSuburbError("");

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

    if (result.subdivisionId) {
      router.push(`/subdivisions/${result.subdivisionId}/dashboard`);
    } else {
      router.push("/subdivisions");
    }
  }

  function fieldError(field: keyof typeof errors): string | undefined {
    const err = errors[field];
    if (!err?.message) return undefined;
    const msg = err.message as string;
    if (msg.includes("Invalid input") || msg.includes("expected")) {
      const fallbacks: Record<string, string> = {
        plan_number: "Plan number is required",
        name: "Subdivision name is required",
        street: "Street address is required",
        total_lots: "Please enter a valid number of lots (minimum 2)",
      };
      return fallbacks[field] ?? "This field is required";
    }
    return msg;
  }

  return (
    <div className="max-w-2xl">
      <Card>
        <CardContent className="pt-5">
          <form onSubmit={handleSubmit(onSubmit)} autoComplete="off" className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="plan">
                Plan number <span className="text-destructive">*</span>
              </Label>
              <Input
                id="plan"
                placeholder="PS123456A"
                autoComplete="off"
                aria-invalid={!!errors.plan_number}
                {...register("plan_number")}
              />
              {errors.plan_number && (
                <p className="text-xs text-destructive mt-1">{fieldError("plan_number")}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="name">
                Subdivision name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="name"
                placeholder="Riverside Townhouses"
                autoComplete="off"
                aria-invalid={!!errors.name}
                {...register("name")}
              />
              {errors.name && (
                <p className="text-xs text-destructive mt-1">{fieldError("name")}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="street">
                Street address <span className="text-destructive">*</span>
              </Label>
              <Input
                id="street"
                placeholder="1-12/45 Smith Street"
                autoComplete="off"
                aria-invalid={!!errors.street}
                {...register("street")}
              />
              {errors.street && (
                <p className="text-xs text-destructive mt-1">{fieldError("street")}</p>
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
                  setSuburbError("");
                }}
                error={!!suburbError}
              />
              {suburbError && (
                <p className="text-xs text-destructive mt-1">{suburbError}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="lots">
                Number of lots <span className="text-destructive">*</span>
              </Label>
              <Input
                id="lots"
                inputMode="numeric"
                placeholder="12"
                autoComplete="off"
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
                <p className="text-xs text-destructive mt-1">{fieldError("total_lots")}</p>
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

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => router.back()}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? <><Spinner className="mr-2" /> Creating</> : "Create subdivision"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
