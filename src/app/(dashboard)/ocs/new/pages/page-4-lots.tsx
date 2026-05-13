"use client";

import { Fragment, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, AlertTriangle, Download, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { PhoneInput } from "@/components/shared/phone-input";
import { saveStep, type DraftJson, type DraftLot } from "../actions";

// AU phone validation: accept landline (8 digits + state code) or mobile (04XX
// XXX XXX). After stripping non-digits, require 8–10 digits.
function isValidAuPhone(raw: string): boolean {
  if (!raw) return true; // optional
  const digits = raw.replace(/\D/g, "");
  return digits.length >= 8 && digits.length <= 11;
}
function isValidEmail(raw: string): boolean {
  if (!raw) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw);
}

function lotsToCsv(lots: DraftLot[]): string {
  const header = [
    "lot_number","unit_entitlement","lot_liability",
    "owner_name","owner_email","owner_phone","owner_postal_address",
    "is_occupied_by_owner","tenant_name","tenant_email",
  ];
  const rows = lots.map((l) => [
    l.lot_number, l.unit_entitlement, l.lot_liability,
    l.owner_name ?? "", l.owner_email ?? "", l.owner_phone ?? "", l.owner_postal_address ?? "",
    l.is_occupied_by_owner === false ? "false" : "true",
    l.tenant_name ?? "", l.tenant_email ?? "",
  ]);
  return [header, ...rows].map((r) => r.map((c) => {
    const s = String(c);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(",")).join("\n");
}

// Parse a single CSV line respecting double-quoted commas.
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') { inQ = false; }
      else { cur += c; }
    } else {
      if (c === ",") { out.push(cur); cur = ""; }
      else if (c === '"') { inQ = true; }
      else { cur += c; }
    }
  }
  out.push(cur);
  return out;
}

function csvToLots(csv: string, defaults: DraftLot[]): { lots: DraftLot[]; errors: { row: number; reason: string }[] } {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return { lots: defaults, errors: [{ row: 0, reason: "Empty CSV" }] };
  const header = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const idx = (name: string) => header.indexOf(name);
  const errors: { row: number; reason: string }[] = [];
  const lots: DraftLot[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const lot_number = parseInt(cols[idx("lot_number")] ?? "", 10);
    if (!Number.isFinite(lot_number) || lot_number <= 0) {
      errors.push({ row: i + 1, reason: "Invalid lot_number" });
      continue;
    }
    const unit_entitlement = parseFloat(cols[idx("unit_entitlement")] ?? "0") || 0;
    const lot_liability = parseFloat(cols[idx("lot_liability")] ?? String(unit_entitlement)) || 0;
    const email = (cols[idx("owner_email")] ?? "").trim();
    if (email && !isValidEmail(email)) errors.push({ row: i + 1, reason: "Invalid email" });
    const phone = (cols[idx("owner_phone")] ?? "").trim();
    if (phone && !isValidAuPhone(phone)) errors.push({ row: i + 1, reason: "Invalid phone" });
    lots.push({
      lot_number,
      unit_entitlement,
      lot_liability,
      owner_name: (cols[idx("owner_name")] ?? "").trim(),
      owner_email: email,
      owner_phone: phone,
      owner_postal_address: (cols[idx("owner_postal_address")] ?? "").trim(),
      is_occupied_by_owner: ((cols[idx("is_occupied_by_owner")] ?? "true").toLowerCase() !== "false"),
      tenant_name: (cols[idx("tenant_name")] ?? "").trim(),
      tenant_email: (cols[idx("tenant_email")] ?? "").trim(),
    });
  }
  return { lots, errors };
}

