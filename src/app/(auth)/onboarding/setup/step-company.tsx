"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { companySchema, type CompanyFormValues } from "@/lib/validations/onboarding-setup";
import { createCompany } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { PhoneInput } from "@/components/shared/phone-input";
import { LogoUpload } from "@/components/shared/logo-upload";
import { BrandColourPicker } from "@/components/shared/brand-colour-picker";
import { PlacesAutocomplete } from "@/components/shared/places-autocomplete";
import { getSupabaseClient } from "@/lib/supabase";

// Format 11 raw digits as "XX XXX XXX XXX"
function formatAbn(digits: string): string {
  const d = digits.replace(/\D/g, "").slice(0, 11);
  if (d.length === 0) return "";
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0, 2)} ${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5)}`;
  return `${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5, 8)} ${d.slice(8)}`;
}

export function StepCompany({ onNext }: { onNext: () => void }) {
  const [userEmail, setUserEmail] = useState("");
  useEffect(() => {
    getSupabaseClient().auth.getUser().then(({ data }) => {
      setUserEmail(data.user?.email ?? "");
    });
  }, []);

  const [pending, setPending] = useState(false);
  const [logoUrl, setLogoUrl] = useState("");
  const [brandColour, setBrandColour] = useState("");
  const [phone, setPhone] = useState("+61 ");
  const [phoneInvalid, setPhoneInvalid] = useState(false);
  const [abn, setAbn] = useState("");
  const [abnInvalid, setAbnInvalid] = useState(false);
  const [address, setAddress] = useState("");
  const [addressInvalid, setAddressInvalid] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [consentError, setConsentError] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<CompanyFormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(companySchema) as any,
  });

  async function onSubmit(data: CompanyFormValues) {
    if (!agreed) {
      setConsentError(true);
      toast.error("Accept the terms to continue.");
      return;
    }
    setConsentError(false);

    if (!phone || phone.replace(/\s/g, "").length < 6) {
      setPhoneInvalid(true);
      toast.error("Please enter a valid phone number");
      return;
    }
    setPhoneInvalid(false);

    // ABN — optional but if present must be exactly 11 digits
    const abnDigits = abn.replace(/\D/g, "");
    if (abnDigits.length > 0 && abnDigits.length !== 11) {
      setAbnInvalid(true);
      toast.error("ABN must be 11 digits.");
      return;
    }
    setAbnInvalid(false);

    if (address.trim().length < 3) {
      setAddressInvalid(true);
      toast.error("Address is required.");
      return;
    }
    setAddressInvalid(false);

    setPending(true);
    const result = await createCompany({
      name: data.name,
      abn: abnDigits || undefined,
      address,
      phone: phone.trim(),
      email: userEmail,
      logo_url: logoUrl || undefined,
      brand_color: brandColour || undefined,
    });

    if (result.error) {
      setPending(false);
      toast.error(result.error);
      return;
    }

    // Keep pending true while we navigate — no flash of un-greyed button
    onNext();
  }

  return (
    <div>
      <div className="text-center mb-8">
        <h2 className="text-lg font-semibold text-foreground">
          Tell us about your management company
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          This information appears on all documents sent to lot owners.
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} autoComplete="off" className="space-y-4">
        <div className="space-y-1.5">
          <Label>Company logo</Label>
          <LogoUpload
            value={logoUrl}
            onChange={setLogoUrl}
            onColourExtracted={(hex) => {
              // Only pre-fill if the user hasn't already chosen a colour
              if (hex && !brandColour) setBrandColour(hex);
            }}
          />
          <p className="text-xs text-muted-foreground">
            Recommended: 800×400 PNG with transparent background.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="brand-colour">Brand colour</Label>
          <BrandColourPicker
            id="brand-colour"
            value={brandColour}
            onChange={setBrandColour}
          />
          <p className="text-xs text-muted-foreground">
            Used on levy notices and other documents — not on the app UI.
            We&apos;ll try to pull it from your logo automatically.
          </p>
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
            inputMode="numeric"
            value={abn}
            onChange={(e) => {
              setAbn(formatAbn(e.target.value));
              if (abnInvalid) setAbnInvalid(false);
            }}
            onPaste={(e) => {
              e.preventDefault();
              const pasted = e.clipboardData.getData("text");
              setAbn(formatAbn(pasted));
              if (abnInvalid) setAbnInvalid(false);
            }}
            // 14 = 11 digits + 3 separating spaces — physically caps typing length
            maxLength={14}
            aria-invalid={abnInvalid || undefined}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="company-address">
            Address <span className="text-destructive">*</span>
          </Label>
          <PlacesAutocomplete
            id="company-address"
            value={address}
            onChange={(v) => {
              setAddress(v);
              setValue("address", v);
              if (addressInvalid) setAddressInvalid(false);
            }}
            placeholder="Start typing your business address…"
            invalid={addressInvalid || !!errors.address}
          />
          {(addressInvalid || errors.address) && (
            <p className="text-xs text-destructive mt-1">
              {errors.address?.message ?? "Address is required"}
            </p>
          )}
          {/* Hidden field so react-hook-form's submit still has the value */}
          <input type="hidden" {...register("address")} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="company-phone">
            Phone <span className="text-destructive">*</span>
          </Label>
          <PhoneInput
            id="company-phone"
            value={phone}
            onChange={(v) => {
              setPhone(v);
              if (phoneInvalid) setPhoneInvalid(false);
            }}
            error={phoneInvalid}
          />
        </div>

        {/* Single consent checkbox — covers both ToS and Privacy. */}
        <div className="border-t border-border pt-4 mt-6">
          <div className="flex items-start gap-3">
            <Checkbox
              id="agree"
              checked={agreed}
              onCheckedChange={(checked) => {
                setAgreed(checked === true);
                if (checked) setConsentError(false);
              }}
              aria-invalid={consentError || undefined}
            />
            <Label htmlFor="agree" className="text-sm text-foreground leading-snug cursor-pointer font-normal">
              I have read and agree to the{" "}
              <Link href="/legal/terms" target="_blank" className="text-primary hover:underline">
                Terms of Service
              </Link>{" "}
              and{" "}
              <Link href="/legal/privacy" target="_blank" className="text-primary hover:underline">
                Privacy Policy
              </Link>
              .
            </Label>
          </div>
          {consentError && (
            <p className="mt-2 text-xs text-destructive">
              You must accept the terms to continue.
            </p>
          )}
        </div>

        <div className="flex justify-end pt-2">
          <Button type="submit" disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            Continue
          </Button>
        </div>
      </form>
    </div>
  );
}
