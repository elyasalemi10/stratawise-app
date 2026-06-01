"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { importBankTransactions } from "./actions";

interface Account {
  id: string;
  account_name: string | null;
  bank_name: string | null;
}

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n);

const formatDate = (iso: string | null): string => {
  if (!iso) return "";
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
};

function parseCsvCells(text: string): string[][] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const parseLine = (line: string): string[] => {
    const cells: string[] = [];
    let cur = "";
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; continue; }
      if (ch === '"') { inQuote = !inQuote; continue; }
      if (ch === "," && !inQuote) { cells.push(cur); cur = ""; continue; }
      cur += ch;
    }
    cells.push(cur);
    return cells.map((c) => c.trim());
  };
  return lines.map(parseLine);
}

function detectHeader(firstRow: string[]): boolean {
  const KEYWORDS = ["date", "amount", "description", "narration", "details", "credit", "debit", "balance", "transaction", "narrative", "reference"];
  const lower = firstRow.map((c) => c.toLowerCase());
  const hasKeyword = lower.some((c) => KEYWORDS.some((kw) => c.includes(kw)));
  if (!hasKeyword) return false;
  const numericish = lower.filter((c) =>
    /^[\d/.\-,$+]+$/.test(c.replace(/\s/g, "")) || /^\d{1,2}[\/-]\d/.test(c)
  ).length;
  return numericish < Math.ceil(firstRow.length / 2);
}

type ColumnRole = "date" | "description" | "amount" | "balance" | "credit" | "debit" | "reference" | "ignore";

function autoDetect(headerCells: string[] | null, dataRow: string[]): Record<number, ColumnRole> {
  const map: Record<number, ColumnRole> = {};
  if (headerCells) {
    headerCells.forEach((h, i) => {
      const lower = h.toLowerCase();
      if (/(^|\b)date(\b|$)|posted date|transaction date/.test(lower)) map[i] = "date";
      else if (/balance|running balance/.test(lower)) map[i] = "balance";
      else if (/credit/.test(lower)) map[i] = "credit";
      else if (/debit/.test(lower)) map[i] = "debit";
      else if (/amount/.test(lower)) map[i] = "amount";
      else if (/\bdrn\b|deft.?ref|reference (?:number|no)|payer (?:ref|reference)/.test(lower)) map[i] = "reference";
      else if (/description|narration|details|transaction|narrative/.test(lower)) map[i] = "description";
      else map[i] = "ignore";
    });
    return map;
  }
  let dateAssigned = false;
  let amountAssigned = false;
  let balanceAssigned = false;
  let longestText = -1;
  let longestTextLen = -1;
  dataRow.forEach((cell, i) => {
    const clean = cell.replace(/[$,\s+]/g, "");
    if (!dateAssigned && /^\d{1,4}[\/.\-]\d{1,2}[\/.\-]\d{1,4}$/.test(clean)) {
      map[i] = "date";
      dateAssigned = true;
      return;
    }
    if (/^-?\d+(\.\d+)?$/.test(clean)) {
      if (!amountAssigned) { map[i] = "amount"; amountAssigned = true; return; }
      if (!balanceAssigned) { map[i] = "balance"; balanceAssigned = true; return; }
    }
    if (cell.length > longestTextLen) {
      longestTextLen = cell.length;
      longestText = i;
    }
    map[i] = "ignore";
  });
  if (longestText >= 0) map[longestText] = "description";
  return map;
}

interface ParsedTxn {
  date: string | null;
  description: string;
  amount: number | null;
  balance: number | null;
  reference: string | null;
}

