"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { companySchema, type CompanyFormValues } from "@/lib/validations/onboarding-setup";
import { createCompany } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { PhoneInput } from "@/components/shared/phone-input";
import { LogoUpload } from "@/components/shared/logo-upload";

export function StepCompany({ onNext }: { onNext: () => void }) {
  const [pending, setPending] = useState(false);
  const [logoUrl, setLogoUrl] = useState("");
  const [phone, setPhone] = useState("+61 ");

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CompanyFormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(companySchema) as any,
  });

  async function onSubmit(data: CompanyFormValues) {
    setPending(true);
    const result = await createCompany({
      ...data,
      phone,
      logo_url: logoUrl || undefined,
    });
    setPending(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }

    toast.success("Company created");
    onNext();
  }

  return (
    <div>
      <h2 className="text-lg font-semibold text-foreground">
        Tell us about your management company
      </h2>
      <p className="mt-1 text-sm text-muted-foreground mb-6">
        This information appears on all documents sent to lot owners.
      </p>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-1.5">
          <Label>Company logo</Label>
          <LogoUpload value={logoUrl} onChange={setLogoUrl} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="name">
            Company name <span className="text-destructive">*</span>
          </Label>
          <Input
            id="name"
            placeholder="ABC Strata Management"
            aria-invalid={!!errors.name}
            {...register("name")}
          />
          {errors.name && (
            <p className="text-xs text-destructive mt-1">{errors.name.message}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="abn">ABN</Label>
          <Input
            id="abn"
            placeholder="12 345 678 901"
            {...register("abn")}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="address">
            Address <span className="text-destructive">*</span>
          </Label>
          <Input
            id="address"
            placeholder="123 Main Street, Melbourne VIC 3000"
            aria-invalid={!!errors.address}
            {...register("address")}
          />
          {errors.address && (
            <p className="text-xs text-destructive mt-1">{errors.address.message}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="phone">
            Phone <span className="text-destructive">*</span>
          </Label>
          <PhoneInput
            id="phone"
            value={phone}
            onChange={setPhone}
            error={!!errors.phone}
          />
          {errors.phone && (
            <p className="text-xs text-destructive mt-1">{errors.phone.message}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="email">
            Email <span className="text-destructive">*</span>
          </Label>
          <Input
            id="email"
            type="email"
            placeholder="info@abcstrata.com.au"
            aria-invalid={!!errors.email}
            {...register("email")}
          />
          {errors.email && (
            <p className="text-xs text-destructive mt-1">{errors.email.message}</p>
          )}
        </div>

        <div className="flex justify-end pt-2">
          <Button type="submit" disabled={pending}>
            {pending ? <><Spinner className="mr-2" /> Continue</> : "Continue"}
          </Button>
        </div>
      </form>
    </div>
  );
}
