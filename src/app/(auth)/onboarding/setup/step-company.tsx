"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import Link from "next/link";
import { companySchema, type CompanyFormValues } from "@/lib/validations/onboarding-setup";
import { createCompany } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Spinner } from "@/components/ui/spinner";
import { PhoneInput } from "@/components/shared/phone-input";
import { LogoUpload } from "@/components/shared/logo-upload";
import { getSupabaseClient } from "@/lib/supabase";

export function StepCompany({ onNext }: { onNext: () => void }) {
  const [userEmail, setUserEmail] = useState("");
  useEffect(() => {
    getSupabaseClient().auth.getUser().then(({ data }) => {
      setUserEmail(data.user?.email ?? "");
    });
  }, []);
  const clerkEmail = userEmail; // legacy var name — pre-fills the company email field

  const [pending, setPending] = useState(false);
  const [logoUrl, setLogoUrl] = useState("");
  const [phone, setPhone] = useState("+61 ");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [consentError, setConsentError] = useState("");

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CompanyFormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(companySchema) as any,
  });

  async function onSubmit(data: CompanyFormValues) {
    if (!termsAccepted || !privacyAccepted) {
      setConsentError("You must accept both the Terms of Service and Privacy Policy to continue.");
      return;
    }
    setConsentError("");

    if (!phone || phone.replace(/\s/g, "").length < 6) {
      toast.error("Please enter a valid phone number");
      return;
    }

    setPending(true);
    const result = await createCompany({
      name: data.name,
      abn: data.abn,
      address: data.address,
      phone: phone.trim(),
      email: clerkEmail,
      logo_url: logoUrl || undefined,
    });
    setPending(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }

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

      <form onSubmit={handleSubmit(onSubmit)} autoComplete="off" className="space-y-4">
        <div className="space-y-1.5">
          <Label>Company logo</Label>
          <LogoUpload value={logoUrl} onChange={setLogoUrl} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="company-name">
            Company name <span className="text-destructive">*</span>
          </Label>
          <Input
            id="company-name"
            placeholder="ABC Strata Management"
            autoComplete="off"
            aria-invalid={!!errors.name}
            {...register("name")}
          />
          {errors.name && (
            <p className="text-xs text-destructive mt-1">{errors.name.message}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="company-abn">ABN</Label>
          <Input
            id="company-abn"
            placeholder="12 345 678 901"
            autoComplete="off"
            {...register("abn")}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="company-address">Address</Label>
          <Input
            id="company-address"
            placeholder="123 Main Street, Melbourne VIC 3000"
            autoComplete="off"
            {...register("address")}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="company-phone">
            Phone <span className="text-destructive">*</span>
          </Label>
          <PhoneInput
            id="company-phone"
            value={phone}
            onChange={setPhone}
          />
        </div>

        {/* T&Cs consent */}
        <div className="border-t border-border pt-4 mt-6 space-y-3">
          <div className="flex items-start gap-3">
            <Checkbox
              id="terms"
              checked={termsAccepted}
              onCheckedChange={(checked) => {
                setTermsAccepted(checked === true);
                if (checked) setConsentError("");
              }}
            />
            <Label htmlFor="terms" className="text-sm text-foreground leading-snug cursor-pointer font-normal">
              I have read and agree to the{" "}
              <Link href="/legal/terms" target="_blank" className="text-primary hover:underline">
                Terms of Service
              </Link>
            </Label>
          </div>

          <div className="flex items-start gap-3">
            <Checkbox
              id="privacy"
              checked={privacyAccepted}
              onCheckedChange={(checked) => {
                setPrivacyAccepted(checked === true);
                if (checked) setConsentError("");
              }}
            />
            <Label htmlFor="privacy" className="text-sm text-foreground leading-snug cursor-pointer font-normal">
              I have read and agree to the{" "}
              <Link href="/legal/privacy" target="_blank" className="text-primary hover:underline">
                Privacy Policy
              </Link>
            </Label>
          </div>

          {consentError && (
            <p className="text-xs text-destructive">{consentError}</p>
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
