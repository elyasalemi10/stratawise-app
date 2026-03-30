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

const DEFAULT_DATA: LevyNoticeProps = {
  managementCompany: {
    name: "ABC Strata Management",
    logo_url: null,
  },
  subdivision: {
    name: "Riverside Townhouses",
    address: "1-12/45 Smith Street, Richmond VIC 3121",
    abn: "12 345 678 901",
    plan_number: "PS123456A",
  },
  referenceNumber: "MSM-LEV-2026-000001",
  date: new Date(),
  documentTitle: "Tax invoice / Levy notice",
  lotOwner: {
    name: "John Smith",
    lot_number: "5",
    address: "Unit 5, 45 Smith Street, Richmond VIC 3121",
  },
  levyPeriod: {
    start: "1 July 2026",
    end: "30 September 2026",
  },
  lineItems: [
    { description: "Quarterly levy — Administrative Fund", amount: 850.0 },
    { description: "Quarterly levy — Capital Works Fund", amount: 350.0 },
  ],
  totalDue: 1200.0,
  dueDate: "28 July 2026",
  paymentInstructions: {
    bpay: {
      biller_code: "123456",
      reference: "5001234567",
    },
    eft: {
      bsb: "063-123",
      account_number: "1234 5678",
      account_name: "Riverside Townhouses OC Fund",
      reference: "MSM-LEV-2026-000001",
    },
  },
  outstandingBalances: [],
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

  function addOutstandingBalance() {
    const balances = [...(data.outstandingBalances ?? []), { reference: "MSM-LEV-2025-000001", period: "Q4 2025", amount: 500 }];
    setData((prev) => ({ ...prev, outstandingBalances: balances }));
    setRefreshKey((k) => k + 1);
  }

  function removeOutstandingBalance(index: number) {
    const balances = (data.outstandingBalances ?? []).filter((_, i) => i !== index);
    setData((prev) => ({ ...prev, outstandingBalances: balances }));
    setRefreshKey((k) => k + 1);
  }

  async function downloadPDF() {
    const blob = await pdf(<LevyNotice {...data} />).toBlob();
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
          {/* Left panel — editable fields */}
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

            {/* Management company */}
            <Card>
              <CardContent className="pt-5 space-y-3">
                <Section title="Management company">
                  <Field label="Company name" value={data.managementCompany.name} onChange={(v) => update("managementCompany.name", v)} />
                </Section>
              </CardContent>
            </Card>

            {/* Subdivision */}
            <Card>
              <CardContent className="pt-5 space-y-3">
                <Section title="Subdivision">
                  <Field label="Name" value={data.subdivision.name} onChange={(v) => update("subdivision.name", v)} />
                  <Field label="Address" value={data.subdivision.address} onChange={(v) => update("subdivision.address", v)} />
                  <Field label="ABN" value={data.subdivision.abn ?? ""} onChange={(v) => update("subdivision.abn", v)} />
                  <Field label="Plan number" value={data.subdivision.plan_number} onChange={(v) => update("subdivision.plan_number", v)} />
                </Section>
              </CardContent>
            </Card>

            {/* Reference */}
            <Card>
              <CardContent className="pt-5 space-y-3">
                <Section title="Document">
                  <Field label="Reference number" value={data.referenceNumber} onChange={(v) => update("referenceNumber", v)} />
                  <Field label="Due date" value={data.dueDate} onChange={(v) => update("dueDate", v)} />
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
                <Section title="Payment — BPAY">
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
                </Section>
                <Separator />
                <Section title="Payment — EFT">
                  <Field label="BSB" value={data.paymentInstructions.eft.bsb} onChange={(v) => update("paymentInstructions.eft.bsb", v)} />
                  <Field label="Account number" value={data.paymentInstructions.eft.account_number} onChange={(v) => update("paymentInstructions.eft.account_number", v)} />
                  <Field label="Account name" value={data.paymentInstructions.eft.account_name} onChange={(v) => update("paymentInstructions.eft.account_name", v)} />
                  <Field label="Reference" value={data.paymentInstructions.eft.reference} onChange={(v) => update("paymentInstructions.eft.reference", v)} />
                </Section>
              </CardContent>
            </Card>

            {/* Outstanding balances */}
            <Card>
              <CardContent className="pt-5 space-y-3">
                <Section title="Outstanding balances">
                  {(data.outstandingBalances ?? []).map((bal, i) => (
                    <div key={i} className="space-y-2 pb-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Balance {i + 1}</span>
                        <button type="button" onClick={() => removeOutstandingBalance(i)} className="text-muted-foreground hover:text-destructive">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <Field label="Reference" value={bal.reference} onChange={(v) => update(`outstandingBalances.${i}.reference`, v)} />
                      <Field label="Period" value={bal.period} onChange={(v) => update(`outstandingBalances.${i}.period`, v)} />
                      <Field label="Amount" value={String(bal.amount)} onChange={(v) => update(`outstandingBalances.${i}.amount`, parseFloat(v) || 0)} type="number" />
                      {i < (data.outstandingBalances?.length ?? 0) - 1 && <Separator />}
                    </div>
                  ))}
                  <Button variant="outline" size="sm" onClick={addOutstandingBalance} className="w-full">
                    <Plus className="mr-2 h-3.5 w-3.5" />
                    Add outstanding balance
                  </Button>
                </Section>
              </CardContent>
            </Card>

            {/* Penalty interest */}
            <Card>
              <CardContent className="pt-5 space-y-3">
                <Section title="Penalty interest">
                  <Field
                    label="Rate (% per month)"
                    value={String(data.penaltyInterestRate ?? 0)}
                    onChange={(v) => update("penaltyInterestRate", parseFloat(v) || 0)}
                    type="number"
                  />
                </Section>
              </CardContent>
            </Card>
          </div>

          {/* Right panel — live PDF preview */}
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
                  <LevyNotice {...data} />
                </PDFViewer>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
