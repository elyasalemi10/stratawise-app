"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createBudget, type BudgetCategory } from "@/lib/actions/budget";

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n);

// ─── Category Combobox ─────────────────────────────────────

function CategoryCombobox({
  categories,
  usedCategoryIds,
  onSelect,
}: {
  categories: BudgetCategory[];
  usedCategoryIds: string[];
  onSelect: (category: { id: string; name: string; isCustom?: boolean }) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filtered = categories.filter(
    (c) =>
      !usedCategoryIds.includes(c.id) &&
      c.name.toLowerCase().includes(query.toLowerCase())
  );

  const exactMatch = categories.some(
    (c) => c.name.toLowerCase() === query.toLowerCase()
  );

  function handleSelect(cat: { id: string; name: string; isCustom?: boolean }) {
    onSelect(cat);
    setQuery("");
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      if (filtered.length === 1) {
        handleSelect({ id: filtered[0].id, name: filtered[0].name });
      } else if (query.trim() && !exactMatch) {
        // Create custom
        const otherCat = categories.find((c) => c.name.toLowerCase().includes("other"));
        if (otherCat) {
          handleSelect({ id: otherCat.id, name: query.trim(), isCustom: true });
        }
      }
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <Input
        ref={inputRef}
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder="Search or type a category..."
        className="h-8 text-sm"
      />
      {open && (query || filtered.length > 0) && (
        <div className="absolute top-full left-0 right-0 mt-1 z-50 max-h-48 overflow-y-auto rounded-lg border border-border bg-popover shadow-md">
          {filtered.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => handleSelect({ id: cat.id, name: cat.name })}
              className="flex w-full items-center px-3 py-2 text-sm text-foreground hover:bg-accent hover:text-accent-foreground cursor-pointer"
            >
              {cat.name}
            </button>
          ))}
          {query.trim() && !exactMatch && (
            <button
              type="button"
              onClick={() => {
                const otherCat = categories.find((c) => c.name.toLowerCase().includes("other"));
                if (otherCat) {
                  handleSelect({ id: otherCat.id, name: query.trim(), isCustom: true });
                }
              }}
              className="flex w-full items-center px-3 py-2 text-sm text-primary hover:bg-accent cursor-pointer border-t border-border"
            >
              <Plus className="mr-2 h-3.5 w-3.5" />
              Create &ldquo;{query.trim()}&rdquo;
            </button>
          )}
          {filtered.length === 0 && !query.trim() && (
            <div className="px-3 py-2 text-xs text-muted-foreground">All categories added</div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Form ─────────────────────────────────────────────

interface BudgetItem {
  category_id: string;
  description: string;
  amount: number;
  isCustom?: boolean;
}

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
  const [items, setItems] = useState<BudgetItem[]>([]);
  const [showCombobox, setShowCombobox] = useState(false);
  const [pending, setPending] = useState(false);

  const fundCategories = categories.filter((c) => c.fund_type === fundType);

  // Reset items when fund type changes
  useEffect(() => {
    setItems([]);
    setShowCombobox(false);
  }, [fundType]);

  const total = items.reduce((sum, item) => sum + item.amount, 0);
  const usedCategoryIds = items.filter((i) => !i.isCustom).map((i) => i.category_id);

  const addItem = useCallback((cat: { id: string; name: string; isCustom?: boolean }) => {
    setItems((prev) => [...prev, {
      category_id: cat.id,
      description: cat.name,
      amount: 0,
      isCustom: cat.isCustom,
    }]);
    setShowCombobox(false);
  }, []);

  function updateAmount(index: number, value: string) {
    setItems((prev) =>
      prev.map((item, i) =>
        i === index ? { ...item, amount: Number(value) || 0 } : item
      )
    );
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

      {/* Budget items table */}
      <Card>
        <CardContent className="pt-5">
          <Label className="mb-3 block">Budget items</Label>
          <div className="rounded-lg border border-border">
            <table className="w-full text-sm table-fixed">
              <thead>
                <tr className="bg-muted/50 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-2.5 text-left w-auto">Category</th>
                  <th className="px-4 py-2.5 text-right w-[180px]">Annual amount</th>
                  <th className="px-4 py-2.5 w-[40px]"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, i) => (
                  <tr key={i} className="border-t border-border/50">
                    <td className="px-4 py-2.5">
                      <span className="text-sm text-foreground">{item.description}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <Input
                        type="number"
                        value={item.amount || ""}
                        onChange={(e) => updateAmount(i, e.target.value)}
                        placeholder="0.00"
                        className="h-8 text-sm text-right tabular-nums"
                        min={0}
                        step="0.01"
                      />
                    </td>
                    <td className="px-4 py-2.5">
                      <button
                        type="button"
                        onClick={() => removeItem(i)}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}

                {/* Add item row */}
                {showCombobox ? (
                  <tr className="border-t border-border/50">
                    <td className="px-4 py-2.5" colSpan={3}>
                      <CategoryCombobox
                        categories={fundCategories}
                        usedCategoryIds={usedCategoryIds}
                        onSelect={addItem}
                      />
                    </td>
                  </tr>
                ) : (
                  <tr className="border-t border-border/50">
                    <td className="px-4 py-2" colSpan={3}>
                      <button
                        type="button"
                        onClick={() => setShowCombobox(true)}
                        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground cursor-pointer py-1"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Add item
                      </button>
                    </td>
                  </tr>
                )}
              </tbody>
              {items.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-foreground/20">
                    <td className="px-4 py-3 text-sm font-semibold text-foreground">Total annual</td>
                    <td className="px-4 py-3 text-sm font-bold text-foreground text-right tabular-nums">{formatCurrency(total)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
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
