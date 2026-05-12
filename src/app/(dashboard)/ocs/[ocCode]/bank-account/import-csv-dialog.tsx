"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileSpreadsheet, AlertCircle, CheckCircle2 } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { parseCSV, detectColumns, normaliseRows, type ColumnMapping, type NormalisedRow, type RowError } from "@/lib/csv";
import { importBankTransactions } from "@/lib/actions/bank-transactions";
import type { ImportSummary } from "@/lib/validations/bank-transactions";
import { MAX_CSV_ROWS } from "@/lib/validations/bank-transactions";

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n);

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

interface Props {
  open: boolean;
  onClose: () => void;
  ocId: string;
  bankAccountId: string;
  fundLabel: string;
}

type Stage = "upload" | "preview" | "done";

export function ImportCsvDialog({ open, onClose, ocId, bankAccountId, fundLabel }: Props) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("upload");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>({ date: -1, description: -1, amount: -1, debit: -1, credit: -1, balance: -1 });
  const [fileName, setFileName] = useState<string>("");
  const [parseError, setParseError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setStage("upload");
    setHeaders([]);
    setRawRows([]);
    setMapping({ date: -1, description: -1, amount: -1, debit: -1, credit: -1, balance: -1 });
    setFileName("");
    setParseError(null);
    setSummary(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleFile(file: File) {
    setParseError(null);

    if (file.size > MAX_FILE_SIZE) {
      setParseError("File too large. Maximum 5MB.");
      return;
    }
    if (!/\.csv$/i.test(file.name) && file.type !== "text/csv" && file.type !== "application/vnd.ms-excel") {
      setParseError("Only CSV files are supported.");
      return;
    }

    const text = await file.text();
    const parsed = parseCSV(text);
    if (parsed.headers.length === 0 || parsed.rows.length === 0) {
      setParseError("CSV appears to be empty.");
      return;
    }
    if (parsed.rows.length > MAX_CSV_ROWS) {
      setParseError(`CSV has ${parsed.rows.length.toLocaleString()} rows. Maximum ${MAX_CSV_ROWS.toLocaleString()} per import.`);
      return;
    }

    setHeaders(parsed.headers);
    setRawRows(parsed.rows);
    setMapping(detectColumns(parsed.headers));
    setFileName(file.name);
    setStage("preview");
  }

  const { normalised, errors } = useMemo<{ normalised: NormalisedRow[]; errors: RowError[] }>(() => {
    if (stage !== "preview") return { normalised: [], errors: [] };
    const result = normaliseRows(rawRows, mapping);
    return { normalised: result.rows, errors: result.errors };
  }, [rawRows, mapping, stage]);

  const canImport =
    stage === "preview" &&
    mapping.date >= 0 &&
    (mapping.amount >= 0 || mapping.debit >= 0 || mapping.credit >= 0) &&
    normalised.length > 0;

  function handleImport() {
    if (!canImport) return;
    startTransition(async () => {
      const result = await importBankTransactions(ocId, {
        bank_account_id: bankAccountId,
        rows: normalised,
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setSummary(result.summary!);
      setStage("done");
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Import bank transactions — {fundLabel}</DialogTitle>
        </DialogHeader>

        {stage === "upload" && (
          <UploadStage onFile={handleFile} error={parseError} />
        )}

        {stage === "preview" && (
          <PreviewStage
            fileName={fileName}
            headers={headers}
            rawRows={rawRows}
            mapping={mapping}
            onMappingChange={setMapping}
            normalised={normalised}
            errors={errors}
          />
        )}

        {stage === "done" && summary && (
          <DoneStage summary={summary} fundLabel={fundLabel} />
        )}

        <DialogFooter>
          {stage === "upload" && (
            <Button variant="ghost" onClick={handleClose}>Cancel</Button>
          )}
          {stage === "preview" && (
            <>
              <Button variant="ghost" onClick={() => { setStage("upload"); setParseError(null); }}>Back</Button>
              <Button onClick={handleImport} disabled={!canImport || pending}>
                {pending ? "Importing…" : `Import ${normalised.length} ${normalised.length === 1 ? "row" : "rows"}`}
              </Button>
            </>
          )}
          {stage === "done" && (
            <Button onClick={handleClose}>Done</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Upload stage ──────────────────────────────────────────

function UploadStage({ onFile, error }: { onFile: (f: File) => void; error: string | null }) {
  const [dragActive, setDragActive] = useState(false);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Upload a CSV file exported from your bank. Supports common Australian bank formats (CBA, Westpac, ANZ, NAB).
        Dates in DD/MM/YYYY or YYYY-MM-DD. Amounts can use a single column (positive = credit, negative = debit) or separate Debit/Credit columns.
      </p>

      <label
        htmlFor="csv-upload"
        onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragActive(false);
          const file = e.dataTransfer.files[0];
          if (file) onFile(file);
        }}
        className={cn(
          "flex flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed px-6 py-10 cursor-pointer transition-colors",
          dragActive ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/30"
        )}
      >
        <FileSpreadsheet className="h-8 w-8 text-muted-foreground" />
        <div className="text-sm font-medium">Drop your CSV here, or click to browse</div>
        <div className="text-xs text-muted-foreground">Maximum 5MB, up to {MAX_CSV_ROWS.toLocaleString()} rows</div>
        <input
          id="csv-upload"
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onFile(file);
            e.target.value = "";
          }}
        />
      </label>

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}

// ─── Preview stage ─────────────────────────────────────────

function PreviewStage({
  fileName,
  headers,
  rawRows,
  mapping,
  onMappingChange,
  normalised,
  errors,
}: {
  fileName: string;
  headers: string[];
  rawRows: string[][];
  mapping: ColumnMapping;
  onMappingChange: (m: ColumnMapping) => void;
  normalised: NormalisedRow[];
  errors: RowError[];
}) {
  const previewRows = normalised.slice(0, 8);

  const updateMapping = (key: keyof ColumnMapping, value: number) => {
    onMappingChange({ ...mapping, [key]: value });
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 text-sm">
        <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
        <span className="font-medium">{fileName}</span>
        <span className="text-muted-foreground">· {rawRows.length} rows detected</span>
      </div>

      <div>
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">Column mapping</div>
        <div className="grid grid-cols-2 gap-3">
          <MappingField label="Date" required value={mapping.date} headers={headers} onChange={(v) => updateMapping("date", v)} />
          <MappingField label="Description" value={mapping.description} headers={headers} onChange={(v) => updateMapping("description", v)} />
          <MappingField label="Amount (single column)" value={mapping.amount} headers={headers} onChange={(v) => updateMapping("amount", v)} />
          <MappingField label="Balance" value={mapping.balance} headers={headers} onChange={(v) => updateMapping("balance", v)} />
          <MappingField label="Debit (if split)" value={mapping.debit} headers={headers} onChange={(v) => updateMapping("debit", v)} />
          <MappingField label="Credit (if split)" value={mapping.credit} headers={headers} onChange={(v) => updateMapping("credit", v)} />
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Use either the single <span className="font-medium">Amount</span> column, or <span className="font-medium">Debit</span> + <span className="font-medium">Credit</span> columns — not both.
        </p>
      </div>

      {errors.length > 0 && (
        <div className="rounded-md border border-warning/40 bg-warning/5 p-3 text-xs">
          <div className="flex items-center gap-2 font-medium text-foreground mb-1.5">
            <AlertCircle className="h-3.5 w-3.5 text-warning" />
            {errors.length} {errors.length === 1 ? "row" : "rows"} will be skipped
          </div>
          <ul className="space-y-0.5 text-muted-foreground max-h-20 overflow-auto">
            {errors.slice(0, 5).map((e, i) => (
              <li key={i}>Line {e.lineNumber}: {e.reason}</li>
            ))}
            {errors.length > 5 && <li>… and {errors.length - 5} more</li>}
          </ul>
        </div>
      )}

      <div>
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">
          Preview ({normalised.length} valid {normalised.length === 1 ? "row" : "rows"})
        </div>
        {previewRows.length === 0 ? (
          <div className="rounded-md border border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
            Map required columns above to see preview.
          </div>
        ) : (
          <div className="rounded-md border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-xs uppercase tracking-wide text-muted-foreground">Date</th>
                  <th className="px-3 py-2 text-left font-medium text-xs uppercase tracking-wide text-muted-foreground">Description</th>
                  <th className="px-3 py-2 text-right font-medium text-xs uppercase tracking-wide text-muted-foreground">Amount</th>
                </tr>
              </thead>
              <tbody>
                {previewRows.map((r, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="px-3 py-2 tabular-nums">{r.transaction_date}</td>
                    <td className="px-3 py-2 max-w-xs truncate" title={r.description}>{r.description || <span className="text-muted-foreground italic">—</span>}</td>
                    <td className={cn("px-3 py-2 text-right tabular-nums font-medium", r.amount < 0 ? "text-destructive" : "text-secondary")}>
                      {formatCurrency(r.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {normalised.length > previewRows.length && (
              <div className="bg-muted/30 px-3 py-2 text-xs text-muted-foreground text-center border-t border-border">
                + {normalised.length - previewRows.length} more rows
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function MappingField({
  label,
  required,
  value,
  headers,
  onChange,
}: {
  label: string;
  required?: boolean;
  value: number;
  headers: string[];
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </Label>
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
      >
        <option value={-1}>— Not mapped —</option>
        {headers.map((h, i) => (
          <option key={i} value={i}>{h || `(column ${i + 1})`}</option>
        ))}
      </select>
    </div>
  );
}

// ─── Done stage ────────────────────────────────────────────

function DoneStage({ summary, fundLabel }: { summary: ImportSummary; fundLabel: string }) {
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-md border border-secondary/30 bg-secondary/5 p-4">
        <CheckCircle2 className="h-5 w-5 text-secondary mt-0.5 shrink-0" />
        <div>
          <div className="font-medium text-foreground">Import complete</div>
          <div className="text-sm text-muted-foreground mt-0.5">
            {summary.imported} {summary.imported === 1 ? "transaction" : "transactions"} added to {fundLabel}.
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <SummaryCard label="Imported" value={summary.imported} />
        <SummaryCard label="Auto-matched to levies" value={summary.matched} />
        <SummaryCard
          label="Already in records"
          value={summary.exact_duplicates_dropped}
          muted
        />
        <SummaryCard
          label="Flagged for review"
          value={summary.cross_source_duplicates_flagged}
          muted
        />
      </div>

      {summary.matched > 0 && (
        <Badge className="rounded-full">
          {summary.matched} {summary.matched === 1 ? "payment" : "payments"} identified by reference number
        </Badge>
      )}

      {summary.cross_source_duplicates_flagged > 0 && (
        <div className="text-sm text-muted-foreground">
          {summary.cross_source_duplicates_flagged}{" "}
          {summary.cross_source_duplicates_flagged === 1 ? "row" : "rows"} flagged
          as a possible duplicate of an existing transaction. Review them in the
          reconciliation queue.
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, muted }: { label: string; value: number; muted?: boolean }) {
  return (
    <div className="rounded-md border border-border p-3">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("text-2xl font-bold tabular-nums mt-1", muted ? "text-muted-foreground" : "text-foreground")}>
        {value}
      </div>
    </div>
  );
}
