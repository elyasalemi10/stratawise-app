"use client";

import { useState, useRef } from "react";
import { toast } from "sonner";
import { Upload, Building2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateCompanyField, uploadCompanyLogo } from "./actions";

interface CompanyData {
  id: string;
  name: string;
  abn: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  logo_url: string | null;
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
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

    if (file.size > 2 * 1024 * 1024) {
      toast.error("Logo must be under 2MB");
      return;
    }

    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("company_id", company!.id);

    const result = await uploadCompanyLogo(formData);
    setUploading(false);

    if (result.error) {
      toast.error(result.error);
    } else if (result.url) {
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
              <p className="mt-1 text-xs text-muted-foreground">PNG or JPG, max 2MB. Used on levy notices.</p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg"
                onChange={handleLogoUpload}
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
          <EditableRow label="ABN" value={company.abn} field="abn" companyId={company.id} />
          <EditableRow label="Address" value={company.address} field="address" companyId={company.id} />
          <EditableRow label="Phone" value={company.phone} field="phone" companyId={company.id} />
          <EditableRow label="Email" value={company.email} field="email" companyId={company.id} />
        </CardContent>
      </Card>
    </div>
  );
}
