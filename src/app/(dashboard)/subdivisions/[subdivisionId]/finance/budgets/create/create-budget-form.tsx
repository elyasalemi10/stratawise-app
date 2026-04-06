"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createBudget, type BudgetCategory } from "@/lib/actions/budget";

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n);

export function CreateBudgetForm({
  subdivisionId,
  categories,
  financialYear,
}: {
  subdivisionId: string;
  categories: BudgetCategory[];
  financialYear: string;
}) {
  const router = useRouter();
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
    router.push(`/subdivisions/${subdivisionId}/finance/budgets`);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-foreground">Create budget</h1>
        <p className="text-sm text-muted-foreground">Financial year {financialYear}</p>
      </div>

      {/* Fund type selector */}
      <Card>
        <CardContent className="pt-5 space-y-3">
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
        </CardContent>
      </Card>

      {/* Budget items */}
      <Card>
        <CardContent className="pt-5">
          <Label className="mb-3 block">Budget items</Label>
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-2.5 text-left">Category / Description</th>
                  <th className="px-4 py-2.5 text-right w-44">Annual amount</th>
                  <th className="px-4 py-2.5 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, i) => {
                  const isDefault = fundCategories.some((c) => c.id === item.category_id && c.name === item.description);
                  return (
                    <tr key={i} className="border-t border-border/50">
                      <td className="px-4 py-2.5">
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
                      <td className="px-4 py-2.5">
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
                      <td className="px-4 py-2.5">
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

          <Button type="button" variant="outline" size="sm" onClick={addCustomItem} className="mt-3">
            <Plus className="mr-1 h-3 w-3" />
            Add custom item
          </Button>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex items-center justify-end gap-3">
        <Button
          type="button"
          variant="ghost"
          onClick={() => router.push(`/subdivisions/${subdivisionId}/finance/budgets`)}
        >
          Cancel
        </Button>
        <Button onClick={handleSubmit} disabled={pending || total === 0}>
          {pending ? "Creating..." : "Create budget"}
        </Button>
      </div>
    </div>
  );
}
