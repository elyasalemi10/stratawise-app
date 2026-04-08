"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Plus, X, Loader2, CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { formatDateLong } from "@/lib/utils";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import {
  generateLevyPreview,
  createLevyBatch,
  type LevyPreviewData,
  type LevyPreviewLot,
} from "@/lib/actions/levy";
import type { BudgetWithItems } from "@/lib/actions/budget";

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n);

// ─── Lot Accordion Row ─────────────────────────────────────

function LotRow({
  lot,
  isOpen,
  onToggle,
  onUpdateItem,
  onAddItem,
  onRemoveItem,
}: {
  lot: LevyPreviewLot & { adjustments?: { description: string; amount: number }[] };
  isOpen: boolean;
  onToggle: () => void;
  onUpdateItem: (itemIndex: number, field: "description" | "amount", value: string | number) => void;
  onAddItem: () => void;
  onRemoveItem: (itemIndex: number) => void;
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
              {lot.owner_name ?? "Unassigned"}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs text-muted-foreground">
            {lot.lot_entitlement} UE · {(lot.proportion * 100).toFixed(1)}%
          </span>
          <span className="font-semibold tabular-nums text-foreground">{formatCurrency(totalAmount)}</span>
        </div>
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
                        className="h-7 w-full rounded-md border border-border bg-background px-2 text-sm text-right tabular-nums outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      {item.is_adjustment && (
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
          <button
            type="button"
            onClick={onAddItem}
            className="flex items-center gap-1 mt-2 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <Plus className="h-3 w-3" />
            Add adjustment
          </button>
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
  subdivisionId,
  budgets,
}: {
  subdivisionId: string;
  budgets: BudgetWithItems[];
}) {
  const router = useRouter();
  const [selectedBudgetId, setSelectedBudgetId] = useState<string>("");
  const [preview, setPreview] = useState<LevyPreviewData | null>(null);
  const [lots, setLots] = useState<AdjustedLot[]>([]);
  const [dueDate, setDueDate] = useState<Date | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [openLotId, setOpenLotId] = useState<string | null>(null);

  const selectedBudget = budgets.find((b) => b.id === selectedBudgetId);

  async function handleBudgetSelect(budgetId: string) {
    setSelectedBudgetId(budgetId);
    setPreview(null);
    setLots([]);
    setOpenLotId(null);

    if (!budgetId) return;

    setLoading(true);
    const result = await generateLevyPreview(subdivisionId, budgetId);
    setLoading(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }

    if (result.data) {
      setPreview(result.data);
      setDueDate(new Date(result.data.due_date + "T00:00:00"));
      setLots(result.data.lots.map((lot) => ({ ...lot, adjustments: [] })));
    }
  }

  const updateItem = useCallback((lotId: string, itemIndex: number, field: "description" | "amount", value: string | number) => {
    setLots((prev) =>
      prev.map((lot) => {
        if (lot.lot_id !== lotId) return lot;
        const baseCount = lot.items.length;
        if (itemIndex < baseCount) {
          // Editing a base item
          const newItems = [...lot.items];
          if (field === "amount") {
            newItems[itemIndex] = { ...newItems[itemIndex], amount: Number(value) || 0 };
          }
          return { ...lot, items: newItems };
        } else {
          // Editing an adjustment
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

    const result = await createLevyBatch(subdivisionId, {
      budget_id: preview.budget_id,
      financial_year: preview.financial_year,
      fund_type: preview.fund_type,
      period_label: preview.period_label,
      period_start: preview.period_start,
      period_end: preview.period_end,
      due_date: dueDate ? format(dueDate, "yyyy-MM-dd") : preview.due_date,
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

    setGenerating(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }

    toast.success("Levies generated");
    router.push(`/subdivisions/${subdivisionId}/finance/levies/${result.batchId}`);
  }

  const grandTotal = lots.reduce((sum, lot) => {
    const lotTotal = lot.items.reduce((s, i) => s + i.amount, 0) +
      lot.adjustments.reduce((s, a) => s + a.amount, 0);
    return sum + lotTotal;
  }, 0);

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold text-foreground">Generate levies</h1>

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
              <select
                value={selectedBudgetId}
                onChange={(e) => handleBudgetSelect(e.target.value)}
                className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              >
                <option value="">Select a budget...</option>
                {budgets.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.fund_type === "administrative" ? "Administrative Fund" : "Capital Works Fund"} — {b.financial_year} ({formatCurrency(b.total_amount)})
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Period info (auto-selected, read-only) */}
          {preview && (
            <div className="grid grid-cols-3 gap-4 pt-2 border-t border-border">
              <div>
                <Label className="text-xs text-muted-foreground">Period</Label>
                <p className="text-sm font-medium text-foreground mt-0.5">{preview.period_label}</p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Date range</Label>
                <p className="text-sm text-foreground mt-0.5">{formatDateLong(preview.period_start)} — {formatDateLong(preview.period_end)}</p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Due date</Label>
                <Popover>
                  <PopoverTrigger
                    className="mt-0.5 flex h-8 w-full items-center justify-start gap-2 rounded-md border border-border bg-background px-3 text-sm font-medium text-foreground hover:bg-accent cursor-pointer"
                  >
                    <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" />
                    {dueDate ? format(dueDate, "d MMMM yyyy") : "Select date"}
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-2" align="start">
                    <Calendar
                      mode="single"
                      selected={dueDate}
                      onSelect={setDueDate}
                      disabled={{ before: new Date() }}
                    />
                  </PopoverContent>
                </Popover>
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

              <div className="rounded-lg border border-border">
                {lots.map((lot) => (
                  <LotRow
                    key={lot.lot_id}
                    lot={lot}
                    isOpen={openLotId === lot.lot_id}
                    onToggle={() => setOpenLotId(openLotId === lot.lot_id ? null : lot.lot_id)}
                    onUpdateItem={(i, f, v) => updateItem(lot.lot_id, i, f, v)}
                    onAddItem={() => addAdjustment(lot.lot_id)}
                    onRemoveItem={(i) => removeItem(lot.lot_id, i)}
                  />
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Generate button */}
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
