"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { updateBankAccountBalance } from "./actions";

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

interface ParsedTxn {
  date: string | null; // ISO
  description: string;
  amount: number | null;
  balance: number | null;
}

interface ParseResult {
  rowCount: number;
  txns: ParsedTxn[];
  detectedBalance: number | null;
  detectedAsOf: string | null;
}

function parseCsv(text: string): ParseResult {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { rowCount: 0, txns: [], detectedBalance: null, detectedAsOf: null };
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
  const rows = lines.map(parseLine);
  const header = rows[0].map((h) => h.toLowerCase());
  const body = rows.slice(1);

  const indexOfAny = (...needles: string[]): number => {
    for (const n of needles) {
      const i = header.findIndex((h) => h === n || h.includes(n));
      if (i >= 0) return i;
    }
    return -1;
  };
  const balanceIdx = indexOfAny("balance", "running balance");
  const amountIdx = indexOfAny("amount");
  const creditIdx = indexOfAny("credit");
  const debitIdx = indexOfAny("debit");
  const dateIdx = indexOfAny("date", "posted date", "transaction date");
  const descIdx = indexOfAny("description", "narration", "details", "transaction", "narrative");

  const num = (s: string): number | null => {
    const cleaned = (s ?? "").replace(/[, $]/g, "").trim();
    if (!cleaned) return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  };
  const isoDate = (raw: string): string | null => {
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
  };

  const txns: ParsedTxn[] = body.map((r) => {
    let amount: number | null = null;
    if (amountIdx >= 0) amount = num(r[amountIdx]);
    else if (creditIdx >= 0 || debitIdx >= 0) {
      const c = creditIdx >= 0 ? (num(r[creditIdx]) ?? 0) : 0;
      const d = debitIdx >= 0 ? (num(r[debitIdx]) ?? 0) : 0;
      amount = c - d;
    }
    return {
      date: dateIdx >= 0 ? isoDate(r[dateIdx]) : null,
      description: descIdx >= 0 ? r[descIdx] : "",
      amount,
      balance: balanceIdx >= 0 ? num(r[balanceIdx]) : null,
    };
  });

  // Detect the closing balance: prefer last row's balance column.
  let detectedBalance: number | null = null;
  if (balanceIdx >= 0) {
    for (let i = txns.length - 1; i >= 0; i--) {
      if (txns[i].balance !== null) { detectedBalance = txns[i].balance; break; }
    }
  }
  if (detectedBalance === null) {
    const sum = txns.reduce((s, t) => s + (t.amount ?? 0), 0);
    if (sum !== 0) detectedBalance = Math.round(sum * 100) / 100;
  }

  // Detect statement date: latest date in the parsed set.
  let detectedAsOf: string | null = null;
  for (const t of txns) {
    if (t.date && (!detectedAsOf || t.date > detectedAsOf)) detectedAsOf = t.date;
  }

  return { rowCount: body.length, txns, detectedBalance, detectedAsOf };
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
  const [fileName, setFileName] = useState<string | null>(null);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [pending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const accountLabel = useMemo(
    () => account.account_name || account.bank_name || "Bank account",
    [account.account_name, account.bank_name],
  );

  async function handleFile(file: File) {
    const text = await file.text();
    const result = parseCsv(text);
    setFileName(file.name);
    setParseResult(result);
    if (result.rowCount === 0) {
      toast.error("Couldn't find any rows in that CSV.");
    }
  }

  function handleConfirm() {
    if (!parseResult || parseResult.txns.length === 0) {
      toast.error("Pick a CSV first.");
      return;
    }
    const balance = parseResult.detectedBalance;
    if (balance === null) {
      toast.error("We couldn't detect a closing balance in that file.");
      return;
    }
    startTransition(async () => {
      const res = await updateBankAccountBalance(ocId, account.id, balance, parseResult.detectedAsOf);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(`${accountLabel} balance updated`);
      onOpenChange(false);
    });
  }

  if (!open) return null;

  // Full-screen takeover. Backdrop + content; click backdrop to close
  // when not in-flight. No filler copy, no per-row "manual entry" ,
  // just upload + review parsed transactions + confirm.
  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div>
          <h2 className="text-base font-semibold text-foreground">Import CSV</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{accountLabel}</p>
        </div>
        <button
          type="button"
          onClick={() => !pending && onOpenChange(false)}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
          aria-label="Close"
          disabled={pending}
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex-1 overflow-auto px-6 py-6">
        {!parseResult ? (
          <div className="mx-auto max-w-md flex flex-col items-center gap-4 pt-16">
            <Button
              size="lg"
              onClick={() => fileInputRef.current?.click()}
              disabled={pending}
            >
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
        ) : (
          <div className="max-w-5xl mx-auto space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-sm text-foreground">
                <span className="font-medium">{fileName}</span>
                <span className="text-muted-foreground"> &middot; {parseResult.rowCount} transaction{parseResult.rowCount === 1 ? "" : "s"} parsed</span>
              </div>
              <Button variant="secondary" size="sm" onClick={() => fileInputRef.current?.click()} disabled={pending}>
                <Upload className="mr-1.5 h-3.5 w-3.5" />
                Replace file
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-4 rounded-md border border-border bg-muted/30 px-4 py-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Closing balance</p>
                <p className="text-xl font-bold tabular-nums text-foreground mt-1">
                  {parseResult.detectedBalance !== null ? formatCurrency(parseResult.detectedBalance) : "Not detected"}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Statement date</p>
                <p className="text-xl font-bold tabular-nums text-foreground mt-1">
                  {parseResult.detectedAsOf ? formatDate(parseResult.detectedAsOf) : "Not detected"}
                </p>
              </div>
            </div>

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
                  {parseResult.txns.map((t, i) => (
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
        )}
      </div>

      {parseResult && (
        <div className="border-t border-border px-6 py-3 flex justify-end">
          <Button onClick={handleConfirm} disabled={pending || parseResult.detectedBalance === null}>
            {pending && <Loader2 className="mr-2 size-4 animate-spin" />}
            Confirm and save balance
          </Button>
        </div>
      )}
    </div>
  );
}