function num(s: string): number | null {
  const cleaned = (s ?? "").replace(/[, $]/g, "").trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function isoDate(raw: string): string | null {
  const parts = (raw ?? "").split(/[\/\-.]/).map((p) => p.trim());
  if (parts.length !== 3) return null;
  let y: string, m: string, d: string;
  if (parts[0].length === 4) {
    [y, m, d] = parts;
  } else {
    [d, m, y] = parts;
    if (y.length === 2) y = `20${y}`;
  }
  const iso = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : null;
}

function mapRows(dataRows: string[][], mapping: Record<number, ColumnRole>): ParsedTxn[] {
  const findIdx = (role: ColumnRole) =>
    Object.entries(mapping).find(([, r]) => r === role)?.[0];
  const dateI = findIdx("date");
  const descI = findIdx("description");
  const amountI = findIdx("amount");
  const balanceI = findIdx("balance");
  const creditI = findIdx("credit");
  const debitI = findIdx("debit");
  const refI = findIdx("reference");

  return dataRows.map((r) => {
    let amount: number | null = null;
    if (amountI !== undefined) amount = num(r[Number(amountI)] ?? "");
    else if (creditI !== undefined || debitI !== undefined) {
      const c = creditI !== undefined ? (num(r[Number(creditI)] ?? "") ?? 0) : 0;
      const d = debitI !== undefined ? (num(r[Number(debitI)] ?? "") ?? 0) : 0;
      amount = c - d;
    }
    const rawRef = refI !== undefined ? (r[Number(refI)] ?? "").trim() : "";
    return {
      date: dateI !== undefined ? isoDate(r[Number(dateI)] ?? "") : null,
      description: descI !== undefined ? (r[Number(descI)] ?? "") : "",
      amount,
      balance: balanceI !== undefined ? num(r[Number(balanceI)] ?? "") : null,
      reference: rawRef || null,
    };
  });
}

export function ImportCsvDialog({
  ocId,
  account,
  open,
  onOpenChange,
}: {
  ocId: string;
  account: Account;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [rows, setRows] = useState<string[][] | null>(null);
  const [headerCells, setHeaderCells] = useState<string[] | null>(null);
  const [mapping, setMapping] = useState<Record<number, ColumnRole>>({});
  const [pending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const accountLabel = useMemo(
    () => account.account_name || account.bank_name || "Bank account",
    [account.account_name, account.bank_name],
  );

  const txns: ParsedTxn[] = useMemo(
    () => (rows ? mapRows(rows, mapping) : []),
    [rows, mapping],
  );

  // Item 6: confirm is allowed only when Date + Description are mapped
  // AND an Amount mapping OR a (Credit AND Debit) pair is mapped. Mixing
  // a standalone Amount with Credit/Debit isn't supported , block that.
  const roleSet = useMemo(() => new Set(Object.values(mapping)), [mapping]);
  const hasDate = roleSet.has("date");
  const hasDesc = roleSet.has("description");
  const hasAmount = roleSet.has("amount");
  const hasCredit = roleSet.has("credit");
  const hasDebit = roleSet.has("debit");
  const amountConfigValid =
    (hasAmount && !hasCredit && !hasDebit) ||
    (!hasAmount && hasCredit && hasDebit);
  const canConfirm = !!rows && rows.length > 0 && hasDate && hasDesc && amountConfigValid;

  async function handleFile(file: File) {
    const text = await file.text();
    const parsed = parseCsvCells(text);
    if (parsed.length === 0) {
      toast.error("Couldn't find any rows in that CSV.");
      return;
    }
    const looksLikeHeader = detectHeader(parsed[0]);
    const header = looksLikeHeader ? parsed[0] : null;
    const data = looksLikeHeader ? parsed.slice(1) : parsed;
    const detected = autoDetect(header, data[0] ?? []);
    setHeaderCells(header);
    setRows(data);
    setMapping(detected);
  }

  function handleConfirm() {
    if (!canConfirm) return;
    startTransition(async () => {
      const res = await importBankTransactions(
        ocId,
        account.id,
        txns,
      );
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(`Imported ${res.inserted ?? 0} transaction${res.inserted === 1 ? "" : "s"}`);
      onOpenChange(false);
    });
  }

  if (!open) return null;

  if (!rows) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Import CSV</DialogTitle>
            <DialogDescription>{accountLabel}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-3 py-6">
            <Button size="lg" onClick={() => fileInputRef.current?.click()}>
              <Upload className="mr-2 h-4 w-4" />
              Upload CSV
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
                e.target.value = "";
              }}
            />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // Full-screen takeover , no top bar, only an X in the top-right + a
  // floating column-mapper + transactions preview + sticky confirm row.
  const columnCount = headerCells?.length ?? (rows[0]?.length ?? 0);
  const sampleRows = rows.slice(0, 5);

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      <button
        type="button"
        onClick={() => !pending && onOpenChange(false)}
        className="absolute top-4 right-4 z-10 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
        aria-label="Close"
        disabled={pending}
      >
        <X className="h-5 w-5" />
      </button>

      <div className="flex-1 overflow-auto px-6 pt-12 pb-6">
        <div className="max-w-5xl mx-auto space-y-4">
          <div className="text-sm text-foreground">
            <span className="text-muted-foreground">{rows.length} transaction{rows.length === 1 ? "" : "s"} parsed</span>
          </div>

          {/* Column mapper. One dropdown per CSV column. Sample rows below
              the dropdowns help the manager pick. Spans the full card. */}
          <div className="rounded-md border border-border bg-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs table-fixed">
                <thead>
                  <tr className="bg-muted/20">
                    {Array.from({ length: columnCount }).map((_, i) => (
                      <th
                        key={i}
                        className="px-3 py-2 text-left border-r border-border last:border-r-0"
                        style={{ width: `${100 / columnCount}%` }}
                      >
                        <Select
                          value={mapping[i] ?? "ignore"}
                          onValueChange={(v) => setMapping((prev) => ({ ...prev, [i]: v as ColumnRole }))}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="date">Date</SelectItem>
                            <SelectItem value="description">Description</SelectItem>
                            <SelectItem value="amount">Amount</SelectItem>
                            <SelectItem value="credit">Credit</SelectItem>
                            <SelectItem value="debit">Debit</SelectItem>
                            <SelectItem value="balance">Balance</SelectItem>
                            <SelectItem value="reference">Reference / DRN</SelectItem>
                            <SelectItem value="ignore">Ignore</SelectItem>
                          </SelectContent>
                        </Select>
                        {headerCells && (
                          <p className="mt-1 truncate text-muted-foreground" title={headerCells[i] ?? ""}>{headerCells[i]}</p>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sampleRows.map((row, ri) => (
                    <tr key={ri} className="border-t border-border">
                      {Array.from({ length: columnCount }).map((_, i) => (
                        <td key={i} className="px-3 py-1.5 border-r border-border last:border-r-0 text-foreground truncate">
                          {row[i] ?? ""}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Parsed transactions preview */}
          <div className="overflow-hidden rounded-md border border-border">
            <Table variant="striped">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[110px]">Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="w-[130px] text-right">Amount</TableHead>
                  <TableHead className="w-[140px] text-right">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {txns.map((t, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-foreground text-xs">{formatDate(t.date)}</TableCell>
                    <TableCell className="text-foreground text-xs">{t.description}</TableCell>
                    <TableCell className={`text-right tabular-nums text-xs ${t.amount !== null && t.amount < 0 ? "text-destructive" : "text-foreground"}`}>
                      {t.amount !== null ? formatCurrency(t.amount) : ""}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-xs text-foreground">
                      {t.balance !== null ? formatCurrency(t.balance) : ""}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>

      <div className="border-t border-border px-6 py-3 flex justify-end">
        <Button onClick={handleConfirm} disabled={pending || !canConfirm}>
          {pending && <Loader2 className="mr-2 size-4 animate-spin" />}
          Confirm import
        </Button>
      </div>
    </div>
  );
}
