"use client";

import { useState, useCallback } from "react";
import { PDFViewer, pdf } from "@react-pdf/renderer";
import { LevyNotice } from "@/lib/pdf/templates/levy-notice";
import type { LevyNoticeProps } from "@/lib/pdf/types";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Download, Plus, Trash2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";

const DEFAULT_DATA: LevyNoticeProps = {
  managementCompany: {
    name: "MyOCM",
    logo_url: null,
  },
  oc: {
    name: "Grace Avenue Townhouses",
    address: "12 - 14 Grace Avenue, Dandenong VIC 3175",
    abn: null,
    plan_number: "PS932352U",
  },
  referenceNumber: "LEV-0001",
  date: new Date(),
  documentTitle: "Levy Notice",
  lotOwner: {
    name: "Mustafa Maqsudi",
    lot_number: "1",
    address: "12 - 14 Grace Avenue, Dandenong VIC 3175",
  },
  levyPeriod: {
    start: "1 April 2026",
    end: "30 June 2026",
  },
  lineItems: [
    { description: "Insurance - 1 Year", amount: 6000 },
    { description: "Strata Management", amount: 1000 },
    { description: "Disbursement", amount: 124 },
    { description: "Emergency / Contingency Fund", amount: 125 },
  ],
  totalDue: 7249,
  dueDate: "8 April 2026",
  paymentInstructions: {
    bpay: null,
    eft: {
      bsb: "063-123",
      account_number: "1234 5678",
      account_name: "Riverside Townhouses OC Fund",
      reference: "LEV-0001",
    },
  },
  penaltyInterestRate: 2.0,
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">{title}</h3>
      {children}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        type={type}
        className="h-8 text-sm"
      />
    </div>
  );
}

