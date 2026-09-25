"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { AlertTriangle, Upload, X } from "lucide-react";
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
import { cn } from "@/lib/utils";
import { importBankTransactions } from "./actions";

import { formatDateShort } from "@/lib/format-date";
interface Account {
  id: string;
  account_name: string | null;
  bank_name: string | null;
}

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n);

const formatDate = (iso: string | null): string => {
  if (!iso) return "";
  return formatDateShort(new Date(`${iso}T00:00:00`));
};

function parseCsvCells(text: string): string[][] {
  // One pass over the whole file, not line-by-line.
  //
  // Splitting on newlines first and parsing quotes per line cannot work: a
  // quoted description containing a line break is one field, and the old
  // version tore it into two rows, shifting every column after it. Bank
  // exports do this often enough that it was a matter of time.
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let inQuote = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuote) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; continue; }
        inQuote = false;
        continue;
      }
      cur += ch;
      continue;
    }
    if (ch === '"') { inQuote = true; continue; }
    if (ch === ",") { row.push(cur); cur = ""; continue; }
    if (ch === "\r") continue;
    if (ch === "\n") {
      row.push(cur);
      cur = "";
      if (row.some((c) => c.trim().length > 0)) rows.push(row.map((c) => c.trim()));
      row = [];
      continue;
    }
    cur += ch;
  }
  row.push(cur);
  if (row.some((c) => c.trim().length > 0)) rows.push(row.map((c) => c.trim()));
  return rows;
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

/** The trigger showed the raw key, because <SelectValue> with no children
 *  falls back to the value. A manager mapping a column was reading
 *  "description" and "ignore" as if they were our column names. */
const COLUMN_ROLE_LABEL: Record<ColumnRole, string> = {
  date: "Date",
  description: "Description",
  amount: "Amount",
  credit: "Money in",
  debit: "Money out",
  balance: "Balance",
  // Not "Reference / DRN". A DRN is Macquarie's own identifier and arrives
  // through the DEFT file, never in a CSV a manager exports, so offering it
  // here was naming a concept that cannot appear in this column.
  reference: "Reference",
  ignore: "Ignore",
};

const COLUMN_ROLE_OPTIONS = (Object.keys(COLUMN_ROLE_LABEL) as ColumnRole[]).map((value) => ({
  value,
  label: COLUMN_ROLE_LABEL[value],
}));

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
  let cleaned = (s ?? "").replace(/[, $]/g, "").trim();
  if (!cleaned) return null;

  // Accounting negatives: "(123.45)" is minus one hundred and twenty three
  // dollars forty five, and Number() makes it NaN, so the amount silently
  // came through as nothing.
  let negative = false;
  if (/^\(.*\)$/.test(cleaned)) {
    negative = true;
    cleaned = cleaned.slice(1, -1);
  }
  // Some exports suffix the direction instead of signing the number.
  const suffix = cleaned.match(/(CR|DR)$/i);
  if (suffix) {
    if (suffix[1].toUpperCase() === "DR") negative = true;
    cleaned = cleaned.slice(0, -2).trim();
  }
  if (cleaned.startsWith("-")) { negative = true; cleaned = cleaned.slice(1); }
  if (cleaned.startsWith("+")) cleaned = cleaned.slice(1);

  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return negative ? -Math.abs(n) : n;
}

type DateOrder = "auto" | "dmy" | "mdy" | "ymd";

export const DATE_ORDER_LABEL: Record<DateOrder, string> = {
  auto: "Work it out",
  dmy: "Day first (31/12/2026)",
  mdy: "Month first (12/31/2026)",
  ymd: "Year first (2026-12-31)",
};

/**
 * Which way round a column of dates is.
 *
 * Only ever certain when some value has a first part above 12, which cannot
 * be a month. A whole file of days under 13 is genuinely ambiguous, and
 * guessing there is how 03/04 becomes 3 April in a file that meant 4 March,
 * with nothing to show it went wrong. That case is what the manual override
 * exists for; we default to day-first because this is Australia, and say so.
 */
