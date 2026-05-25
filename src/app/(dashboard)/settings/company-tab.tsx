"use client";

import { useState, useRef } from "react";
import { toast } from "sonner";
import { Upload, Building2, Pencil, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
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
  brand_color_secondary: string | null;
}

function ReadOnlyRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-border/50 last:border-b-0">
      <Label className="text-sm text-muted-foreground w-40 shrink-0">{label}</Label>
      <span className="text-sm text-foreground text-right truncate max-w-sm">
        {value || <span className="text-muted-foreground/60">Not set</span>}
      </span>
    </div>
  );
}

interface CompanyDetailsForEdit {
  id: string;
  name: string;
  registered_name: string | null;
  abn: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
}

function EditCompanyDrawer({
  open, onOpenChange, company, onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  company: CompanyDetailsForEdit;
  onSaved: (updates: Partial<CompanyDetailsForEdit>) => void;
}) {
  const [draft, setDraft] = useState({
    name: company.name,
    registered_name: company.registered_name ?? "",
    abn: company.abn ?? "",
    address: company.address ?? "",
    phone: company.phone ?? "",
    email: company.email ?? "",
  });
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    // Only push fields the user actually changed , no point burning a row
    // version on identical values.
    const dirty: Record<string, string | null> = {};
    if (draft.name !== company.name) dirty.name = draft.name;
    if (draft.registered_name !== (company.registered_name ?? "")) dirty.registered_name = draft.registered_name || null;
    if (draft.abn !== (company.abn ?? "")) dirty.abn = draft.abn || null;
    if (draft.address !== (company.address ?? "")) dirty.address = draft.address || null;
    if (draft.phone !== (company.phone ?? "")) dirty.phone = draft.phone || null;
    if (draft.email !== (company.email ?? "")) dirty.email = draft.email || null;

    for (const [field, value] of Object.entries(dirty)) {
      const result = await updateCompanyField(company.id, field, value);
      if (result.error) {
        setSaving(false);
        toast.error(result.error);
        return;
      }
    }
    setSaving(false);
    if (Object.keys(dirty).length === 0) {
      toast.success("No changes");
    } else {
      toast.success("Company details updated");
      // Mirror the changes back to the parent (strip nulls back to undefined-or-string).
      onSaved(Object.fromEntries(
        Object.entries(dirty).map(([k, v]) => [k, v]),
      ) as Partial<CompanyDetailsForEdit>);
    }
    onOpenChange(false);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Edit company details</SheetTitle>
          <SheetDescription className="sr-only">Update company name, ABN, contact details and address.</SheetDescription>
        </SheetHeader>
        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
          <div className="space-y-1.5">
            <Label htmlFor="ed-name">Company name</Label>
            <Input id="ed-name" value={draft.name} onChange={(e) => setDraft((p) => ({ ...p, name: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ed-reg">Registered name</Label>
            <Input id="ed-reg" value={draft.registered_name} onChange={(e) => setDraft((p) => ({ ...p, registered_name: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ed-abn">ABN</Label>
            <Input id="ed-abn" value={draft.abn} onChange={(e) => setDraft((p) => ({ ...p, abn: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ed-addr">Address</Label>
            <Input id="ed-addr" value={draft.address} onChange={(e) => setDraft((p) => ({ ...p, address: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ed-phone">Phone</Label>
            <Input id="ed-phone" value={draft.phone} onChange={(e) => setDraft((p) => ({ ...p, phone: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ed-email">Email</Label>
            <Input id="ed-email" type="email" value={draft.email} onChange={(e) => setDraft((p) => ({ ...p, email: e.target.value }))} />
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-border p-4">
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            Save changes
          </Button>
        </div>
      </SheetContent>
    </Sheet>
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
  const [editOpen, setEditOpen] = useState(false);

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

      {/* Company details , read-only by default; Edit opens a drawer. */}
      <Card>
        <CardContent className="pt-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Company details</h3>
            <Button variant="secondary" size="sm" onClick={() => setEditOpen(true)}>
              <Pencil className="size-3.5" />
              Edit
            </Button>
          </div>
          <ReadOnlyRow label="Company name" value={localCompany!.name} />
          <ReadOnlyRow label="Registered name" value={localCompany!.registered_name} />
          <ReadOnlyRow label="ABN" value={localCompany!.abn} />
          <ReadOnlyRow label="Address" value={localCompany!.address} />
          <ReadOnlyRow label="Phone" value={localCompany!.phone} />
          <ReadOnlyRow label="Email" value={localCompany!.email} />
        </CardContent>
      </Card>

      <EditCompanyDrawer
        open={editOpen}
        onOpenChange={setEditOpen}
        company={{
          id: localCompany!.id,
          name: localCompany!.name,
          registered_name: localCompany!.registered_name,
          abn: localCompany!.abn,
          address: localCompany!.address,
          phone: localCompany!.phone,
          email: localCompany!.email,
        }}
        onSaved={(updates) => {
          setLocalCompany((prev) => prev ? ({
            ...prev,
            name: typeof updates.name === "string" ? updates.name : prev.name,
            registered_name: "registered_name" in updates ? (updates.registered_name as string | null) : prev.registered_name,
            abn: "abn" in updates ? (updates.abn as string | null) : prev.abn,
            address: "address" in updates ? (updates.address as string | null) : prev.address,
            phone: "phone" in updates ? (updates.phone as string | null) : prev.phone,
            email: "email" in updates ? (updates.email as string | null) : prev.email,
          }) : prev);
        }}
      />
    </div>
  );
}
