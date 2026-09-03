"use client";

import { useState, useRef } from "react";
import { toast } from "sonner";
import { Upload, Building2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/shared/phone-input";
import { Label } from "@/components/ui/label";
import {
  } from "@/components/ui/sheet";
import { updateCompanyField, uploadCompanySignature } from "./actions";
import { useFieldSave } from "./use-field-save";
import { updateCompanyLogo } from "@/lib/actions/company-branding";
import { MAX_LOGO_BYTES, MAX_LOGO_WIDTH, MAX_LOGO_HEIGHT } from "@/lib/actions/company-branding-constants";
import { BrandColourPicker } from "@/components/shared/brand-colour-picker";
import { invalidateCached } from "@/lib/use-cached-data";

interface CompanyData {
  id: string;
  name: string;
  trading_as: string | null;
  abn: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  logo_url: string | null;
  registered_name: string | null;
  signature_url: string | null;
  brand_color: string | null;
  brand_color_secondary: string | null;
}



// One company field, saved on blur. See use-field-save.ts for why there is
// no Save button.
function CompanyField({
  id,
  label,
  field,
  company,
  onSaved,
}: {
  id: string;
  label: string;
  field: "name" | "trading_as" | "registered_name" | "abn" | "address" | "phone" | "email";
  company: CompanyData;
  onSaved: (field: string, value: string) => void;
}) {
  const f = useFieldSave(
    String(company[field] ?? ""),
    async (value) => {
      const res = await updateCompanyField(company.id, field, value || null);
      if (!res?.error) onSaved(field, value);
      return res ?? {};
    },
    // Seven fields on one page all saying "Saved" tells you something
    // saved, not which.
    { successMessage: `${label} saved` },
  );

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {field === "phone" ? (
        <PhoneInput
          id={id}
          value={f.value}
          onChange={f.onChange}
          onBlur={f.onBlur}
          error={f.invalid}
        />
      ) : (
        <Input
          id={id}
          value={f.value}
          onChange={(e) => f.onChange(e.target.value)}
          onBlur={f.onBlur}
          aria-invalid={f.invalid || undefined}
          placeholder={label}
        />
      )}
    </div>
  );
}