function sniffDateOrder(samples: string[]): { order: Exclude<DateOrder, "auto">; certain: boolean } {
  let sawFirstOver12 = false;
  let sawSecondOver12 = false;
  for (const raw of samples) {
    const parts = (raw ?? "").split(/[/\-.]/).map((x) => x.trim());
    if (parts.length !== 3) continue;
    if (parts[0].length === 4) return { order: "ymd", certain: true };
    const a = Number(parts[0]);
    const b = Number(parts[1]);
    if (Number.isFinite(a) && a > 12) sawFirstOver12 = true;
    if (Number.isFinite(b) && b > 12) sawSecondOver12 = true;
  }
  if (sawFirstOver12 && !sawSecondOver12) return { order: "dmy", certain: true };
  if (sawSecondOver12 && !sawFirstOver12) return { order: "mdy", certain: true };
  return { order: "dmy", certain: false };
}

function isoDate(raw: string, order: Exclude<DateOrder, "auto">): string | null {
  const parts = (raw ?? "").split(/[/\-.]/).map((p) => p.trim());
  if (parts.length !== 3) return null;

  let y: string, m: string, d: string;
  if (parts[0].length === 4) [y, m, d] = parts;
  else if (order === "mdy") [m, d, y] = parts;
  else [d, m, y] = parts;
  if (y.length === 2) y = `20${y}`;

  const yn = Number(y), mn = Number(m), dn = Number(d);
  if (!Number.isFinite(yn) || !Number.isFinite(mn) || !Number.isFinite(dn)) return null;
  // Shape alone is not enough: the old version happily produced
  // "2026-13-45", which matches the regex and is not a date. Round-tripping
  // through Date is what catches a month of 13, a day of 45, and 31 February.
  const probe = new Date(Date.UTC(yn, mn - 1, dn));
  if (
    probe.getUTCFullYear() !== yn ||
    probe.getUTCMonth() !== mn - 1 ||
    probe.getUTCDate() !== dn
  ) {
    return null;
  }
  return `${String(yn).padStart(4, "0")}-${String(mn).padStart(2, "0")}-${String(dn).padStart(2, "0")}`;
}

