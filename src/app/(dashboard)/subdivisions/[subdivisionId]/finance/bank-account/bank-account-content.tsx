"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Pencil, Check } from "lucide-react";
import { updateSubdivisionField } from "../../manage/actions";

export function BankAccountContent({
  subdivisionId,
  bankBsb: initialBsb,
  bankAccountNumber: initialAccountNumber,
  bankAccountName: initialAccountName,
}: {
  subdivisionId: string;
  bankBsb: string;
  bankAccountNumber: string;
  bankAccountName: string;
}) {
  const [editing, setEditing] = useState(false);
  const [bsb, setBsb] = useState(initialBsb);
  const [accountNumber, setAccountNumber] = useState(initialAccountNumber);
  const [accountName, setAccountName] = useState(initialAccountName);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    const results = await Promise.all([
      updateSubdivisionField(subdivisionId, "bank_bsb", bsb || null),
      updateSubdivisionField(subdivisionId, "bank_account_number", accountNumber || null),
      updateSubdivisionField(subdivisionId, "bank_account_name", accountName || null),
    ]);
    setSaving(false);

    const error = results.find((r) => r.error);
    if (error) {
      toast.error(error.error);
    } else {
      toast.success("Bank details updated");
      setEditing(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-foreground">Bank account</h1>
        {editing ? (
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => { setEditing(false); setBsb(initialBsb); setAccountNumber(initialAccountNumber); setAccountName(initialAccountName); }} className="cursor-pointer">
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving} className="cursor-pointer">
              <Check className="mr-2 h-3.5 w-3.5" />
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        ) : (
          <Button variant="secondary" size="sm" onClick={() => setEditing(true)} className="cursor-pointer">
            <Pencil className="mr-2 h-3.5 w-3.5" />
            Edit
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="pt-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">EFT details</h3>
          <p className="text-xs text-muted-foreground mb-4">These details appear on levy notices for lot owners to make payments.</p>

          <div className="space-y-4">
            <div className="flex items-center justify-between py-2 border-b border-border/50">
              <Label className="text-sm text-muted-foreground w-40">BSB</Label>
              {editing ? (
                <Input value={bsb} onChange={(e) => setBsb(e.target.value)} placeholder="000-000" className="h-8 text-sm max-w-xs text-right" />
              ) : (
                <span className="text-sm font-medium text-foreground">{bsb || "Not set"}</span>
              )}
            </div>

            <div className="flex items-center justify-between py-2 border-b border-border/50">
              <Label className="text-sm text-muted-foreground w-40">Account number</Label>
              {editing ? (
                <Input value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} placeholder="12345678" className="h-8 text-sm max-w-xs text-right" />
              ) : (
                <span className="text-sm font-medium text-foreground">{accountNumber || "Not set"}</span>
              )}
            </div>

            <div className="flex items-center justify-between py-2">
              <Label className="text-sm text-muted-foreground w-40">Account name</Label>
              {editing ? (
                <Input value={accountName} onChange={(e) => setAccountName(e.target.value)} placeholder="OC Fund Account" className="h-8 text-sm max-w-xs text-right" />
              ) : (
                <span className="text-sm font-medium text-foreground">{accountName || "Not set"}</span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
