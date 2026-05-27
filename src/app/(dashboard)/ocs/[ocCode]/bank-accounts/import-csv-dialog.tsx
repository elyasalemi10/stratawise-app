"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NumberInput } from "@/components/ui/number-input";
import { DatePicker } from "@/components/shared/date-picker";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { updateBankAccountBalance } from "./actions";

interface Account {
  id: string;
  account_name: string | null;
  bank_name: string | null;
}

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n);

/**
 * Parse a generic bank CSV. Looks for column headers (case-insensitive)
 * to decide how to compute the balance:
 *   - If a "Balance" / "Running Balance" column exists, use the LAST row's value.
 *   - Else if "Amount" / "Credit" / "Debit" columns exist, sum them
 *     (debits as negative) and add to the account's starting balance (here 0
 *     because we don't have one yet; the import dialog asks the manager).
 *   - "Date" / "Posted Date" / "Transaction Date" → captured as the latest
 *     row's date (the asOf field on the account).
 *
 * Format coverage: Macquarie, CBA, NAB, Westpac, ANZ — all of these
 * export CSVs with these column names (capitalisation varies, hence the
 * case-insensitive lookup).
 */
function parseCsv(text: string): {
  rowCount: number;
  detectedBalance: number | null;
  detectedAsOf: string | null;
  sampleRows: string[][];
} {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { rowCount: 0, detectedBalance: null, detectedAsOf: null, sampleRows: [] };
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

  const num = (s: string): number => {
    const cleaned = (s ?? "").replace(/[, $]/g, "").trim();
    if (!cleaned) return NaN;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : NaN;
  };

  // Pick the LAST row that has a usable balance / amount, since some
  // banks export rows in reverse chronological order. We try "balance"
  // first, then sum amounts.
  let detectedBalance: number | null = null;
  if (balanceIdx >= 0 && body.length > 0) {
    for (let i = body.length - 1; i >= 0; i--) {
      const v = num(body[i][balanceIdx]);
      if (!Number.isNaN(v)) { detectedBalance = v; break; }
    }
  }
  if (detectedBalance === null && (amountIdx >= 0 || creditIdx >= 0 || debitIdx >= 0)) {
    let sum = 0;
    for (const r of body) {
      if (amountIdx >= 0) {
        const v = num(r[amountIdx]);
        if (!Number.isNaN(v)) sum += v;
      } else {
        const c = creditIdx >= 0 ? num(r[creditIdx]) : 0;
        const d = debitIdx >= 0 ? num(r[debitIdx]) : 0;
        sum += (Number.isNaN(c) ? 0 : c) - (Number.isNaN(d) ? 0 : d);
      }
    }
    detectedBalance = Math.round(sum * 100) / 100;
  }

  let detectedAsOf: string | null = null;
  if (dateIdx >= 0 && body.length > 0) {
    // Try to parse the last row's date in a couple of common formats.
    const raw = body[body.length - 1][dateIdx];
    const parts = raw.split(/[\/\-.]/).map((p) => p.trim());
    if (parts.length === 3) {
      // dd/mm/yyyy or yyyy-mm-dd
      let y: string, m: string, d: string;
      if (parts[0].length === 4) {
        [y, m, d] = parts;
      } else {
        [d, m, y] = parts;
        if (y.length === 2) y = `20${y}`;
      }
      const iso = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
      if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) detectedAsOf = iso;
    }
  }

  return {
    rowCount: body.length,
    detectedBalance,
    detectedAsOf,
    sampleRows: body.slice(0, 3),
  };
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
  const [parseResult, setParseResult] = useState<ReturnType<typeof parseCsv> | null>(null);
  const [balance, setBalance] = useState<string>("");
  const [asOf, setAsOf] = useState<string>("");
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
    if (result.detectedBalance !== null) setBalance(String(result.detectedBalance));
    if (result.detectedAsOf) setAsOf(result.detectedAsOf);
    if (result.rowCount === 0) {
      toast.error("Couldn't find any rows in that CSV.");
    } else if (result.detectedBalance === null) {
      toast.info("Couldn't detect a balance column. Enter the closing balance manually.");
    }
  }

  function handleSave() {
    const parsed = parseFloat(balance);
    if (!Number.isFinite(parsed)) {
      toast.error("Enter the closing balance.");
      return;
    }
    startTransition(async () => {
      const res = await updateBankAccountBalance(ocId, account.id, parsed, asOf || null);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(`${accountLabel} balance updated`);
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!pending) onOpenChange(o); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Import CSV , {accountLabel}</DialogTitle>
          <DialogDescription>
            Upload a bank statement CSV. We detect the closing balance and statement date; you can also enter them manually below.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Statement file</Label>
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="secondary"
                onClick={() => fileInputRef.current?.click()}
                disabled={pending}
              >
                <Upload className="mr-1.5 h-3.5 w-3.5" />
                {fileName ? "Replace file" : "Choose CSV"}
              </Button>
              {fileName && (
                <span className="text-xs text-muted-foreground truncate">{fileName}</span>
              )}
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
          </div>

          {parseResult && (
            <div className="text-xs text-muted-foreground">
              Parsed <span className="font-medium text-foreground">{parseResult.rowCount}</span> row{parseResult.rowCount === 1 ? "" : "s"}.
              {parseResult.detectedBalance !== null && (
                <> Detected closing balance: <span className="font-medium text-foreground">{formatCurrency(parseResult.detectedBalance)}</span>.</>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Closing balance</Label>
              <NumberInput
                value={balance}
                onChange={setBalance}
                thousandsSeparator
                prefix="$"
                placeholder="0.00"
                allowDecimal
              />
            </div>
            <div className="space-y-1.5">
              <Label>Statement date</Label>
              <DatePicker value={asOf} onChange={setAsOf} />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={pending || balance === ""}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            Save balance
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