export default function LevyTestPage() {
  const [data, setData] = useState(DEFAULT_DATA);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [brandPrimary, setBrandPrimary] = useState("#CFA753");
  const [brandSecondary, setBrandSecondary] = useState("#0E314C");
  const [includeBpay, setIncludeBpay] = useState(false);
  const [includeGst, setIncludeGst] = useState(false);

  // Helper to update nested fields
  const update = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (path: string, value: any) => {
      setData((prev) => {
        const next = { ...JSON.parse(JSON.stringify(prev)), date: prev.date } as typeof prev;
        const keys = path.split(".");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let obj: any = next;
        for (let i = 0; i < keys.length - 1; i++) {
          obj = obj[keys[i]];
        }
        obj[keys[keys.length - 1]] = value;
        // Recalculate total
        if (path.startsWith("lineItems")) {
          next.totalDue = next.lineItems.reduce((s, item) => s + item.amount, 0);
        }
        return next;
      });
      setRefreshKey((k) => k + 1);
    },
    []
  );

  function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setLogoPreview(dataUrl);
      update("managementCompany.logo_url", dataUrl);
    };
    reader.readAsDataURL(file);
  }

  function addLineItem() {
    const newItems = [...data.lineItems, { description: "New item", amount: 0 }];
    setData((prev) => ({
      ...prev,
      lineItems: newItems,
      totalDue: newItems.reduce((s, item) => s + item.amount, 0),
    }));
    setRefreshKey((k) => k + 1);
  }

  function removeLineItem(index: number) {
    const newItems = data.lineItems.filter((_, i) => i !== index);
    setData((prev) => ({
      ...prev,
      lineItems: newItems,
      totalDue: newItems.reduce((s, item) => s + item.amount, 0),
    }));
    setRefreshKey((k) => k + 1);
  }


  const pdfData = {
    ...data,
    paymentInstructions: {
      ...data.paymentInstructions,
      bpay: includeBpay ? data.paymentInstructions.bpay : null,
    },
    includeGst,
    brandColors: { primary: brandPrimary, secondary: brandSecondary },
  };

  async function downloadPDF() {
    const blob = await pdf(<LevyNotice {...pdfData} />).toBlob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `levy-notice-${data.referenceNumber}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border bg-card px-6 py-4">
        <div className="flex items-center justify-between max-w-[1800px] mx-auto">
          <div>
            <h1 className="text-lg font-semibold text-foreground">PDF template testing</h1>
            <p className="text-sm text-muted-foreground">Edit fields on the left, preview updates live on the right</p>
          </div>
          <Button onClick={downloadPDF}>
            <Download className="mr-2 h-4 w-4" />
            Download PDF
          </Button>
        </div>
      </div>

      <div className="max-w-[1800px] mx-auto p-6">
        <div className="grid grid-cols-1 lg:grid-cols-[400px_1fr] gap-6">
          {/* Left panel , editable fields */}
          <div className="space-y-6 overflow-y-auto max-h-[calc(100vh-120px)]">
            {/* Logo upload */}
            <Card>
              <CardContent className="pt-5 space-y-3">
                <Section title="Company logo">
                  <div className="flex items-center gap-3">
                    {logoPreview ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={logoPreview} alt="Logo" className="h-10 max-w-[120px] object-contain rounded border border-border" />
                    ) : (
                      <div className="h-10 w-20 rounded border border-dashed border-border flex items-center justify-center text-xs text-muted-foreground">
                        No logo
                      </div>
                    )}
                    <div>
                      <input type="file" accept="image/*" onChange={handleLogoUpload} className="text-xs" />
                    </div>
                  </div>
                </Section>
              </CardContent>
            </Card>

            {/* Brand colours */}
            <Card>
              <CardContent className="pt-5 space-y-3">
                <Section title="Brand colours">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Primary</Label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={brandPrimary}
                          onChange={(e) => {
                            setBrandPrimary(e.target.value);
                            setRefreshKey((k) => k + 1);
                          }}
                          className="h-8 w-10 cursor-pointer rounded border border-border"
                        />
                        <Input value={brandPrimary} onChange={(e) => { setBrandPrimary(e.target.value); setRefreshKey((k) => k + 1); }} className="h-8 text-xs font-mono" />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Secondary</Label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={brandSecondary}
                          onChange={(e) => {
                            setBrandSecondary(e.target.value);
                            setRefreshKey((k) => k + 1);
                          }}
                          className="h-8 w-10 cursor-pointer rounded border border-border"
                        />
                        <Input value={brandSecondary} onChange={(e) => { setBrandSecondary(e.target.value); setRefreshKey((k) => k + 1); }} className="h-8 text-xs font-mono" />
                      </div>
                    </div>
                  </div>
                </Section>
              </CardContent>
            </Card>

            {/* Management company */}
            <Card>
              <CardContent className="pt-5 space-y-3">
                <Section title="Management company">
                  <Field label="Company name" value={data.managementCompany.name} onChange={(v) => update("managementCompany.name", v)} />
                </Section>
              </CardContent>
            </Card>

            {/* OC */}
            <Card>
              <CardContent className="pt-5 space-y-3">
                <Section title="OC">
                  <Field label="Name" value={data.oc.name} onChange={(v) => update("oc.name", v)} />
                  <Field label="Address" value={data.oc.address} onChange={(v) => update("oc.address", v)} />
                  <Field label="ABN" value={data.oc.abn ?? ""} onChange={(v) => update("oc.abn", v)} />
                  <Field label="Plan number" value={data.oc.plan_number} onChange={(v) => update("oc.plan_number", v)} />
                </Section>
              </CardContent>
            </Card>

            {/* Reference */}
            <Card>
              <CardContent className="pt-5 space-y-3">
                <Section title="Document">
                  <Field label="Title" value={data.documentTitle} onChange={(v) => update("documentTitle", v)} placeholder="Levy Notice" />
                  <Field label="Reference number" value={data.referenceNumber} onChange={(v) => update("referenceNumber", v)} />
                  <Field label="Due date" value={data.dueDate} onChange={(v) => update("dueDate", v)} />
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Include GST (10%)</Label>
                    <Switch
                      checked={includeGst}
                      onCheckedChange={(checked) => {
                        setIncludeGst(checked);
                        setRefreshKey((k) => k + 1);
                      }}
                    />
                  </div>
                </Section>
              </CardContent>
            </Card>

            {/* Lot owner */}
            <Card>
              <CardContent className="pt-5 space-y-3">
                <Section title="Lot owner">
                  <Field label="Name" value={data.lotOwner.name} onChange={(v) => update("lotOwner.name", v)} />
                  <Field label="Lot number" value={data.lotOwner.lot_number} onChange={(v) => update("lotOwner.lot_number", v)} />
                  <Field label="Address" value={data.lotOwner.address} onChange={(v) => update("lotOwner.address", v)} />
                </Section>
              </CardContent>
            </Card>

            {/* Levy period */}
            <Card>
              <CardContent className="pt-5 space-y-3">
                <Section title="Levy period">
                  <Field label="Start" value={data.levyPeriod.start} onChange={(v) => update("levyPeriod.start", v)} />
                  <Field label="End" value={data.levyPeriod.end} onChange={(v) => update("levyPeriod.end", v)} />
                </Section>
              </CardContent>
            </Card>

            {/* Note */}
            <Card>
              <CardContent className="pt-5 space-y-3">
                <Section title="Note">
                  <div className="space-y-1">
                    <Label className="text-xs">Custom note (optional)</Label>
                    <textarea
                      value={data.note ?? ""}
                      onChange={(e) => update("note", e.target.value || undefined)}
                      placeholder="Add a note to the levy notice..."
                      rows={3}
                      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                    />
                  </div>
                </Section>
              </CardContent>
            </Card>

            {/* Line items */}
            <Card>
              <CardContent className="pt-5 space-y-3">
                <Section title="Line items">
                  {data.lineItems.map((item, i) => (
                    <div key={i} className="space-y-2 pb-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Item {i + 1}</span>
                        {data.lineItems.length > 1 && (
                          <button type="button" onClick={() => removeLineItem(i)} className="text-muted-foreground hover:text-destructive">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                      <Field
                        label="Description"
                        value={item.description}
                        onChange={(v) => update(`lineItems.${i}.description`, v)}
                      />
                      <Field
                        label="Amount"
                        value={String(item.amount)}
                        onChange={(v) => update(`lineItems.${i}.amount`, parseFloat(v) || 0)}
                        type="number"
                      />
                      {i < data.lineItems.length - 1 && <Separator />}
                    </div>
                  ))}
                  <Button variant="outline" size="sm" onClick={addLineItem} className="w-full">
                    <Plus className="mr-2 h-3.5 w-3.5" />
                    Add line item
                  </Button>
                  <div className="flex justify-between pt-2 border-t border-border">
                    <span className="text-sm font-medium">Total</span>
                    <span className="text-sm font-bold tabular-nums">
                      ${data.totalDue.toFixed(2)}
                    </span>
                  </div>
                </Section>
              </CardContent>
            </Card>

            {/* Payment instructions */}
            <Card>
              <CardContent className="pt-5 space-y-3">
                <Section title="Payment , BPAY">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Include BPAY</Label>
                    <Switch
                      checked={includeBpay}
                      onCheckedChange={(checked) => {
                        setIncludeBpay(checked);
                        if (checked && !data.paymentInstructions.bpay) {
                          setData((prev) => ({
                            ...prev,
                            paymentInstructions: {
                              ...prev.paymentInstructions,
                              bpay: { biller_code: "", reference: "" },
                            },
                          }));
                        }
                        setRefreshKey((k) => k + 1);
                      }}
                    />
                  </div>
                  {includeBpay && (
                    <>
                      <Field
                        label="Biller code"
                        value={data.paymentInstructions.bpay?.biller_code ?? ""}
                        onChange={(v) => update("paymentInstructions.bpay.biller_code", v)}
                      />
                      <Field
                        label="Reference"
                        value={data.paymentInstructions.bpay?.reference ?? ""}
                        onChange={(v) => update("paymentInstructions.bpay.reference", v)}
                      />
                    </>
                  )}
                </Section>
                <Separator />
                <Section title="Payment , EFT">
                  <Field label="BSB" value={data.paymentInstructions.eft.bsb} onChange={(v) => update("paymentInstructions.eft.bsb", v)} />
                  <Field label="Account number" value={data.paymentInstructions.eft.account_number} onChange={(v) => update("paymentInstructions.eft.account_number", v)} />
                  <Field label="Account name" value={data.paymentInstructions.eft.account_name} onChange={(v) => update("paymentInstructions.eft.account_name", v)} />
                  <Field label="Reference" value={data.paymentInstructions.eft.reference} onChange={(v) => update("paymentInstructions.eft.reference", v)} />
                </Section>
              </CardContent>
            </Card>

          </div>

          {/* Right panel , live PDF preview */}
          <div className="sticky top-6">
            <Card className="overflow-hidden">
              <CardContent className="p-0">
                <PDFViewer
                  key={refreshKey}
                  width="100%"
                  height={900}
                  showToolbar={false}
                  style={{ border: "none" }}
                >
                  <LevyNotice {...pdfData} />
                </PDFViewer>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
