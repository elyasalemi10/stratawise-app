"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NumberInput } from "@/components/ui/number-input";
import { DatePicker } from "@/components/shared/date-picker";
import {
  Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList,
} from "@/components/ui/combobox";
import {
  Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  previewSpecialLevy,
  createLevyBatch,
} from "@/lib/actions/levy";
import { useOCCode } from "@/lib/oc-context";

interface CoaOption {
  id: string;
  code: string;
  name: string;
}

type FundType = "administrative" | "capital_works" | "maintenance_plan";

interface PreviewLot {
  lot_id: string;
  lot_number: number;
  unit_number: string | null;
  owner_display_name: string | null;
  liability: number;
  share: number;
}

const FUND_LABEL: Record<FundType, string> = {
  administrative: "Administrative Fund",
  capital_works: "Capital Works Fund",
  maintenance_plan: "Maintenance Plan Fund",
};

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n);

interface LineItem {
  coa_account_id: string | null;
  description: string;
  amount: string;
}

interface PerLotAdjustment {
  coa_account_id: string | null;
  description: string;
  amount: string;
}

// Special-levy wizard:
//   1. Manager enters purpose + period + due date + fund
//      , fund options filtered to funds the OC actually has.
//   2. Adds CoA-backed line items (combobox), each with $ amount.
//   3. Hits "Calculate apportionment" , server splits by lot liability.
//   4. Per-lot share is READ-ONLY. Manager can add EXTRA CoA-backed
//      adjustments to a lot to INCREASE that lot's total (matches
//      regular levy flow).
//   5. "Create special levy" persists the batch + redirects.
//
// Validation: every required field flips its border red on a failed
// submit attempt; field-level state clears on the next edit. Period
// end can never be before period start.
export function SpecialLevyForm({
  ocId,
  coaOptions,
  availableFunds,
  onBack,
}: {
  ocId: string;
  coaOptions: CoaOption[];
  availableFunds: FundType[];
  onBack: () => void;
}) {
  const ocCode = useOCCode();
  const router = useRouter();

  const [purpose, setPurpose] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [dueDate, setDueDate] = useState("");
  // Fund defaults to the first available fund the OC actually has.
  const [fundType, setFundType] = useState<FundType>(availableFunds[0] ?? "capital_works");

  const [items, setItems] = useState<LineItem[]>([{ coa_account_id: null, description: "", amount: "" }]);

  const [lots, setLots] = useState<PreviewLot[] | null>(null);
  // Per-lot extra adjustments , map<lotId, list>. Each extra adds to
  // the locked apportioned share.
  const [extras, setExtras] = useState<Record<string, PerLotAdjustment[]>>({});

  const [calculating, startCalculating] = useTransition();
  const [creating, setCreating] = useState(false);

  // Submit-only validation flags. Each field defaults to false; flips
  // true if invalid when the user tries to advance; clears on edit.
  const [invalid, setInvalid] = useState<{
    purpose?: boolean;
    fund?: boolean;
    periodStart?: boolean;
    periodEnd?: boolean;
    dueDate?: boolean;
    items?: boolean;
  }>({});

  const totalCharge = items.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);

  function addLine() {
    setItems((p) => [...p, { coa_account_id: null, description: "", amount: "" }]);
  }
  function removeLine(i: number) {
    setItems((p) => p.filter((_, idx) => idx !== i));
  }
  function updateLineCoa(i: number, accountId: string) {
    const coa = coaOptions.find((c) => c.id === accountId);
    setItems((p) =>
      p.map((row, idx) =>
        idx !== i
          ? row
          : { ...row, coa_account_id: coa?.id ?? null, description: coa?.name ?? "" },
      ),
    );
    setInvalid((v) => ({ ...v, items: false }));
  }
  function updateLineAmount(i: number, value: string) {
    setItems((p) => p.map((row, idx) => (idx === i ? { ...row, amount: value } : row)));
    setInvalid((v) => ({ ...v, items: false }));
  }

  async function handleCalculate() {
    // Validate fields BEFORE firing , collect every problem so the
    // manager sees ALL red borders, not just the first.
    const problems: string[] = [];
    const next: typeof invalid = {};
    if (!purpose.trim()) { next.purpose = true; problems.push("purpose"); }
    if (!availableFunds.includes(fundType)) { next.fund = true; problems.push("fund"); }
    if (!periodStart) { next.periodStart = true; problems.push("period start"); }
    if (!periodEnd) { next.periodEnd = true; problems.push("period end"); }
    if (periodStart && periodEnd && periodEnd < periodStart) { next.periodEnd = true; problems.push("period end can't be before period start"); }
    if (!dueDate) { next.dueDate = true; problems.push("due date"); }
    const hasValidItem = items.some((i) => i.coa_account_id && (parseFloat(i.amount) || 0) > 0);
    if (!hasValidItem) { next.items = true; problems.push("at least one line item"); }
    setInvalid(next);
    if (problems.length) {
      toast.error(problems.length === 1 ? `Fill in the ${problems[0]} field.` : "Fix the highlighted fields.");
      return;
    }

    startCalculating(async () => {
      const res = await previewSpecialLevy(ocId, totalCharge);
      if (res.error || !res.data) {
        toast.error(res.error ?? "Could not apportion the special levy.");
        return;
      }
      setLots(res.data.lots);
      setExtras({});
    });
  }

  // ── Per-lot adjustments (extras) ───────────────────────────
  function addExtra(lotId: string) {
    setExtras((p) => ({ ...p, [lotId]: [...(p[lotId] ?? []), { coa_account_id: null, description: "", amount: "" }] }));
  }
  function removeExtra(lotId: string, idx: number) {
    setExtras((p) => ({ ...p, [lotId]: (p[lotId] ?? []).filter((_, i) => i !== idx) }));
  }
  function updateExtraCoa(lotId: string, idx: number, accountId: string) {
    const coa = coaOptions.find((c) => c.id === accountId);
    setExtras((p) => ({
      ...p,
      [lotId]: (p[lotId] ?? []).map((row, i) =>
        i !== idx ? row : { ...row, coa_account_id: coa?.id ?? null, description: coa?.name ?? "" },
      ),
    }));
  }
  function updateExtraAmount(lotId: string, idx: number, v: string) {
    setExtras((p) => ({
      ...p,
      [lotId]: (p[lotId] ?? []).map((row, i) => (i !== idx ? row : { ...row, amount: v })),
    }));
  }

  function lotExtraTotal(lotId: string): number {
    return (extras[lotId] ?? []).reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
  }
  function lotGrandTotal(l: PreviewLot): number {
    return l.share + lotExtraTotal(l.lot_id);
  }

  async function handleCreate() {
    if (!lots) return;
    setCreating(true);
    const cleanItems = items.filter((i) => i.coa_account_id && (parseFloat(i.amount) || 0) > 0);

    const lotPayloads = lots.map((l) => {
      const proportion = totalCharge > 0 ? l.share / totalCharge : 0;
      const baseLines = cleanItems.map((it) => {
        const itemTotal = parseFloat(it.amount) || 0;
        const share = Math.round(itemTotal * proportion * 100) / 100;
        return {
          description: it.description,
          amount: share,
          coa_account_id: it.coa_account_id,
          budget_item_id: null,
          is_adjustment: false,
        };
      });
      const extraLines = (extras[l.lot_id] ?? [])
        .filter((e) => e.coa_account_id && (parseFloat(e.amount) || 0) > 0)
        .map((e) => ({
          description: e.description,
          amount: parseFloat(e.amount) || 0,
          coa_account_id: e.coa_account_id,
          budget_item_id: null,
          is_adjustment: true,
        }));
      const allLines = [...baseLines, ...extraLines];
      return {
        lot_id: l.lot_id,
        amount: Math.round(allLines.reduce((s, x) => s + x.amount, 0) * 100) / 100,
        items: allLines,
      };
    });

    const startYear = new Date(periodStart).getFullYear();
    const fy = `${startYear}-${startYear + 1}`;

    const res = await createLevyBatch(ocId, {
      budget_id: null,
      financial_year: fy,
      fund_type: fundType,
      period_label: `Special: ${purpose.slice(0, 40)}`,
      period_start: periodStart,
      period_end: periodEnd,
      due_date: dueDate,
      lots: lotPayloads,
      is_special: true,
      special_purpose: purpose,
    });
    if (res.error) {
      setCreating(false);
      toast.error(res.error);
      return;
    }
    toast.success("Special levy created");
    router.push(`/ocs/${ocCode}/levies/${res.batchId}`);
  }

  const fundItems = availableFunds.map((f) => ({ value: f, label: FUND_LABEL[f] }));

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-5 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">Special levy</span>
            <Button variant="secondary" size="sm" onClick={onBack} disabled={creating || calculating}>
              Change levy kind
            </Button>
          </div>

          <div className="space-y-1.5">
            <Label>Purpose <span className="text-destructive">*</span></Label>
            <Input
              value={purpose}
              onChange={(e) => { setPurpose(e.target.value); setInvalid((v) => ({ ...v, purpose: false })); }}
              placeholder="Reason for this special levy"
              aria-invalid={invalid.purpose || undefined}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Fund <span className="text-destructive">*</span></Label>
              <Combobox
                items={fundItems}
                value={fundType}
                onValueChange={(v) => { setFundType(v as FundType); setInvalid((iv) => ({ ...iv, fund: false })); }}
              >
                <ComboboxInput
                  placeholder="Pick a fund"
                  className={invalid.fund ? "border-destructive" : undefined}
                />
                <ComboboxContent>
                  <ComboboxEmpty>No funds available.</ComboboxEmpty>
                  <ComboboxList>
                    {(item: { value: string; label: string }) => (
                      <ComboboxItem key={item.value} value={item.value}>
                        {item.label}
                      </ComboboxItem>
                    )}
                  </ComboboxList>
                </ComboboxContent>
              </Combobox>
            </div>
            <div className="space-y-1.5">
              <Label>Due date <span className="text-destructive">*</span></Label>
              <DatePicker
                value={dueDate}
                onChange={(v) => { setDueDate(v); setInvalid((iv) => ({ ...iv, dueDate: false })); }}
                invalid={invalid.dueDate}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Period start <span className="text-destructive">*</span></Label>
              <DatePicker
                value={periodStart}
                onChange={(v) => { setPeriodStart(v); setInvalid((iv) => ({ ...iv, periodStart: false, periodEnd: false })); }}
                invalid={invalid.periodStart}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Period end <span className="text-destructive">*</span></Label>
              <DatePicker
                value={periodEnd}
                onChange={(v) => { setPeriodEnd(v); setInvalid((iv) => ({ ...iv, periodEnd: false })); }}
                invalid={invalid.periodEnd}
                minDate={periodStart || undefined}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5 space-y-3">
          <div className="flex items-center justify-between">
            <Label>Line items <span className="text-destructive">*</span></Label>
            <Button variant="secondary" size="sm" onClick={addLine}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Add line
            </Button>
          </div>
          <div className="overflow-hidden rounded-md border border-border">
            <Table variant="bordered" className="text-xs">
              <TableHeader>
                <TableRow>
                  <TableHead className="py-1">Account</TableHead>
                  <TableHead className="py-1 w-[160px] text-right">Amount</TableHead>
                  <TableHead className="py-1 w-[36px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((it, i) => (
                  <TableRow key={i}>
                    <TableCell className="py-1">
                      <Combobox
                        items={coaOptions}
                        value={it.coa_account_id ?? ""}
                        onValueChange={(v) => updateLineCoa(i, v)}
                      >
                        <ComboboxInput
                          placeholder="Select an account"
                          className={invalid.items && !it.coa_account_id ? "border-destructive" : undefined}
                        />
                        <ComboboxContent>
                          <ComboboxEmpty>No accounts found.</ComboboxEmpty>
                          <ComboboxList>
                            {(c: CoaOption) => (
                              <ComboboxItem key={c.id} value={c.id}>
                                {c.name}
                              </ComboboxItem>
                            )}
                          </ComboboxList>
                        </ComboboxContent>
                      </Combobox>
                    </TableCell>
                    <TableCell className="py-1">
                      <NumberInput
                        value={it.amount}
                        onChange={(v) => updateLineAmount(i, v)}
                        thousandsSeparator
                        prefix="$"
                        placeholder="Amount"
                        allowDecimal
                        invalid={invalid.items && !(parseFloat(it.amount) || 0)}
                      />
                    </TableCell>
                    <TableCell className="py-1">
                      <button
                        type="button"
                        onClick={() => removeLine(i)}
                        aria-label="Remove line"
                        className="text-muted-foreground hover:text-destructive cursor-pointer"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell className="py-1 font-semibold">Total to raise</TableCell>
                  <TableCell className="py-1 text-right font-bold tabular-nums">{formatCurrency(totalCharge)}</TableCell>
                  <TableCell />
                </TableRow>
              </TableFooter>
            </Table>
          </div>

          <div className="flex justify-end">
            <Button onClick={handleCalculate} disabled={calculating || totalCharge <= 0}>
              {calculating && <Loader2 className="size-4 animate-spin" />}
              Calculate per-lot apportionment
            </Button>
          </div>
        </CardContent>
      </Card>

      {lots && lots.length > 0 && (
        <Card>
          <CardContent className="pt-5 space-y-3">
            <Label>Per-lot apportionment</Label>
            <div className="overflow-hidden rounded-md border border-border">
              <Table variant="bordered" className="text-[11px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="py-0.5">Lot</TableHead>
                    <TableHead className="py-0.5">Owner</TableHead>
                    <TableHead className="py-0.5 w-[100px] text-right">Liability</TableHead>
                    <TableHead className="py-0.5 w-[120px] text-right">Apportioned</TableHead>
                    <TableHead className="py-0.5 w-[140px] text-right">Total</TableHead>
                    <TableHead className="py-0.5 w-[36px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lots.map((l) => {
                    const lotExtras = extras[l.lot_id] ?? [];
                    return (
                      <>
                        <TableRow key={l.lot_id}>
                          <TableCell className="py-0.5">
                            Lot {l.lot_number}{l.unit_number ? ` (Unit ${l.unit_number})` : ""}
                          </TableCell>
                          <TableCell className="py-0.5 text-muted-foreground">
                            {l.owner_display_name ?? ""}
                          </TableCell>
                          <TableCell className="py-0.5 text-right tabular-nums">
                            {Number(l.liability).toString()}
                          </TableCell>
                          <TableCell className="py-0.5 text-right tabular-nums text-muted-foreground">
                            {formatCurrency(l.share)}
                          </TableCell>
                          <TableCell className="py-0.5 text-right tabular-nums font-medium">
                            {formatCurrency(lotGrandTotal(l))}
                          </TableCell>
                          <TableCell className="py-0.5 text-right">
                            <button
                              type="button"
                              onClick={() => addExtra(l.lot_id)}
                              className="text-muted-foreground hover:text-foreground cursor-pointer"
                              title="Add adjustment to this lot"
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </button>
                          </TableCell>
                        </TableRow>
                        {lotExtras.map((adj, ei) => (
                          <TableRow key={`${l.lot_id}-x-${ei}`} className="bg-muted/30">
                            <TableCell className="py-0.5 pl-6 text-muted-foreground">+ Adjustment</TableCell>
                            <TableCell className="py-0.5" colSpan={2}>
                              <Combobox
                                items={coaOptions}
                                value={adj.coa_account_id ?? ""}
                                onValueChange={(v) => updateExtraCoa(l.lot_id, ei, v)}
                              >
                                <ComboboxInput placeholder="Select an account" />
                                <ComboboxContent>
                                  <ComboboxEmpty>No accounts found.</ComboboxEmpty>
                                  <ComboboxList>
                                    {(c: CoaOption) => (
                                      <ComboboxItem key={c.id} value={c.id}>{c.name}</ComboboxItem>
                                    )}
                                  </ComboboxList>
                                </ComboboxContent>
                              </Combobox>
                            </TableCell>
                            <TableCell className="py-0.5" colSpan={2}>
                              <NumberInput
                                value={adj.amount}
                                onChange={(v) => updateExtraAmount(l.lot_id, ei, v)}
                                thousandsSeparator
                                prefix="$"
                                placeholder="Amount"
                                allowDecimal
                              />
                            </TableCell>
                            <TableCell className="py-0.5 text-right">
                              <button
                                type="button"
                                onClick={() => removeExtra(l.lot_id, ei)}
                                aria-label="Remove adjustment"
                                className="text-muted-foreground hover:text-destructive cursor-pointer"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </>
                    );
                  })}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={4} className="py-0.5 font-semibold">Grand total</TableCell>
                    <TableCell className="py-0.5 text-right font-bold tabular-nums">
                      {formatCurrency(lots.reduce((s, l) => s + lotGrandTotal(l), 0))}
                    </TableCell>
                    <TableCell />
                  </TableRow>
                </TableFooter>
              </Table>
            </div>

            <div className="flex justify-end">
              <Button onClick={handleCreate} disabled={creating} size="lg">
                {creating && <Loader2 className="mr-2 size-4 animate-spin" />}
                Create special levy
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