export function Page4Lots({
  draftId,
  initialDraft,
  onNext,
  onBack,
}: {
  draftId: string;
  initialDraft: DraftJson;
  onNext: () => void;
  onBack: () => void;
}) {
  const initialLots: DraftLot[] = initialDraft.lots && initialDraft.lots.length > 0
    ? initialDraft.lots
    : Array.from({ length: 2 }, (_, i) => ({ lot_number: i + 1, unit_entitlement: 0, lot_liability: 0 }));

  const [lots, setLots] = useState<DraftLot[]>(initialLots);
  const [mode, setMode] = useState<"manual" | "bulk">(initialLots.length >= 10 ? "bulk" : "manual");
  const [confirmSkipOpen, setConfirmSkipOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [csvErrors, setCsvErrors] = useState<{ row: number; reason: string }[]>([]);

  // Item 16: notice address for service of notices. Defaults to OC address;
  // manager can override here. No checkbox — direct edit instead.
  const [noticeAddress, setNoticeAddress] = useState<string>(
    initialDraft.notice_address ?? initialDraft.address ?? "",
  );

  const missingEmailPct = useMemo(() => {
    const total = lots.length;
    if (total === 0) return 0;
    const missing = lots.filter((l) => !l.owner_email).length;
    return Math.round((missing / total) * 100);
  }, [lots]);

  function updateLot(idx: number, patch: Partial<DraftLot>) {
    setLots((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }
  function addLot() {
    const nextNum = lots.length === 0 ? 1 : Math.max(...lots.map((l) => l.lot_number)) + 1;
    setLots((prev) => [...prev, { lot_number: nextNum, unit_entitlement: 0, lot_liability: 0, is_occupied_by_owner: true }]);
  }

  function downloadCsv() {
    const blob = new Blob([lotsToCsv(lots)], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "lot-register-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }
  function onUploadCsv(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      const { lots: parsedLots, errors } = csvToLots(text, lots);
      setLots(parsedLots);
      setCsvErrors(errors);
      if (errors.length === 0) toast.success(`Imported ${parsedLots.length} lots`);
      else toast.error(`${parsedLots.length} imported, ${errors.length} row${errors.length === 1 ? "" : "s"} with errors`);
    };
    reader.readAsText(file);
  }

  async function persistAndAdvance(nextStep: number, skipped = false) {
    // Item 15: validate everything the user filled in. Empty rows are
    // allowed — owners can be added later — but anything typed must be
    // shape-correct. Skip path bypasses per-row validation.
    const problems: string[] = [];
    if (!skipped) {
      // Notice address: must be non-empty (defaults to OC address; user
      // could have cleared it).
      if (!noticeAddress || noticeAddress.trim().length < 3) {
        problems.push("Address for service of notices is required.");
      }
      for (const l of lots) {
        const hasOwner = !!(l.owner_name || l.owner_email || l.owner_phone || l.owner_postal_address);
        if (l.owner_email && !isValidEmail(l.owner_email)) problems.push(`Lot ${l.lot_number}: invalid email`);
        if (l.owner_phone && !isValidAuPhone(l.owner_phone)) problems.push(`Lot ${l.lot_number}: invalid phone`);
        // If owner-occupied is off, expect either a tenant name or a tenant contact.
        const tenantOpen = l.is_occupied_by_owner === false;
        if (tenantOpen && !(l.tenant_name || l.tenant_email || l.tenant_phone)) {
          problems.push(`Lot ${l.lot_number}: tenant fields are empty — toggle owner-occupied back on or add tenant contact.`);
        }
        // If the row has ANY owner info, name is required.
        if (hasOwner && !l.owner_name?.trim()) {
          problems.push(`Lot ${l.lot_number}: owner name required when other owner fields are filled.`);
        }
        if (l.tenant_email && !isValidEmail(l.tenant_email)) problems.push(`Lot ${l.lot_number}: invalid tenant email`);
        if (l.tenant_phone && !isValidAuPhone(l.tenant_phone)) problems.push(`Lot ${l.lot_number}: invalid tenant phone`);
      }
    }
    if (problems.length) {
      toast.error(problems.length === 1 ? problems[0] : `${problems.length} rows have errors — see highlights.`);
      return;
    }
    setPending(true);
    const r = await saveStep(draftId, {
      lots,
      total_lots: lots.length,
      notice_address: noticeAddress || undefined,
    }, nextStep);
    setPending(false);
    if (r.error) {
      toast.error(r.error);
      return;
    }
    onNext();
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-lg font-semibold text-foreground">Add the lot owners</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Add the owner contact details for each lot. You can bulk import or enter manually.
        </p>
      </div>

      {/* Item 16: Notice-address field, defaulting to the OC address. */}
      <div className="space-y-1.5">
        <Label htmlFor="notice-address">Address for service of notices</Label>
        <Input
          id="notice-address"
          value={noticeAddress}
          onChange={(e) => setNoticeAddress(e.target.value)}
          placeholder={initialDraft.address ?? "Postal address used for official correspondence"}
        />
        <p className="text-xs text-muted-foreground">
          Pre-filled with the OC address. Edit if notices should go elsewhere
          (e.g. the manager&apos;s office). Per-lot postal addresses are set in the
          rows below.
        </p>
      </div>

      {/* Mode toggle */}
      <div className="flex items-center justify-center gap-2">
        <div className="inline-flex rounded-md border border-border bg-card p-0.5">
          <button
            type="button"
            onClick={() => setMode("manual")}
            className={`px-3 py-1.5 text-xs font-medium rounded-sm cursor-pointer ${mode === "manual" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
          >
            Manual entry
          </button>
          <button
            type="button"
            onClick={() => setMode("bulk")}
            className={`px-3 py-1.5 text-xs font-medium rounded-sm cursor-pointer ${mode === "bulk" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
          >
            Bulk import (CSV)
          </button>
        </div>
      </div>

      {mode === "bulk" ? (
        <div className="space-y-4">
          <div className="rounded-md border border-border bg-card p-4 space-y-3">
            <p className="text-sm text-foreground">
              Download the template, fill in owner details, then upload it back. Lot numbers and entitlements
              are pre-populated from the lot schedule.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={downloadCsv}>
                <Download className="mr-1.5 h-3.5 w-3.5" />
                Download template
              </Button>
              <label className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-border bg-card text-sm cursor-pointer hover:bg-muted">
                <Upload className="h-3.5 w-3.5" />
                Upload completed CSV
                <input
                  type="file"
                  accept=".csv,text/csv"
                  className="sr-only"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) onUploadCsv(f);
                  }}
                />
              </label>
            </div>
          </div>
          {csvErrors.length > 0 && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-600 shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-amber-900">
                    {csvErrors.length} row{csvErrors.length === 1 ? "" : "s"} need attention
                  </p>
                  <ul className="mt-1 text-xs text-amber-900 list-disc pl-4 space-y-0.5">
                    {csvErrors.slice(0, 5).map((e, i) => (
                      <li key={i}>Row {e.row}: {e.reason}</li>
                    ))}
                    {csvErrors.length > 5 && <li>… {csvErrors.length - 5} more</li>}
                  </ul>
                </div>
              </div>
            </div>
          )}
          <p className="text-xs text-muted-foreground text-center">
            Imported lots appear in the table below — switch to manual entry to inline-edit before continuing.
          </p>
        </div>
      ) : null}

      {/* Lot table (visible in both modes after import) */}
      <div className="rounded-md border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr className="text-xs uppercase tracking-wide">
              <th className="px-2 py-2 text-left font-medium">Lot #</th>
              <th className="px-2 py-2 text-left font-medium">Owner name</th>
              <th className="px-2 py-2 text-left font-medium">Email</th>
              <th className="px-2 py-2 text-left font-medium">Phone</th>
              <th className="px-2 py-2 text-left font-medium">Postal address</th>
              <th className="px-2 py-2 text-left font-medium">Owner occupied?</th>
            </tr>
          </thead>
          <tbody>
            {lots.map((lot, idx) => {
              const emailBad = !!lot.owner_email && !isValidEmail(lot.owner_email);
              const phoneBad = !!lot.owner_phone && !isValidAuPhone(lot.owner_phone);
              // Item 18: default new lots to owner-occupied=true. Toggle OFF reveals
              // tenant fields. is_occupied_by_owner === false means a tenant lives there.
              const ownerOccupied = lot.is_occupied_by_owner !== false;
              return (
                <Fragment key={idx}>
                  <tr className="border-t border-border">
                    <td className="px-2 py-1.5 tabular-nums">{lot.lot_number}</td>
                    <td className="px-2 py-1.5">
                      <Input
                        value={lot.owner_name ?? ""}
                        onChange={(e) => updateLot(idx, { owner_name: e.target.value })}
                        className="h-8"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <Input
                        type="email"
                        value={lot.owner_email ?? ""}
                        onChange={(e) => updateLot(idx, { owner_email: e.target.value })}
                        aria-invalid={emailBad || undefined}
                        className="h-8"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <PhoneInput
                        value={lot.owner_phone ?? "+61 "}
                        onChange={(v) => updateLot(idx, { owner_phone: v })}
                        error={phoneBad}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <Input
                        value={lot.owner_postal_address ?? ""}
                        onChange={(e) => updateLot(idx, { owner_postal_address: e.target.value })}
                        className="h-8"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <Switch
                        checked={ownerOccupied}
                        onCheckedChange={(v) => updateLot(idx, { is_occupied_by_owner: v === true })}
                        aria-label={`Owner occupied for lot ${lot.lot_number}`}
                      />
                    </td>
                  </tr>
                  {!ownerOccupied && (
                    <tr className="border-t border-dashed border-border bg-muted/20">
                      <td className="px-2 py-1.5" />
                      <td className="px-2 py-1.5 text-xs text-muted-foreground" colSpan={5}>
                        <div className="grid grid-cols-3 gap-2">
                          <Input
                            placeholder="Tenant name"
                            value={lot.tenant_name ?? ""}
                            onChange={(e) => updateLot(idx, { tenant_name: e.target.value })}
                            className="h-8"
                          />
                          <Input
                            placeholder="Tenant email"
                            type="email"
                            value={lot.tenant_email ?? ""}
                            onChange={(e) => updateLot(idx, { tenant_email: e.target.value })}
                            className="h-8"
                          />
                          <PhoneInput
                            value={lot.tenant_phone ?? "+61 "}
                            onChange={(v) => updateLot(idx, { tenant_phone: v })}
                          />
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between">
        <Button type="button" variant="secondary" size="sm" onClick={addLot}>
          + Add lot
        </Button>
        {missingEmailPct > 20 && (
          <p className="text-xs text-amber-700">
            {missingEmailPct}% of lots have no email — communication is mostly by email.
          </p>
        )}
      </div>

      <div className="flex items-center justify-between pt-2">
        <Button type="button" variant="ghost" onClick={onBack}>Back</Button>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setConfirmSkipOpen(true)}
            className="text-sm text-muted-foreground hover:text-foreground cursor-pointer"
          >
            Skip — I&apos;ll add owners later
          </button>
          <Button type="button" onClick={() => persistAndAdvance(5)} disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            Continue
          </Button>
        </div>
      </div>

      <Dialog open={confirmSkipOpen} onOpenChange={setConfirmSkipOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Skip lot owners?</DialogTitle>
            <DialogDescription>
              You won&apos;t be able to send notices or levies until lot owners are added.
              You can add them from the OC&apos;s manage page anytime.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmSkipOpen(false)}>Cancel</Button>
            <Button onClick={() => { setConfirmSkipOpen(false); void persistAndAdvance(5, true); }}>
              Skip anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