export function CompanyTab({ company }: { company: CompanyData | null }) {
  const [logoUrl, setLogoUrl] = useState(company?.logo_url ?? null);
  const [signatureUrl, setSignatureUrl] = useState(company?.signature_url ?? null);
  const [brandColor, setBrandColor] = useState(company?.brand_color ?? "");
  const [brandColorSecondary, setBrandColorSecondary] = useState(company?.brand_color_secondary ?? "");
  const [uploading, setUploading] = useState(false);
  const [uploadingSig, setUploadingSig] = useState(false);
  // Locally tracked overlay of the company fields so the read-only rows
  // re-render immediately after the edit drawer saves.
  const [localCompany, setLocalCompany] = useState(company);

  // Each field writes just itself, so the local copy is patched key by key
  // rather than replaced wholesale.
  const patchCompany = (field: string, value: string) => {
    setLocalCompany((prev) => (prev ? { ...prev, [field]: value || null } : prev));
    // The tab cache still holds the pre-edit company; drop it so coming back
    // does not flash the old value before the behind-fetch corrects it.
    invalidateCached("settings:company");
  };

  async function saveBrandColor(hex: string) {
    if (!company) return;
    setBrandColor(hex);
    const result = await updateCompanyField(company.id, "brand_color", hex || null);
    if (result.error) {
      toast.error(result.error);
      setBrandColor(company.brand_color ?? "");
    } else {
      toast.success("Brand colour updated");
    }
  }

  async function saveBrandColorSecondary(hex: string) {
    if (!company) return;
    setBrandColorSecondary(hex);
    const result = await updateCompanyField(company.id, "brand_color_secondary", hex || null);
    if (result.error) {
      toast.error(result.error);
      setBrandColorSecondary(company.brand_color_secondary ?? "");
    } else {
      toast.success("Secondary colour updated");
    }
  }
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sigInputRef = useRef<HTMLInputElement>(null);

  if (!company) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Building2 className="h-10 w-10 text-muted-foreground/30 mx-auto" />
          <p className="mt-3 text-sm text-muted-foreground">No management company found.</p>
        </CardContent>
      </Card>
    );
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Client-side guard: matches the server-side validateLogoFile shape so
    // users get fast feedback on obvious rejects without burning a round
    // trip. Server still enforces canonically.
    if (file.size > MAX_LOGO_BYTES) {
      toast.error(`Logo must be under ${MAX_LOGO_BYTES / 1024 / 1024}MB`);
      return;
    }

    // Probe dimensions client-side for raster types (skip SVG).
    if (file.type !== "image/svg+xml") {
      const ok = await new Promise<boolean>((resolve) => {
        const img = new Image();
        img.onload = () => {
          if (img.width > MAX_LOGO_WIDTH || img.height > MAX_LOGO_HEIGHT) {
            toast.error(`Logo must be ≤${MAX_LOGO_WIDTH}×${MAX_LOGO_HEIGHT}px (got ${img.width}×${img.height})`);
            resolve(false);
          } else {
            resolve(true);
          }
        };
        img.onerror = () => {
          toast.error("Could not read image. File may be corrupted.");
          resolve(false);
        };
        img.src = URL.createObjectURL(file);
      });
      if (!ok) return;
    }

    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("company_id", company!.id);

    const result = await updateCompanyLogo(formData);
    setUploading(false);

    if ("error" in result) {
      toast.error(result.error);
    } else {
      setLogoUrl(result.url);
      toast.success("Logo updated");
    }
  }

  return (
    <div className="space-y-6">
      {/* Logo */}
      <Card>
        <CardContent className="pt-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">Company logo</h3>
          <div className="flex items-center gap-4">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoUrl}
                alt="Company logo"
                className="h-16 max-w-[200px] object-contain rounded border border-border"
              />
            ) : (
              <div className="h-16 w-32 rounded border border-dashed border-border flex items-center justify-center text-xs text-muted-foreground">
                No logo
              </div>
            )}
            <div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                <Upload className="mr-2 h-3.5 w-3.5" />
                {uploading ? "Uploading..." : "Upload logo"}
              </Button>
              <p className="mt-1 text-xs text-muted-foreground">PNG, JPG, or SVG. Max 1MB, 800×400px. Used on levy notices and emails.</p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/svg+xml"
                onChange={handleLogoUpload}
                className="hidden"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Brand colours , primary drives the header strip + section
          accents; secondary drives the due-date callout + footer rule on
          levy notices. */}
      <Card>
        <CardContent className="pt-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">Brand colours</h3>
          <div className="flex flex-wrap items-center gap-6">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">Primary</Label>
              <BrandColourPicker value={brandColor} onChange={saveBrandColor} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">Secondary</Label>
              <BrandColourPicker value={brandColorSecondary} onChange={saveBrandColorSecondary} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Signature */}
      <Card>
        <CardContent className="pt-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">Authorised signature</h3>
          <div className="flex items-center gap-4">
            {signatureUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={signatureUrl}
                alt="Signature"
                className="h-12 max-w-[200px] object-contain rounded border border-border bg-white p-1"
              />
            ) : (
              <div className="h-12 w-32 rounded border border-dashed border-border flex items-center justify-center text-xs text-muted-foreground">
                No signature
              </div>
            )}
            <div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => sigInputRef.current?.click()}
                disabled={uploadingSig}
              >
                <Upload className="mr-2 h-3.5 w-3.5" />
                {uploadingSig ? "Uploading..." : "Upload signature"}
              </Button>
              <p className="mt-1 text-xs text-muted-foreground">PNG with transparent background. Used on OC certificates.</p>
              <input
                ref={sigInputRef}
                type="file"
                accept="image/png,image/jpeg"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file || !company) return;
                  if (file.size > 2 * 1024 * 1024) { toast.error("File must be under 2MB"); return; }
                  setUploadingSig(true);
                  const formData = new FormData();
                  formData.append("file", file);
                  formData.append("company_id", company.id);
                  const result = await uploadCompanySignature(formData);
                  setUploadingSig(false);
                  if (result.error) { toast.error(result.error); }
                  else if (result.url) { setSignatureUrl(result.url); toast.success("Signature updated"); }
                }}
                className="hidden"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Company details , edited in place.

          These were read-only rows behind an Edit button that opened a
          drawer: changing a phone number meant a click to reveal the fields,
          a click to save, and the current values hidden behind a modal while
          you typed. They are just fields. Each saves when you leave it. */}
      <Card>
        <CardContent className="pt-5">
          <h3 className="mb-4 text-sm font-semibold text-foreground">Company details</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <CompanyField id="co-name" label="Company name" field="name" company={localCompany!} onSaved={patchCompany} />
            <CompanyField id="co-trad" label="Trading name" field="trading_as" company={localCompany!} onSaved={patchCompany} />
            <CompanyField id="co-reg" label="Registered name" field="registered_name" company={localCompany!} onSaved={patchCompany} />
            <CompanyField id="co-abn" label="ABN" field="abn" company={localCompany!} onSaved={patchCompany} />
            <CompanyField id="co-phone" label="Phone" field="phone" company={localCompany!} onSaved={patchCompany} />
            <CompanyField id="co-email" label="Email" field="email" company={localCompany!} onSaved={patchCompany} />
            <div className="sm:col-span-2">
              <CompanyField id="co-addr" label="Address" field="address" company={localCompany!} onSaved={patchCompany} />
            </div>
          </div>
        </CardContent>
      </Card>

    </div>
  );
}
