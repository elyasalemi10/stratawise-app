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
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
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

interface PreviewLot {
  lot_id: string;
  lot_number: number;
  unit_number: string | null;
  owner_display_name: string | null;
  liability: number;
  share: number;
}

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n);

// Minimal special-levy wizard:
//   1. Manager enters purpose + period + due date + fund
//   2. Adds one or more CoA-backed line items with $ amounts
//   3. Hits "Calculate apportionment" , server splits the total by lot
//      liability and returns a per-lot preview
//   4. Manager tweaks per-lot amounts if needed
//   5. Hits "Create special levy batch" , server creates a special
//      batch (budget_id=null, is_special=true) and notices for every
//      lot, then redirects to the batch detail page
export function SpecialLevyForm({
  ocId,
  coaOptions,
  onBack,
}: {
  ocId: string;
  coaOptions: CoaOption[];
  onBack: () => void;
}) {
  const ocCode = useOCCode();
  const router = useRouter();

  const [purpose, setPurpose] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [fundType, setFundType] = useState<"administrative" | "capital_works" | "maintenance_plan">("capital_works");

  type LineItem = { coa_account_id: string | null; description: string; amount: string };
  const [items, setItems] = useState<LineItem[]>([{ coa_account_id: null, description: "", amount: "" }]);

  const [lots, setLots] = useState<PreviewLot[] | null>(null);
  const [calculating, startCalculating] = useTransition();
  const [creating, setCreating] = useState(false);

  const totalCharge = items.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);

  function addLine() {
    setItems((p) => [...p, { coa_account_id: null, description: "", amount: "" }]);
  }
  function removeLine(i: number) {
    setItems((p) => p.filter((_, idx) => idx !== i));
  }
  function updateLine(i: number, field: keyof LineItem, value: string) {
    setItems((p) =>
      p.map((row, idx) => {
        if (idx !== i) return row;
        if (field === "coa_account_id") {
          const coa = coaOptions.find((c) => c.id === value);
          return {
            ...row,
            coa_account_id: coa?.id ?? null,
            description: coa ? `${coa.code} , ${coa.name}` : "",
          };
        }
        if (field === "amount") return { ...row, amount: value };
        return row;
      }),
    );
  }

  async function handleCalculate() {
    if (totalCharge <= 0) {
      toast.error("Enter at least one line item with an amount.");
      return;
    }
    startCalculating(async () => {
      const res = await previewSpecialLevy(ocId, totalCharge);
      if (res.error || !res.data) {
        toast.error(res.error ?? "Could not apportion the special levy.");
        return;
      }
      setLots(res.data.lots);
    });
  }

  function updateLotShare(lotId: string, v: string) {
    setLots((prev) =>
      prev ? prev.map((l) => (l.lot_id === lotId ? { ...l, share: parseFloat(v) || 0 } : l)) : prev,
    );
  }

  async function handleCreate() {
    if (!lots) return;
    if (!purpose.trim()) { toast.error("Add a purpose for the special levy."); return; }
    if (!periodStart || !periodEnd || !dueDate) { toast.error("Pick the period and due date."); return; }
    setCreating(true);
    const cleanItems = items
      .filter((i) => i.coa_account_id && (parseFloat(i.amount) || 0) > 0);
    if (cleanItems.length === 0) {
      setCreating(false);
      toast.error("Each line item needs a CoA account and a non-zero amount.");
      return;
    }

    // Apportion each CoA line per-lot in proportion to the lot's overall
    // share of the total. Keeps the per-lot notice line itemised so the
    // owner sees "Window cleaning, $X" not just "Special levy, $X".
    const lotPayloads = lots.map((l) => {
      const proportion = l.share / totalCharge;
      const lotItems = cleanItems.map((it) => {
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
      return {
        lot_id: l.lot_id,
        amount: lotItems.reduce((s, i) => s + i.amount, 0),
        items: lotItems,
      };
    });

    // financial_year required by the batch row , use the period_start year
    // and "+ next FY" suffix so the column has a useful filter value.
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
            <Label>Purpose</Label>
            <Input value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="Reason for this special levy" />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Fund</Label>
              <Select value={fundType} onValueChange={(v) => setFundType(v as typeof fundType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="administrative">Administrative Fund</SelectItem>
                  <SelectItem value="capital_works">Capital Works Fund</SelectItem>
                  <SelectItem value="maintenance_plan">Maintenance Plan Fund</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Due date</Label>
              <DatePicker value={dueDate} onChange={setDueDate} />
            </div>
            <div className="space-y-1.5">
              <Label>Period start</Label>
              <DatePicker value={periodStart} onChange={setPeriodStart} />
            </div>
            <div className="space-y-1.5">
              <Label>Period end</Label>
              <DatePicker value={periodEnd} onChange={setPeriodEnd} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5 space-y-3">
          <div className="flex items-center justify-between">
            <Label>Line items</Label>
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
                  <TableHead className="py-1 w-[140px] text-right">Amount</TableHead>
                  <TableHead className="py-1 w-[36px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((it, i) => (
                  <TableRow key={i}>
                    <TableCell className="py-1">
                      <Select
                        value={it.coa_account_id ?? ""}
                        onValueChange={(v) => updateLine(i, "coa_account_id", v ?? "")}
                      >
                        <SelectTrigger className="h-7 text-xs">
                          <SelectValue placeholder="Pick a CoA account">
                            {it.description || null}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {coaOptions.length === 0 ? (
                            <div className="px-2 py-1.5 text-xs text-muted-foreground">No CoA accounts available</div>
                          ) : (
                            coaOptions.map((c) => (
                              <SelectItem key={c.id} value={c.id}>{c.code} , {c.name}</SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="py-1">
                      <NumberInput
                        value={it.amount}
                        onChange={(v) => updateLine(i, "amount", v)}
                        thousandsSeparator
                        prefix="$"
                        placeholder="Amount"
                        allowDecimal
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
                    <TableHead className="py-0.5 w-[140px] text-right">Share</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lots.map((l) => (
                    <TableRow key={l.lot_id}>
                      <TableCell className="py-0.5">
                        Lot {l.lot_number}{l.unit_number ? ` (Unit ${l.unit_number})` : ""}
                      </TableCell>
                      <TableCell className="py-0.5 text-muted-foreground">
                        {l.owner_display_name ?? "Unassigned"}
                      </TableCell>
                      <TableCell className="py-0.5 text-right tabular-nums">{l.liability.toFixed(4)}</TableCell>
                      <TableCell className="py-0.5 text-right">
                        <NumberInput
                          value={String(l.share)}
                          onChange={(v) => updateLotShare(l.lot_id, v)}
                          thousandsSeparator
                          prefix="$"
                          allowDecimal
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={3} className="py-0.5 font-semibold">Apportioned total</TableCell>
                    <TableCell className="py-0.5 text-right font-bold tabular-nums">
                      {formatCurrency(lots.reduce((s, l) => s + l.share, 0))}
                    </TableCell>
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
