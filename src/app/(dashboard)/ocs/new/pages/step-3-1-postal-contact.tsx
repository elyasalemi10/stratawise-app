"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Download, FileSpreadsheet, Loader2, MapPin, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PhoneInput } from "@/components/shared/phone-input";
import { saveStep, type DraftJson, type DraftLot } from "../actions";

function isValidAuPhone(raw: string): boolean {
  if (!raw) return true;
  const digits = raw.replace(/\D/g, "");
  return digits.length >= 8 && digits.length <= 11;
}
function isValidEmail(raw: string): boolean {
  if (!raw) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw);
}

// Reuse the lot CSV template format (extended with owner_type column).
function lotsToCsv(lots: DraftLot[]): string {
  const header = [
    "lot_number","unit_number","owner_type",
    "owner_name","owner_email","owner_phone","owner_postal_address",
    "is_occupied_by_owner","tenant_name","tenant_email","tenant_phone",
  ];
  const rows = lots.map((l) => [
    l.lot_number,
    l.unit_number ?? "",
    l.owner_type ?? "individual",
    l.owner_name ?? "",
    l.owner_email ?? "",
    l.owner_phone ?? "",
    l.owner_postal_address ?? "",
    l.is_occupied_by_owner === false ? "false" : "true",
    l.tenant_name ?? "",
    l.tenant_email ?? "",
    l.tenant_phone ?? "",
  ]);
  return [header, ...rows].map((r) => r.map((c) => {
    const s = String(c);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(",")).join("\n");
}

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
  const defaultsByLot = new Map<number, DraftLot>();
  defaults.forEach((l) => defaultsByLot.set(l.lot_number, l));
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
    const ownerType = (cols[idx("owner_type")] ?? "individual").trim().toLowerCase();
    const ownerOccupied = ((cols[idx("is_occupied_by_owner")] ?? "true").toLowerCase() !== "false");
    const target = merged.find((l) => l.lot_number === lot_number)!;
    target.owner_type = ownerType === "company" ? "company" : "individual";
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

export function Step3PostalContact({
  draftId,
  initialDraft,
  onBack,
  onNext,
}: {
  draftId: string;
  initialDraft: DraftJson;
  onBack: () => void;
  onNext: () => void;
}) {
  const [lots, setLots] = useState<DraftLot[]>(initialDraft.lots ?? []);
  const [csvDialogOpen, setCsvDialogOpen] = useState(false);
  const [csvErrors, setCsvErrors] = useState<{ row: number; reason: string }[]>([]);
  const [rowErrors, setRowErrors] = useState<Array<{ email?: boolean; phone?: boolean; postal?: boolean }>>([]);
  const [pending, setPending] = useState(false);

  const ocSiteAddress = initialDraft.address ?? "";
  const notOwnerOccupiedCount = useMemo(
    () => lots.filter((l) => l.is_occupied_by_owner === false).length,
    [lots],
  );

  function updateLot(idx: number, patch: Partial<DraftLot>) {
    setLots((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
    if (rowErrors[idx]) {
      setRowErrors((prev) => {
        const next = [...prev];
        const cur = { ...(next[idx] ?? {}) };
        if ("owner_email" in patch) cur.email = false;
        if ("owner_phone" in patch) cur.phone = false;
        if ("owner_postal_address" in patch) cur.postal = false;
        next[idx] = cur;
        return next;
      });
    }
  }

  function autoFillSiteAddress(idx: number) {
    if (!ocSiteAddress) {
      toast.error("OC site address isn't set — fill it in on Step 1 first.");
      return;
    }
    updateLot(idx, { owner_postal_address: ocSiteAddress });
  }

  function downloadCsv() {
    const blob = new Blob([lotsToCsv(lots)], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "lot-owners-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  function isOurTemplate(text: string): boolean {
    const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
    const cols = parseCsvLine(firstLine).map((c) => c.trim().toLowerCase());
    const expected = [
      "lot_number", "unit_number", "owner_type",
      "owner_name", "owner_email", "owner_phone", "owner_postal_address",
      "is_occupied_by_owner", "tenant_name", "tenant_email", "tenant_phone",
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

  async function onContinue() {
    const problems: string[] = [];
    const nextRowErrors: typeof rowErrors = lots.map(() => ({}));

    lots.forEach((l, i) => {
      if (l.owner_email && !isValidEmail(l.owner_email)) {
        problems.push(`Lot ${l.lot_number}: invalid email.`);
        nextRowErrors[i].email = true;
      }
      if (l.owner_phone && !isValidAuPhone(l.owner_phone)) {
        problems.push(`Lot ${l.lot_number}: invalid phone.`);
        nextRowErrors[i].phone = true;
      }
      if (!(l.owner_postal_address ?? "").trim()) {
        problems.push(`Lot ${l.lot_number}: postal address is required for paper notices.`);
        nextRowErrors[i].postal = true;
      }
    });
    setRowErrors(nextRowErrors);

    if (problems.length) {
      toast.error(problems.length === 1 ? problems[0] : `${problems.length} rows need attention.`);
      return;
    }

    setPending(true);
    const r = await saveStep(draftId, { lots }, 3, 2); // Advance to Step 3.2.
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
        <h2 className="text-lg font-semibold text-foreground">Postal & contact</h2>
      </div>

      <div className="flex items-center justify-between gap-4">
        <div className="text-sm">
          {notOwnerOccupiedCount === 0 ? (
            <span className="text-muted-foreground">All lots are owner-occupied.</span>
          ) : (
            <span className="text-foreground">
              <strong>{notOwnerOccupiedCount}</strong> of {lots.length} lot{lots.length === 1 ? "" : "s"} {notOwnerOccupiedCount === 1 ? "is" : "are"} not owner-occupied.
            </span>
          )}
        </div>
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

      {/* Per-lot contact + postal. Postal sits as its own sub-row beneath the
          contact row so the input has room for a full address. */}
      <div className="rounded-md border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-muted-foreground">
            <tr className="text-xs uppercase tracking-wide border-b border-border">
              <th className="px-3 py-2 text-left font-medium w-24">Lot</th>
              <th className="px-3 py-2 text-left font-medium w-44">Owner</th>
              <th className="px-3 py-2 text-left font-medium">Email</th>
              <th className="px-3 py-2 text-left font-medium w-48">Phone</th>
            </tr>
          </thead>
          <tbody>
            {lots.map((lot, idx) => {
              const errs = rowErrors[idx] ?? {};
              const showSiteFillButton = lot.is_occupied_by_owner !== false && !!ocSiteAddress;
              return (
                <>
                  <tr key={`r-${idx}`}>
                    <td className="px-3 py-1.5 tabular-nums">
                      {lot.lot_number}
                      {lot.unit_number ? <span className="text-muted-foreground"> / {lot.unit_number}</span> : null}
                    </td>
                    <td className="px-3 py-1.5 text-muted-foreground truncate" title={lot.owner_name || ""}>
                      {lot.owner_name || "—"}
                      {lot.is_occupied_by_owner === false && (
                        <span className="ml-2 inline-flex items-center rounded-full bg-amber-50 text-amber-800 text-[10px] px-1.5 py-0.5 font-medium">
                          Tenanted
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-1.5">
                      <Input
                        type="email"
                        value={lot.owner_email ?? ""}
                        onChange={(e) => updateLot(idx, { owner_email: e.target.value })}
                        aria-invalid={errs.email || undefined}
                        placeholder="Email"
                        className="h-8"
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <PhoneInput
                        value={lot.owner_phone ?? "+61 "}
                        onChange={(v) => updateLot(idx, { owner_phone: v })}
                        error={errs.phone}
                      />
                    </td>
                  </tr>
                  <tr key={`p-${idx}`} className="bg-muted/10">
                    <td className="px-3 py-1.5" />
                    <td className="px-3 py-1.5 text-xs text-muted-foreground align-top pt-3">Postal</td>
                    <td className="px-3 py-1.5" colSpan={2}>
                      <div className="flex items-center gap-2">
                        <Input
                          value={lot.owner_postal_address ?? ""}
                          onChange={(e) => updateLot(idx, { owner_postal_address: e.target.value })}
                          aria-invalid={errs.postal || undefined}
                          placeholder="Street, suburb, state, postcode"
                          className="h-8"
                        />
                        {showSiteFillButton && (
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            className="shrink-0 h-8"
                            onClick={() => autoFillSiteAddress(idx)}
                          >
                            <MapPin className="mr-1 h-3 w-3" />
                            Site address
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                </>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="rounded-md border border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
        Postal addresses will be verified by PostGrid once delivery checking is enabled. For now we just store what you enter.
      </div>

      <div className="flex justify-between pt-2">
        <Button type="button" variant="secondary" onClick={onBack}>Back</Button>
        <Button type="button" onClick={onContinue} disabled={pending}>
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
