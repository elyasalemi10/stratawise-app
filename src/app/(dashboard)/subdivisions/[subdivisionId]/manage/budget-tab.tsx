"use client";

import { useState, useEffect } from "react";
import { Plus, DollarSign, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  getBudgetCategories,
  getSubdivisionBudgets,
  createBudget,
  approveBudget,
  type BudgetCategory,
  type BudgetWithItems,
} from "@/lib/actions/budget";

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n);

// ─── Create Budget Dialog ──────────────────────────────────

function CreateBudgetDialog({
  open,
  onClose,
  subdivisionId,
  categories,
  financialYear,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  subdivisionId: string;
  categories: BudgetCategory[];
  financialYear: string;
  onCreated: () => void;
}) {
  const [fundType, setFundType] = useState<"administrative" | "capital_works">("administrative");
  const [items, setItems] = useState<{ category_id: string; description: string; amount: number }[]>([]);
  const [pending, setPending] = useState(false);

  const fundCategories = categories.filter((c) => c.fund_type === fundType);

  // Reset items when fund type changes
  useEffect(() => {
    setItems(
      fundCategories.map((c) => ({
        category_id: c.id,
        description: c.name,
        amount: 0,
      }))
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fundType]);

  const total = items.reduce((sum, item) => sum + item.amount, 0);

  function updateItem(index: number, field: "description" | "amount", value: string | number) {
    setItems((prev) =>
      prev.map((item, i) =>
        i === index ? { ...item, [field]: field === "amount" ? (Number(value) || 0) : value } : item
      )
    );
  }

  function addCustomItem() {
    const otherCategory = fundCategories.find((c) => c.name.toLowerCase().includes("other"));
    if (!otherCategory) return;
    setItems((prev) => [...prev, { category_id: otherCategory.id, description: "", amount: 0 }]);
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit() {
    const nonZeroItems = items.filter((i) => i.amount > 0);
    if (nonZeroItems.length === 0) {
      toast.error("Add at least one budget item with an amount");
      return;
    }

    setPending(true);
    const result = await createBudget(subdivisionId, {
      financial_year: financialYear,
      fund_type: fundType,
      items: nonZeroItems,
    });
    setPending(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }

    toast.success(`${fundType === "administrative" ? "Administrative Fund" : "Capital Works Fund"} budget created`);
    onCreated();
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create budget — {financialYear}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Fund type selector */}
          <div className="space-y-1.5">
            <Label>Fund type</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={fundType === "administrative" ? "default" : "outline"}
                size="sm"
                onClick={() => setFundType("administrative")}
              >
                Administrative Fund
              </Button>
              <Button
                type="button"
                variant={fundType === "capital_works" ? "default" : "outline"}
                size="sm"
                onClick={() => setFundType("capital_works")}
              >
                Capital Works Fund
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {fundType === "administrative"
                ? "Day-to-day operating expenses: insurance, management, cleaning, maintenance."
                : "Long-term capital expenditure: painting, roofing, major repairs, equipment replacement."}
            </p>
          </div>

          {/* Budget items */}
          <div>
            <Label className="mb-2 block">Budget items</Label>
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-2.5 text-left">Category / Description</th>
                    <th className="px-4 py-2.5 text-right w-40">Annual amount</th>
                    <th className="px-4 py-2.5 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, i) => {
                    const isDefault = fundCategories.some((c) => c.id === item.category_id && c.name === item.description);
                    return (
                      <tr key={i} className="border-t border-border/50">
                        <td className="px-4 py-2">
                          {isDefault ? (
                            <span className="text-sm text-foreground">{item.description}</span>
                          ) : (
                            <Input
                              value={item.description}
                              onChange={(e) => updateItem(i, "description", e.target.value)}
                              placeholder="Item description"
                              className="h-8 text-sm"
                            />
                          )}
                        </td>
                        <td className="px-4 py-2">
                          <Input
                            type="number"
                            value={item.amount || ""}
                            onChange={(e) => updateItem(i, "amount", e.target.value)}
                            placeholder="0.00"
                            className="h-8 text-sm text-right tabular-nums"
                            min={0}
                            step="0.01"
                          />
                        </td>
                        <td className="px-4 py-2">
                          {!isDefault && (
                            <button
                              type="button"
                              onClick={() => removeItem(i)}
                              className="text-muted-foreground hover:text-destructive text-xs"
                            >
                              ×
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-foreground/20">
                    <td className="px-4 py-3 text-sm font-semibold text-foreground">Total annual</td>
                    <td className="px-4 py-3 text-sm font-bold text-foreground text-right tabular-nums">{formatCurrency(total)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <Button type="button" variant="outline" size="sm" onClick={addCustomItem} className="mt-2">
              <Plus className="mr-1 h-3 w-3" />
              Add custom item
            </Button>
          </div>

          {/* Summary info */}
          <div className="bg-muted/50 rounded-lg p-3 text-xs text-muted-foreground space-y-1">
            <p>Under the <strong>Owners Corporations Act 2006 (Vic)</strong>, the OC must prepare an annual budget split into Administrative and Capital Works funds.</p>
            <p>Levies will be calculated per lot based on lot liability proportions and the subdivision&apos;s billing cycle.</p>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={pending || total === 0}>
            {pending ? "Creating..." : "Create budget"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Budget Card ──────────────────────────────────────────

function BudgetCard({
  budget,
  subdivisionId,
  onApproved,
}: {
  budget: BudgetWithItems;
  subdivisionId: string;
  onApproved: () => void;
}) {
  const [approving, setApproving] = useState(false);

  async function handleApprove() {
    setApproving(true);
    const result = await approveBudget(subdivisionId, budget.id);
    setApproving(false);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("Budget approved");
      onApproved();
    }
  }

  const fundLabel = budget.fund_type === "administrative" ? "Administrative Fund" : "Capital Works Fund";

  return (
    <Card>
      <CardContent className="pt-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground">{fundLabel}</h3>
            <p className="text-xs text-muted-foreground">{budget.financial_year}</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={budget.status === "approved" ? "success" : "warning"}>
              {budget.status}
            </Badge>
            {budget.status === "draft" && (
              <Button size="sm" variant="outline" onClick={handleApprove} disabled={approving}>
                <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                {approving ? "Approving..." : "Approve"}
              </Button>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2 text-left">Item</th>
                <th className="px-4 py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {budget.items.map((item) => (
                <tr key={item.id} className="border-t border-border/50">
                  <td className="px-4 py-2 text-foreground">
                    {item.description || item.category_name}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-foreground">
                    {formatCurrency(item.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-foreground/20">
                <td className="px-4 py-2.5 font-semibold text-foreground">Total</td>
                <td className="px-4 py-2.5 font-bold text-right tabular-nums text-foreground">
                  {formatCurrency(budget.total_amount)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main Financials Tab ───────────────────────────────────

export function BudgetTab({ subdivisionId, financialYearStartMonth }: { subdivisionId: string; financialYearStartMonth: number }) {
  const [categories, setCategories] = useState<BudgetCategory[]>([]);
  const [budgets, setBudgets] = useState<BudgetWithItems[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  // Calculate current financial year
  const now = new Date();
  const fyStartMonth = financialYearStartMonth ?? 7; // Default July
  const currentYear = now.getFullYear();
  const fyStartYear = now.getMonth() + 1 >= fyStartMonth ? currentYear : currentYear - 1;
  const financialYear = `${fyStartYear}-${fyStartYear + 1}`;

  async function loadData() {
    setLoading(true);
    const [cats, buds] = await Promise.all([
      getBudgetCategories(),
      getSubdivisionBudgets(subdivisionId),
    ]);
    setCategories(cats);
    setBudgets(buds);
    setLoading(false);
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subdivisionId]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm text-muted-foreground">Loading budgets...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const currentBudgets = budgets.filter((b) => b.financial_year === financialYear);
  const hasAdmin = currentBudgets.some((b) => b.fund_type === "administrative");
  const hasCapital = currentBudgets.some((b) => b.fund_type === "capital_works");
  const totalBudgeted = currentBudgets.reduce((sum, b) => sum + Number(b.total_amount), 0);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Financial year {financialYear}</h3>
          <p className="text-xs text-muted-foreground">
            {hasAdmin && hasCapital
              ? `Both funds budgeted · ${formatCurrency(totalBudgeted)} total`
              : hasAdmin || hasCapital
                ? `${hasAdmin ? "Administrative" : "Capital Works"} fund budgeted · ${formatCurrency(totalBudgeted)}`
                : "No budgets created yet"}
          </p>
        </div>
        {(!hasAdmin || !hasCapital) && (
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="mr-2 h-3.5 w-3.5" />
            Create budget
          </Button>
        )}
      </div>

      {/* Budget cards */}
      {currentBudgets.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <DollarSign className="h-12 w-12 text-muted-foreground/30" />
            <p className="mt-4 text-base font-medium text-foreground">No budgets yet</p>
            <p className="mt-1 text-sm text-muted-foreground max-w-sm">
              Create an annual budget to start generating levy notices. Under Victorian legislation,
              OCs must maintain separate Administrative and Capital Works funds.
            </p>
            <Button className="mt-4" onClick={() => setShowCreate(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Create budget
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {currentBudgets.map((budget) => (
            <BudgetCard
              key={budget.id}
              budget={budget}
              subdivisionId={subdivisionId}
              onApproved={loadData}
            />
          ))}
        </div>
      )}

      {/* Previous years */}
      {budgets.filter((b) => b.financial_year !== financialYear).length > 0 && (
        <div className="pt-4 border-t border-border">
          <h3 className="text-sm font-semibold text-foreground mb-3">Previous years</h3>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {budgets
              .filter((b) => b.financial_year !== financialYear)
              .map((budget) => (
                <BudgetCard
                  key={budget.id}
                  budget={budget}
                  subdivisionId={subdivisionId}
                  onApproved={loadData}
                />
              ))}
          </div>
        </div>
      )}

      {/* Create dialog */}
      {showCreate && (
        <CreateBudgetDialog
          open={showCreate}
          onClose={() => setShowCreate(false)}
          subdivisionId={subdivisionId}
          categories={categories}
          financialYear={financialYear}
          onCreated={loadData}
        />
      )}
    </div>
  );
}
