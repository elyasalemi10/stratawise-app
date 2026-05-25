"use client";

import { useState, useRef } from "react";
import { toast } from "sonner";
import { Upload, Building2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateCompanyField, uploadCompanySignature } from "./actions";
import { updateCompanyLogo } from "@/lib/actions/company-branding";
import { MAX_LOGO_BYTES, MAX_LOGO_WIDTH, MAX_LOGO_HEIGHT } from "@/lib/actions/company-branding-constants";
import { BrandColourPicker } from "@/components/shared/brand-colour-picker";

interface CompanyData {
  id: string;
  name: string;
  abn: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  logo_url: string | null;
  registered_name: string | null;
  signature_url: string | null;
  brand_color: string | null;
}

function EditableRow({
  label,
  value,
  field,
  companyId,
}: {
  label: string;
  value: string | null;
  field: string;
  companyId: string;
}) {
  const [editValue, setEditValue] = useState(value ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (editValue === (value ?? "")) return;
    setSaving(true);
    const result = await updateCompanyField(companyId, field, editValue || null);
    setSaving(false);
    if (result.error) {
      toast.error(result.error);
      setEditValue(value ?? "");
    } else {
      toast.success(`${label} updated`);
    }
  }

  return (
    <div className="flex items-center justify-between py-3 border-b border-border/50 last:border-b-0">
      <Label className="text-sm text-muted-foreground w-32 shrink-0">{label}</Label>
      <Input
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => { if (e.key === "Enter") { save(); (e.target as HTMLInputElement).blur(); } }}
        disabled={saving}
        className="h-8 text-sm max-w-sm text-right"
        placeholder={`Enter ${label.toLowerCase()}`}
      />
    </div>
  );
}

export function CompanyTab({ company }: { company: CompanyData | null }) {
  const [logoUrl, setLogoUrl] = useState(company?.logo_url ?? null);
  const [signatureUrl, setSignatureUrl] = useState(company?.signature_url ?? null);
  const [brandColor, setBrandColor] = useState(company?.brand_color ?? "");
  const [uploading, setUploading] = useState(false);
  const [uploadingSig, setUploadingSig] = useState(false);

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

      {/* Brand colour , drives levy + budget PDF accents (header strip,
          page-bottom rule). */}
      <Card>
        <CardContent className="pt-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">Brand colour</h3>
          <div className="flex items-center gap-4">
            <BrandColourPicker value={brandColor} onChange={saveBrandColor} />
            <p className="text-xs text-muted-foreground">
              Click the swatch to pick a hex. Used on levy notices, budget reports, and other branded documents you generate.
            </p>
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

      {/* Company details */}
      <Card>
        <CardContent className="pt-5">
          <h3 className="text-sm font-semibold text-foreground mb-3">Company details</h3>
          <EditableRow label="Company name" value={company.name} field="name" companyId={company.id} />
          <EditableRow label="Registered name" value={company.registered_name} field="registered_name" companyId={company.id} />
          <EditableRow label="ABN" value={company.abn} field="abn" companyId={company.id} />
          <EditableRow label="Address" value={company.address} field="address" companyId={company.id} />
          <EditableRow label="Phone" value={company.phone} field="phone" companyId={company.id} />
          <EditableRow label="Email" value={company.email} field="email" companyId={company.id} />
        </CardContent>
      </Card>
    </div>
  );
}
