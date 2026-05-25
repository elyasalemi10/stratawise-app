"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Plus, X, Loader2 } from "lucide-react";
import { formatDayMonthShort } from "@/lib/utils";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/shared/date-picker";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  generateLevyPreview,
  createLevyBatch,
  getAvailablePeriods,
  type LevyPreviewData,
  type LevyPreviewLot,
  type AvailablePeriod,
} from "@/lib/actions/levy";
import type { BudgetWithItems } from "@/lib/actions/budget";
import { useOCCode } from "@/lib/oc-context";

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n);

const FUND_LABEL: Record<string, string> = {
  administrative: "Administrative Fund",
  capital_works: "Capital Works Fund",
  maintenance_plan: "Maintenance Plan Fund",
};

function budgetDisplayLabel(b: BudgetWithItems): string {
  return `${FUND_LABEL[b.fund_type] ?? b.fund_type}, ${b.financial_year} (${formatCurrency(b.total_amount)})`;
}

// Period chip: "Q1 1 Jul - 30 Jun" , quarter/half/annual label plus the
// day+month range, no year noise. The selected value renders the same way so
// the trigger never falls back to the raw enum index.
function periodChipLabel(p: AvailablePeriod): string {
  return `${p.label} ${formatDayMonthShort(p.start)} - ${formatDayMonthShort(p.end)}`;
}

// ─── Lot Accordion Row ─────────────────────────────────────