function mapRows(
  dataRows: string[][],
  mapping: Record<number, ColumnRole>,
  dateOrder: Exclude<DateOrder, "auto">,
): ParsedTxn[] {
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
      // Some banks write the debit column already negative. Subtracting a
      // negative flipped the sign, so a payment out became money in.
      // Magnitude is the only thing a debit column reliably carries; the
      // column itself is the direction.
      amount = c - Math.abs(d);
    }
    const rawRef = refI !== undefined ? (r[Number(refI)] ?? "").trim() : "";
    return {
      date: dateI !== undefined ? isoDate(r[Number(dateI)] ?? "", dateOrder) : null,
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
  const [dateOrder, setDateOrder] = useState<DateOrder>("auto");
  const [pending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const accountLabel = useMemo(
    () => account.account_name || account.bank_name || "Bank account",
    [account.account_name, account.bank_name],
  );

  // What "Work it out" resolves to, and whether the file actually said so.
  const sniffed = useMemo(() => {
    if (!rows) return { order: "dmy" as const, certain: false };
    const dateI = Object.entries(mapping).find(([, r]) => r === "date")?.[0];
    if (dateI === undefined) return { order: "dmy" as const, certain: false };
    return sniffDateOrder(rows.map((r) => r[Number(dateI)] ?? ""));
  }, [rows, mapping]);

  const effectiveDateOrder = dateOrder === "auto" ? sniffed.order : dateOrder;

  const txns: ParsedTxn[] = useMemo(
    () => (rows ? mapRows(rows, mapping, effectiveDateOrder) : []),
    [rows, mapping, effectiveDateOrder],
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

  const unreadable = txns.filter((t) => t.date === null || t.amount === null).length;

  // Why Confirm is off. It used to just be disabled, which leaves the
  // manager comparing their columns against a button that will not tell
  // them anything.
  const blocker = !hasDate
    ? "Point one column at the date."
    : !hasDesc
      ? "Point one column at the description."
      : !amountConfigValid
        ? hasAmount && (hasCredit || hasDebit)
          ? "Use either a single Amount column, or a Money in and Money out pair, not both."
          : "Point one column at the amount, or map both Money in and Money out."
        : null;

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
      // Say what was skipped as well as what landed. A silent "Imported 0"
      // after uploading a file full of transactions is the manager's
      // problem to work out; naming duplicates and unreadable rows tells
      // them nothing is wrong, or exactly what is.
      const parts = [
        `Imported ${res.inserted ?? 0} transaction${res.inserted === 1 ? "" : "s"}`,
      ];
      if (res.duplicates) parts.push(`${res.duplicates} already here`);
      if (res.unreadable) parts.push(`${res.unreadable} couldn't be read`);
      toast.success(parts.join(" · "));
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
            {/* sr-only: the dialog needs a description for screen readers,
                but printing the account name back at the manager who just
                clicked Import on it is noise, and account names are often
                the plan number and the company, which reads as debris. */}
            <DialogDescription className="sr-only">
              Upload a CSV of transactions for {accountLabel}.
            </DialogDescription>
          </DialogHeader>
          {/* A drop zone, not a button. The file is already in front of the
              manager in their downloads folder, and dragging it here is one
              gesture where the button was three (click, find, open). The
              zone is still clickable, so the file dialog remains available
              for anyone who prefers it. */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                fileInputRef.current?.click();
              }
            }}
            onDragEnter={(e) => { e.preventDefault(); setDragging(true); }}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={(e) => {
              // Only when the pointer has actually left the zone, not when
              // it crosses onto a child element.
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const f = e.dataTransfer.files?.[0];
              if (f) void handleFile(f);
            }}
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-12 text-center transition-colors",
              dragging
                ? "border-primary bg-primary/5"
                : "border-border bg-card hover:border-primary/50 hover:bg-muted",
            )}
          >
            <Upload className={cn("h-8 w-8", dragging ? "text-primary" : "text-muted-foreground")} />
            <p className="text-sm font-medium text-foreground">Drop your CSV here</p>
            <p className="text-xs text-muted-foreground">or click to choose a file</p>
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
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm text-muted-foreground">
              {rows.length} transaction{rows.length === 1 ? "" : "s"} read
            </span>
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
                            <SelectValue>{COLUMN_ROLE_LABEL[mapping[i] ?? "ignore"]}</SelectValue>
                          </SelectTrigger>
                          <SelectContent alignItemWithTrigger={false}>
                            {COLUMN_ROLE_OPTIONS.map((o) => (
                              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {/* The date format lives in the DATE column, under
                            the control that made it a date column. It used
                            to sit in the page header, away from the thing it
                            describes and visible even when no date was
                            mapped: 03/04/2026 is a different day depending
                            on who exported the file, and the place to say
                            which is the column it is in. */}
                        {mapping[i] === "date" && (
                          <div className="mt-1.5 space-y-1">
                            <Select
                              value={dateOrder}
                              onValueChange={(v) => setDateOrder((v as DateOrder) ?? "auto")}
                            >
                              <SelectTrigger className="h-7 w-full text-[11px]">
                                <SelectValue>{DATE_ORDER_LABEL[dateOrder]}</SelectValue>
                              </SelectTrigger>
                              <SelectContent alignItemWithTrigger={false}>
                                {(Object.keys(DATE_ORDER_LABEL) as DateOrder[]).map((k) => (
                                  <SelectItem key={k} value={k}>{DATE_ORDER_LABEL[k]}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {dateOrder === "auto" && (
                              <span
                                className={cn(
                                  "flex items-center gap-1 text-[11px]",
                                  sniffed.certain ? "text-muted-foreground" : "text-warning",
                                )}
                              >
                                {!sniffed.certain && <AlertTriangle className="h-3 w-3 shrink-0" />}
                                {sniffed.certain
                                  ? DATE_ORDER_LABEL[sniffed.order]
                                  : `Reading as ${sniffed.order === "mdy" ? "month" : "day"} first`}
                              </span>
                            )}
                          </div>
                        )}
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

      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border px-6 py-3">
        {blocker && (
          <p className="mr-auto text-sm text-muted-foreground">{blocker}</p>
        )}
        {!blocker && unreadable > 0 && (
          // Almost always the date order. Saying so here, next to the
          // control that fixes it, beats finding out from a toast after
          // the import that most of the file was dropped.
          <p className="mr-auto inline-flex items-center gap-1.5 text-sm text-warning">
            <AlertTriangle className="h-4 w-4" />
            {unreadable} of {txns.length} rows have no readable date or amount.
            {" "}Check the date format above.
          </p>
        )}
        <Button onClick={handleConfirm} disabled={pending || !canConfirm} loading={pending}>
          Confirm import
        </Button>
      </div>
    </div>
  );
}
