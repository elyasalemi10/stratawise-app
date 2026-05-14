"use client";

import { Fragment, useState } from "react";
import { toast } from "sonner";
import { Loader2, AlertTriangle, Download, Upload, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PhoneInput } from "@/components/shared/phone-input";
import { Switch } from "@/components/ui/switch";
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

function csvToLots(
  csv: string,
  defaults: DraftLot[],
): { lots: DraftLot[]; errors: { row: number; reason: string }[] } {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return { lots: defaults, errors: [{ row: 0, reason: "Empty CSV" }] };
  const header = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const idx = (name: string) => header.indexOf(name);
  const errors: { row: number; reason: string }[] = [];
  // Defaults define the canonical lot register from the plan-of-subdivision.
  // The CSV's job is to FILL OWNER INFO INTO existing rows, never to add new
  // lots — managers were creating extra ghost lots when their CSV had a
  // trailing blank or an off-by-one. Match by lot_number; ignore unknowns.
  const defaultsByLot = new Map<number, DraftLot>();
  defaults.forEach((l) => defaultsByLot.set(l.lot_number, l));
  // Track which lots already received a row so we can warn on the extras.
  const consumed = new Set<number>();
  const merged: DraftLot[] = defaults.map((l) => ({ ...l }));
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const lot_number = parseInt(cols[idx("lot_number")] ?? "", 10);
    if (!Number.isFinite(lot_number) || lot_number <= 0) {
      errors.push({ row: i + 1, reason: "Invalid lot_number" });
      continue;
    }
    if (!defaultsByLot.has(lot_number)) {
      errors.push({ row: i + 1, reason: `Lot ${lot_number} isn't in the plan — ignored` });
      continue;
    }
    if (consumed.has(lot_number)) {
      errors.push({ row: i + 1, reason: `Lot ${lot_number} appears twice — keeping first` });
      continue;
    }
    consumed.add(lot_number);
    const email = (cols[idx("owner_email")] ?? "").trim();
    if (email && !isValidEmail(email)) errors.push({ row: i + 1, reason: "Invalid email" });
    const phone = (cols[idx("owner_phone")] ?? "").trim();
    if (phone && !isValidAuPhone(phone)) errors.push({ row: i + 1, reason: "Invalid phone" });
    const ownerOccupied = ((cols[idx("is_occupied_by_owner")] ?? "true").toLowerCase() !== "false");
    // When owner-occupied is true, the tenant_* columns are noise. Drop them
    // outright so they can't sneak through into the DB as orphan tenant data.
    const target = merged.find((l) => l.lot_number === lot_number)!;
    target.owner_name = (cols[idx("owner_name")] ?? "").trim();
    target.owner_email = email;
    target.owner_phone = phone;
    target.owner_postal_address = (cols[idx("owner_postal_address")] ?? "").trim();
    target.is_occupied_by_owner = ownerOccupied;
    if (ownerOccupied) {
      target.tenant_name = undefined;
      target.tenant_email = undefined;
      target.tenant_phone = undefined;
    } else {
      target.tenant_name = (cols[idx("tenant_name")] ?? "").trim();
      target.tenant_email = (cols[idx("tenant_email")] ?? "").trim();
      target.tenant_phone = (cols[idx("tenant_phone")] ?? "").trim();
    }
  }
  return { lots: merged, errors };
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
  const [csvDialogOpen, setCsvDialogOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [csvErrors, setCsvErrors] = useState<{ row: number; reason: string }[]>([]);
  // Per-row submit-time validity flags. CLAUDE.md "no live red" rule: only
  // populated by the submit handler, cleared on input change. ownerName and
  // tenantName participate too — both are mandatory (owner always; tenant only
  // when owner-occupied is off).
  const [rowErrors, setRowErrors] = useState<Array<{
    ownerName?: boolean; email?: boolean; phone?: boolean; postal?: boolean;
    tName?: boolean; tEmail?: boolean; tPhone?: boolean;
  }>>([]);

  function updateLot(idx: number, patch: Partial<DraftLot>) {
    setLots((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
    if (rowErrors[idx]) {
      setRowErrors((prev) => {
        const next = [...prev];
        const cur = { ...(next[idx] ?? {}) };
        if ("owner_name" in patch) cur.ownerName = false;
        if ("owner_email" in patch) cur.email = false;
        if ("owner_phone" in patch) cur.phone = false;
        if ("owner_postal_address" in patch) cur.postal = false;
        if ("tenant_name" in patch) cur.tName = false;
        if ("tenant_email" in patch) cur.tEmail = false;
        if ("tenant_phone" in patch) cur.tPhone = false;
        next[idx] = cur;
        return next;
      });
    }
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
  // Strict format guard. The CSV MUST start with the exact header row we
  // generate from lotsToCsv — anything else and we reject the upload outright
  // so people can't paste random spreadsheets in and expect it to parse.
  function isOurTemplate(text: string): boolean {
    const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
    const cols = parseCsvLine(firstLine).map((c) => c.trim().toLowerCase());
    const expected = [
      "lot_number", "unit_entitlement", "lot_liability",
      "owner_name", "owner_email", "owner_phone", "owner_postal_address",
      "is_occupied_by_owner", "tenant_name", "tenant_email",
    ];
    if (cols.length !== expected.length) return false;
    return expected.every((k, i) => cols[i] === k);
  }

  function onUploadCsv(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      if (!isOurTemplate(text)) {
        toast.error("That CSV doesn't match our template. Download the template and fill it in.");
        return;
      }
      const { lots: parsedLots, errors } = csvToLots(text, lots);
      setLots(parsedLots);
      setCsvErrors(errors);
      setCsvDialogOpen(false);
      if (errors.length === 0) toast.success(`Imported ${parsedLots.length} lots`);
      else toast.error(`${parsedLots.length} imported, ${errors.length} row${errors.length === 1 ? "" : "s"} with errors`);
    };
    reader.readAsText(file);
  }

  async function persistAndAdvance(nextStep: number) {
    // Owner name is mandatory on every lot. Tenant name is mandatory whenever
    // the lot is NOT owner-occupied. Live-red rule: only set rowErrors on
    // submit; cleared on the matching field's onChange. No skip path —
    // managers must add owner details before advancing.
    const problems: string[] = [];
    const nextRowErrors: typeof rowErrors = lots.map(() => ({}));
    lots.forEach((l, i) => {
      const ownerName = (l.owner_name ?? "").trim();
      if (!ownerName) {
        problems.push(`Lot ${l.lot_number}: owner name is required.`);
        nextRowErrors[i].ownerName = true;
      }
      if (l.owner_email && !isValidEmail(l.owner_email)) {
        problems.push(`Lot ${l.lot_number}: invalid email`);
        nextRowErrors[i].email = true;
      }
      if (l.owner_phone && !isValidAuPhone(l.owner_phone)) {
        problems.push(`Lot ${l.lot_number}: invalid phone`);
        nextRowErrors[i].phone = true;
      }
      // Postal address — required on every lot. Postal is the universal
      // fallback when an owner hasn't consented to digital comms for a
      // particular notice category, so every lot needs SOMETHING we can
      // print on a label. The PostGrid verifier (when wired) will then
      // check deliverability on top of the presence check.
      const postal = (l.owner_postal_address ?? "").trim();
      if (!postal) {
        problems.push(`Lot ${l.lot_number}: postal address is required for paper notices.`);
        nextRowErrors[i].postal = true;
      }
      const tenantOpen = l.is_occupied_by_owner === false;
      if (tenantOpen) {
        const tenantName = (l.tenant_name ?? "").trim();
        if (!tenantName) {
          problems.push(`Lot ${l.lot_number}: tenant name is required when not owner-occupied.`);
          nextRowErrors[i].tName = true;
        }
      }
      if (l.tenant_email && !isValidEmail(l.tenant_email)) {
        problems.push(`Lot ${l.lot_number}: invalid tenant email`);
        nextRowErrors[i].tEmail = true;
      }
      if (l.tenant_phone && !isValidAuPhone(l.tenant_phone)) {
        problems.push(`Lot ${l.lot_number}: invalid tenant phone`);
        nextRowErrors[i].tPhone = true;
      }
    });
    setRowErrors(nextRowErrors);
    if (problems.length) {
      toast.error(problems.length === 1 ? problems[0] : `${problems.length} rows have errors — see highlights.`);
      return;
    }
    setPending(true);
    const r = await saveStep(draftId, {
      lots,
      total_lots: lots.length,
    }, nextStep);
    if (r.error) {
      setPending(false);
      toast.error(r.error);
      return;
    }
    await onNext();
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-lg font-semibold text-foreground">Add the lot owners</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Owner name is required on every lot. You can type each row or import a CSV.
        </p>
      </div>

      {/* CSV import — popover dialog with the download-template + upload buttons
          inside, so the page itself isn't crowded with a manual/bulk toggle. */}
      <div className="flex items-center justify-end">
        <Button type="button" variant="secondary" size="sm" onClick={() => setCsvDialogOpen(true)}>
          <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5" />
          Import from CSV
        </Button>
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

      {/* Lot table (visible in both modes after import).

          Arrow-key navigation: ArrowUp / ArrowDown jump to the same logical
          column in the prev/next row; ArrowLeft / ArrowRight cross columns at
          the start/end of the input. Implemented via a data-cell attribute on
          every focusable input and an onKeyDown handler at the <tbody> level. */}
      <div
        className="rounded-md border border-border bg-muted/40 overflow-hidden"
        onKeyDown={(e) => {
          if (!(e.target instanceof HTMLElement)) return;
          const target = e.target as HTMLInputElement;
          const cell = target.closest<HTMLElement>("[data-cell]");
          if (!cell) return;
          const [rowStr, colStr] = (cell.dataset.cell ?? "").split(":");
          const row = parseInt(rowStr, 10);
          const col = parseInt(colStr, 10);
          if (Number.isNaN(row) || Number.isNaN(col)) return;
          const move = (r: number, c: number) => {
            const node = (e.currentTarget as HTMLElement).querySelector<HTMLElement>(
              `[data-cell="${r}:${c}"]`,
            );
            const input = node?.querySelector("input") ?? null;
            if (input) {
              e.preventDefault();
              input.focus();
              input.select?.();
            }
          };
          const caret = target.selectionStart ?? 0;
          const len = target.value.length;
          if (e.key === "ArrowUp") move(row - 1, col);
          else if (e.key === "ArrowDown") move(row + 1, col);
          else if (e.key === "ArrowLeft" && caret === 0) move(row, col - 1);
          else if (e.key === "ArrowRight" && caret === len) move(row, col + 1);
        }}
      >
        <table className="w-full text-sm">
          <thead className="bg-card text-muted-foreground">
            <tr className="text-xs uppercase tracking-wide border-b border-border">
              <th className="px-2 py-2 text-left font-medium">Lot</th>
              <th className="px-2 py-2 text-left font-medium">Unit</th>
              <th className="px-2 py-2 text-left font-medium">Owner name</th>
              <th className="px-2 py-2 text-left font-medium">Email</th>
              <th className="px-2 py-2 text-left font-medium">Phone</th>
              <th className="px-2 py-2 text-left font-medium">Owner occupied?</th>
            </tr>
          </thead>
          <tbody>
            {lots.map((lot, idx) => {
              const errs = rowErrors[idx] ?? {};
              const ownerOccupied = lot.is_occupied_by_owner !== false;
              return (
                <Fragment key={idx}>
                  <tr>
                    <td className="px-2 py-1.5 tabular-nums">{lot.lot_number}</td>
                    <td className="px-2 py-1.5 text-sm text-muted-foreground">
                      {lot.unit_number?.trim() || <span className="text-muted-foreground/60">—</span>}
                    </td>
                    <td className="px-2 py-1.5" data-cell={`${idx}:0`}>
                      <Input
                        value={lot.owner_name ?? ""}
                        onChange={(e) => updateLot(idx, { owner_name: e.target.value })}
                        aria-invalid={errs.ownerName || undefined}
                        placeholder="Owner name"
                        className="h-8"
                      />
                    </td>
                    <td className="px-2 py-1.5" data-cell={`${idx}:1`}>
                      <Input
                        type="email"
                        value={lot.owner_email ?? ""}
                        onChange={(e) => updateLot(idx, { owner_email: e.target.value })}
                        aria-invalid={errs.email || undefined}
                        placeholder="Email"
                        className="h-8"
                      />
                    </td>
                    <td className="px-2 py-1.5" data-cell={`${idx}:2`}>
                      <PhoneInput
                        value={lot.owner_phone ?? "+61 "}
                        onChange={(v) => updateLot(idx, { owner_phone: v })}
                        error={errs.phone}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <div className="inline-flex items-center gap-2">
                        <Switch
                          checked={ownerOccupied}
                          onCheckedChange={(v) => updateLot(idx, { is_occupied_by_owner: v === true })}
                          aria-label={`Owner occupied for lot ${lot.lot_number}`}
                        />
                        <span className={`text-xs font-medium ${ownerOccupied ? "text-foreground" : "text-muted-foreground"}`}>
                          {ownerOccupied ? "Yes" : "No"}
                        </span>
                      </div>
                    </td>
                  </tr>
                  {/* Postal address sub-row — always rendered (every lot
                      needs a posting address for paper fallback). Spans
                      from the Owner-name column to the right so it
                      visually nests under the lot's data without
                      stealing horizontal space from the main row. */}
                  <tr>
                    <td className="px-2 pb-2 pt-0" colSpan={2} />
                    <td className="px-2 pb-2 pt-0" colSpan={4}>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] uppercase tracking-wide text-muted-foreground shrink-0 w-16">Postal</span>
                        <Input
                          value={lot.owner_postal_address ?? ""}
                          onChange={(e) => updateLot(idx, { owner_postal_address: e.target.value })}
                          aria-invalid={errs.postal || undefined}
                          placeholder="Owner postal address (street, suburb, state, postcode)"
                          className="h-8"
                        />
                      </div>
                    </td>
                  </tr>
                  {/* Opening-arrears sub-row. Merged in from the old final
                      step so the manager fills lot + owner + arrears on
                      one screen instead of scrolling back and forth
                      between two tables. Debit (positive) = lot owes OC;
                      Credit (negative) = OC owes lot. */}
                  {(() => {
                    const bal = Number(lot.opening_balance ?? 0);
                    const isCredit = bal < 0;
                    const absStr = Math.abs(bal) === 0 ? "" : String(Math.abs(bal));
                    function setAmount(absVal: string) {
                      const n = parseFloat(absVal) || 0;
                      updateLot(idx, { opening_balance: isCredit ? -n : n });
                    }
                    function setType(toCredit: boolean) {
                      const cur = Math.abs(Number(lot.opening_balance ?? 0));
                      updateLot(idx, { opening_balance: cur === 0 ? 0 : (toCredit ? -cur : cur) });
                    }
                    return (
                      <tr>
                        <td className="px-2 pb-2 pt-0" colSpan={2} />
                        <td className="px-2 pb-2 pt-0" colSpan={4}>
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] uppercase tracking-wide text-muted-foreground shrink-0 w-16">Arrears</span>
                            <div className="inline-flex rounded-md border border-border bg-card p-0.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => setType(false)}
                                className={`px-2.5 py-0.5 text-xs rounded-sm cursor-pointer ${!isCredit ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
                              >
                                Debit
                              </button>
                              <button
                                type="button"
                                onClick={() => setType(true)}
                                className={`px-2.5 py-0.5 text-xs rounded-sm cursor-pointer ${isCredit ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
                              >
                                Credit
                              </button>
                            </div>
                            <div className="relative flex-1">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
                              <Input
                                value={absStr}
                                onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
                                placeholder="Amount as at handover (0 = no opening balance)"
                                inputMode="decimal"
                                className="h-8 pl-7"
                              />
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  })()}
                  {!ownerOccupied && (
                    <tr className="bg-muted/20">
                      <td className="px-2 py-1.5" colSpan={2} />
                      <td className="px-2 py-1.5 text-xs text-muted-foreground" colSpan={4}>
                        <div className="grid grid-cols-3 gap-2">
                          <Input
                            placeholder="Tenant name"
                            value={lot.tenant_name ?? ""}
                            onChange={(e) => updateLot(idx, { tenant_name: e.target.value })}
                            aria-invalid={errs.tName || undefined}
                            className="h-8"
                          />
                          <Input
                            placeholder="Tenant email"
                            type="email"
                            value={lot.tenant_email ?? ""}
                            onChange={(e) => updateLot(idx, { tenant_email: e.target.value })}
                            aria-invalid={errs.tEmail || undefined}
                            className="h-8"
                          />
                          <PhoneInput
                            value={lot.tenant_phone ?? "+61 "}
                            onChange={(v) => updateLot(idx, { tenant_phone: v })}
                            error={errs.tPhone}
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

      <div className="flex items-center justify-between pt-2">
        <Button type="button" variant="secondary" onClick={onBack}>Back</Button>
        <Button type="button" onClick={() => persistAndAdvance(5)} disabled={pending}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          Continue
        </Button>
      </div>

      <Dialog open={csvDialogOpen} onOpenChange={setCsvDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Import lot owners from CSV</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button type="button" variant="secondary" onClick={downloadCsv} className="flex-1 h-11">
              <Download className="mr-1.5 h-3.5 w-3.5" />
              Download template
            </Button>
            <label className="inline-flex flex-1 items-center justify-center gap-1.5 h-9 px-3 rounded-md border border-border bg-card text-sm cursor-pointer hover:bg-muted">
              <Upload className="h-3.5 w-3.5" />
              Upload completed CSV
              <input
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onUploadCsv(f);
                  e.target.value = "";
                }}
              />
            </label>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