function LotRow({
  lot,
  isOpen,
  onToggle,
  onUpdateItem,
  onAddItem,
  onRemoveItem,
  locked,
}: {
  lot: LevyPreviewLot & { adjustments?: { description: string; amount: number }[] };
  isOpen: boolean;
  onToggle: () => void;
  onUpdateItem: (itemIndex: number, field: "description" | "amount", value: string | number) => void;
  onAddItem: () => void;
  onRemoveItem: (itemIndex: number) => void;
  /** When true (the batch is being created) the row is read-only , no
   *  adjustments, no amount edits, no add/remove. */
  locked: boolean;
}) {
  const allItems = [
    ...lot.items.map((item) => ({ ...item, is_adjustment: false })),
    ...(lot.adjustments ?? []).map((item) => ({ ...item, budget_item_id: null, is_adjustment: true })),
  ];
  const totalAmount = allItems.reduce((sum, item) => sum + item.amount, 0);

  return (
    <div className="border-t border-border/50 first:border-t-0">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between px-4 py-3 text-sm hover:bg-muted/30 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-3">
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
          <div className="text-left">
            <span className="font-medium text-foreground">
              Lot {lot.lot_number}
              {lot.unit_number ? ` (Unit ${lot.unit_number})` : ""}
            </span>
            <span className="ml-2 text-muted-foreground">
              {lot.owner_display_name ?? "Unassigned"}
            </span>
          </div>
        </div>
        <span className="font-semibold tabular-nums text-foreground">{formatCurrency(totalAmount)}</span>
      </button>

      {isOpen && (
        <div className="px-4 pb-3 pl-11">
          <div className="rounded-md border border-border bg-card">
            <table className="w-full text-sm table-fixed">
              <thead>
                <tr className="text-xs text-muted-foreground border-b border-border/50">
                  <th className="px-3 py-2 text-left w-auto">Description</th>
                  <th className="px-3 py-2 text-right w-[140px]">Amount</th>
                  <th className="px-3 py-2 w-[32px]"></th>
                </tr>
              </thead>
              <tbody>
                {allItems.map((item, i) => (
                  <tr key={i} className="border-t border-border/50 first:border-t-0">
                    <td className="px-3 py-1.5">
                      {item.is_adjustment ? (
                        <Input
                          value={item.description}
                          onChange={(e) => onUpdateItem(i, "description", e.target.value)}
                          className="h-7 text-sm"
                          placeholder="Description"
                          disabled={locked}
                        />
                      ) : (
                        <span className="text-foreground">{item.description}</span>
                      )}
                    </td>
                    <td className="px-3 py-1.5">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={item.amount || ""}
                        onChange={(e) => {
                          const raw = e.target.value;
                          if (raw === "" || raw === "-" || /^-?\d*\.?\d{0,2}$/.test(raw)) {
                            onUpdateItem(i, "amount", Number(raw) || 0);
                          }
                        }}
                        disabled={locked}
                        className="h-7 w-full rounded-md border border-border bg-background px-2 text-sm text-right tabular-nums outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-60 disabled:cursor-not-allowed"
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      {item.is_adjustment && !locked && (
                        <button
                          type="button"
                          onClick={() => onRemoveItem(i)}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-foreground/20">
                  <td className="px-3 py-2 font-medium text-foreground">Total</td>
                  <td className="px-3 py-2 font-semibold text-right tabular-nums text-foreground">{formatCurrency(totalAmount)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
          {!locked && (
            <button
              type="button"
              onClick={onAddItem}
              className="flex items-center gap-1 mt-2 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <Plus className="h-3 w-3" />
              Add adjustment
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Form ─────────────────────────────────────────────

interface AdjustedLot extends LevyPreviewLot {
  adjustments: { description: string; amount: number }[];
}

export function GenerateLeviesForm({
  ocId,
  budgets,
}: {
  ocId: string;
  budgets: BudgetWithItems[];
}) {
  const ocCode = useOCCode();
  const router = useRouter();
  const [selectedBudgetId, setSelectedBudgetId] = useState<string>("");
  const [availablePeriods, setAvailablePeriods] = useState<AvailablePeriod[]>([]);
  const [selectedPeriodIndex, setSelectedPeriodIndex] = useState<string>("");
  const [preview, setPreview] = useState<LevyPreviewData | null>(null);
  const [lots, setLots] = useState<AdjustedLot[]>([]);
  // YYYY-MM-DD strings , matches the DatePicker's signature and skips a
  // Date↔string round-trip when we POST the batch.
  const [dueDate, setDueDate] = useState<string>("");
  const [periodStart, setPeriodStart] = useState<string>("");
  const [periodEnd, setPeriodEnd] = useState<string>("");
  const [loadingPeriods, setLoadingPeriods] = useState(false);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [openLotId, setOpenLotId] = useState<string | null>(null);

  const selectedBudget = budgets.find((b) => b.id === selectedBudgetId);
  const ungenPeriods = availablePeriods.filter((p) => !p.already_generated);
  const selectedPeriod = ungenPeriods.find((p) => String(p.periodIndex) === selectedPeriodIndex);

  async function handleBudgetSelect(budgetId: string) {
    if (generating) return;
    setSelectedBudgetId(budgetId);
    setSelectedPeriodIndex("");
    setAvailablePeriods([]);
    setPreview(null);
    setLots([]);
    setOpenLotId(null);
    setPeriodStart("");
    setPeriodEnd("");
    setDueDate("");

    if (!budgetId) return;

    setLoadingPeriods(true);
    const periods = await getAvailablePeriods(ocId, budgetId);
    setAvailablePeriods(periods);
    setLoadingPeriods(false);
  }

  async function handlePeriodSelect(periodIdx: string) {
    if (generating) return;
    setSelectedPeriodIndex(periodIdx);
    setPreview(null);
    setLots([]);

    if (!periodIdx || !selectedBudgetId) return;

    setLoading(true);
    const result = await generateLevyPreview(ocId, selectedBudgetId, parseInt(periodIdx));
    setLoading(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }

    if (result.data) {
      setPreview(result.data);
      setPeriodStart(result.data.period_start);
      setPeriodEnd(result.data.period_end);
      setDueDate(result.data.due_date);
      setLots(result.data.lots.map((lot) => ({ ...lot, adjustments: [] })));
    }
  }

  const updateItem = useCallback((lotId: string, itemIndex: number, field: "description" | "amount", value: string | number) => {
    setLots((prev) =>
      prev.map((lot) => {
        if (lot.lot_id !== lotId) return lot;
        const baseCount = lot.items.length;
        if (itemIndex < baseCount) {
          const newItems = [...lot.items];
          if (field === "amount") {
            newItems[itemIndex] = { ...newItems[itemIndex], amount: Number(value) || 0 };
          }
          return { ...lot, items: newItems };
        } else {
          const adjIndex = itemIndex - baseCount;
          const newAdj = [...lot.adjustments];
          if (field === "description") {
            newAdj[adjIndex] = { ...newAdj[adjIndex], description: String(value) };
          } else {
            newAdj[adjIndex] = { ...newAdj[adjIndex], amount: Number(value) || 0 };
          }
          return { ...lot, adjustments: newAdj };
        }
      })
    );
  }, []);

  const addAdjustment = useCallback((lotId: string) => {
    setLots((prev) =>
      prev.map((lot) =>
        lot.lot_id === lotId
          ? { ...lot, adjustments: [...lot.adjustments, { description: "", amount: 0 }] }
          : lot
      )
    );
  }, []);

  const removeItem = useCallback((lotId: string, itemIndex: number) => {
    setLots((prev) =>
      prev.map((lot) => {
        if (lot.lot_id !== lotId) return lot;
        const baseCount = lot.items.length;
        const adjIndex = itemIndex - baseCount;
        return { ...lot, adjustments: lot.adjustments.filter((_, i) => i !== adjIndex) };
      })
    );
  }, []);

  async function handleGenerate() {
    if (!preview) return;
    setGenerating(true);

    const result = await createLevyBatch(ocId, {
      budget_id: preview.budget_id,
      financial_year: preview.financial_year,
      fund_type: preview.fund_type,
      period_label: preview.period_label,
      period_start: periodStart || preview.period_start,
      period_end: periodEnd || preview.period_end,
      due_date: dueDate || preview.due_date,
      lots: lots.map((lot) => {
        const allItems = [
          ...lot.items.map((item) => ({ ...item, is_adjustment: false })),
          ...lot.adjustments.filter((a) => a.description && a.amount !== 0).map((a) => ({ ...a, budget_item_id: null, is_adjustment: true })),
        ];
        const totalAmount = allItems.reduce((sum, item) => sum + item.amount, 0);
        return {
          lot_id: lot.lot_id,
          amount: Math.round(totalAmount * 100) / 100,
          items: allItems,
        };
      }),
    });

    if (result.error) {
      setGenerating(false); // clear ONLY on error
      toast.error(result.error);
      return;
    }

    toast.success("Levies generated");
    router.push(`/ocs/${ocCode}/levies/${result.batchId}`);
  }

  const grandTotal = lots.reduce((sum, lot) => {
    const lotTotal = lot.items.reduce((s, i) => s + i.amount, 0) +
      lot.adjustments.reduce((s, a) => s + a.amount, 0);
    return sum + lotTotal;
  }, 0);

  return (
    <div className="space-y-6">
      {/* Budget selector */}
      <Card>
        <CardContent className="pt-5 space-y-4">
          <div className="space-y-1.5">
            <Label>Budget</Label>
            {budgets.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No approved budgets. Create and approve a budget first.
              </p>
            ) : (
              <Select
                value={selectedBudgetId}
                onValueChange={(v) => handleBudgetSelect(v ?? "")}
                disabled={generating}
              >
                <SelectTrigger className="w-full">
                  {/* Render the human label when a budget is selected so the
                      trigger doesn't fall back to the uuid value. */}
                  <SelectValue placeholder="Select a budget">
                    {selectedBudget ? budgetDisplayLabel(selectedBudget) : null}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {budgets.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {budgetDisplayLabel(b)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Period selector , the trigger renders the chip itself so the
              selected period isn't shown as the bare numeric index. */}
          {selectedBudgetId && availablePeriods.length > 0 && (
            <div className="space-y-1.5">
              <Label>Period</Label>
              {ungenPeriods.length === 0 ? (
                <p className="text-sm text-muted-foreground">All periods have been generated for this budget.</p>
              ) : (
                <Select
                  value={selectedPeriodIndex}
                  onValueChange={(v) => handlePeriodSelect(v ?? "")}
                  disabled={generating}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select a period">
                      {selectedPeriod ? periodChipLabel(selectedPeriod) : null}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {ungenPeriods.map((p) => (
                      <SelectItem key={p.periodIndex} value={String(p.periodIndex)}>
                        {periodChipLabel(p)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}
          {loadingPeriods && (
            <p className="text-sm text-muted-foreground">Loading periods...</p>
          )}

          {/* Period details , all three dates are editable. */}
          {preview && (
            <div className="grid grid-cols-1 gap-4 pt-2 border-t border-border sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Period start</Label>
                <DatePicker value={periodStart} onChange={setPeriodStart} disabled={generating} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Period end</Label>
                <DatePicker value={periodEnd} onChange={setPeriodEnd} disabled={generating} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Due date</Label>
                <DatePicker value={dueDate} onChange={setDueDate} disabled={generating} />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Loading state */}
      {loading && (
        <Card>
          <CardContent className="flex items-center justify-center py-12 gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Calculating levies...</p>
          </CardContent>
        </Card>
      )}

      {/* Preview table */}
      {preview && lots.length > 0 && !loading && (
        <>
          <Card>
            <CardContent className="pt-5">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <Label className="block">Levy breakdown by lot</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Click a row to view and adjust line items. {preview.period_amount > 0 && `Period amount: ${formatCurrency(preview.period_amount)}`}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Total</p>
                  <p className="text-lg font-bold tabular-nums text-foreground">{formatCurrency(grandTotal)}</p>
                </div>
              </div>

              <div className={`rounded-lg border border-border ${generating ? "pointer-events-none opacity-75" : ""}`}>
                {lots.map((lot) => (
                  <LotRow
                    key={lot.lot_id}
                    lot={lot}
                    isOpen={openLotId === lot.lot_id}
                    onToggle={() => setOpenLotId(openLotId === lot.lot_id ? null : lot.lot_id)}
                    onUpdateItem={(i, f, v) => updateItem(lot.lot_id, i, f, v)}
                    onAddItem={() => addAdjustment(lot.lot_id)}
                    onRemoveItem={(i) => removeItem(lot.lot_id, i)}
                    locked={generating}
                  />
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Generate button. Keep the spinner ON through the navigation so
              the page doesn't flicker between generating and the destination. */}
          <div className="flex justify-end">
            <Button onClick={handleGenerate} disabled={generating || grandTotal === 0} size="lg">
              {generating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                `Generate ${lots.length} levies`
              )}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
