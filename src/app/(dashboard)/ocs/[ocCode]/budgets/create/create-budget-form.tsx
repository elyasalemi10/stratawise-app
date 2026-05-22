"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Plus, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { createBudget, createBudgetCategory, type BudgetCategory } from "@/lib/actions/budget";
import { useOCCode } from "@/lib/oc-context";

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n);

type FundType = "administrative" | "capital_works" | "maintenance_plan";

const FUND_OPTIONS: { value: FundType; label: string }[] = [
  { value: "administrative", label: "Administrative Fund" },
  { value: "capital_works", label: "Capital Works Fund" },
  { value: "maintenance_plan", label: "Maintenance Plan Fund" },
];

// ─── Category Combobox ─────────────────────────────────────

function CategoryCombobox({
  categories,
  usedCategoryIds,
  fundType,
  onSelect,
  onCancel,
  onUpdateCategoryId,
}: {
  categories: BudgetCategory[];
  usedCategoryIds: string[];
  fundType: "administrative" | "capital_works" | "maintenance_plan";
  onSelect: (category: { id: string; name: string }) => void;
  onCancel: () => void;
  onUpdateCategoryId?: (tempId: string, realId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(true);
  const [creating, setCreating] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        if (query.trim() && !creating) {
          handleCreateCustom();
        } else {
          onCancel();
        }
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, creating]);

  const filtered = categories.filter(
    (c) =>
      !usedCategoryIds.includes(c.id) &&
      c.name.toLowerCase().includes(query.toLowerCase())
  );

  const exactMatch = categories.some(
    (c) => c.name.toLowerCase() === query.toLowerCase()
  );

  function handleCreateCustom() {
    if (!query.trim() || creating) return;
    const name = query.trim();
    const tempId = `temp-${Date.now()}`;

    // Add immediately with temp ID
    onSelect({ id: tempId, name });
    setQuery("");

    // Persist in background, replace temp ID with real one
    createBudgetCategory(name, fundType).then((result) => {
      if (result.error) {
        toast.error(`Failed to save "${name}"`);
      } else if (result.id && result.id !== tempId) {
        onUpdateCategoryId?.(tempId, result.id);
      }
    });
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      onCancel();
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (filtered.length === 1) {
        onSelect({ id: filtered[0].id, name: filtered[0].name });
        setQuery("");
      } else if (query.trim() && !exactMatch) {
        handleCreateCustom();
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
              onClick={() => { onSelect({ id: cat.id, name: cat.name }); setQuery(""); }}
              className="flex w-full items-center px-3 py-2 text-sm text-foreground hover:bg-accent hover:text-accent-foreground cursor-pointer"
            >
              {cat.name}
            </button>
          ))}
          {query.trim() && !exactMatch && (
            <button
              type="button"
              onClick={handleCreateCustom}
              disabled={creating}
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
  // Held as a string so the field can be cleared mid-edit ("" = nothing
  // typed). Parsed to a number at submit. See NumberInput.
  amount: string;
}

export function CreateBudgetForm({
  ocId,
  categories,
  fyOptions,
  defaultFinancialYear,
  hasMaintenanceFund,
}: {
  ocId: string;
  categories: BudgetCategory[];
  fyOptions: string[];
  defaultFinancialYear: string;
  hasMaintenanceFund: boolean;
}) {
  const ocCode = useOCCode();
  const router = useRouter();
  const [financialYear, setFinancialYear] = useState(defaultFinancialYear);
  const [fundType, setFundType] = useState<FundType>("administrative");
  const [items, setItems] = useState<BudgetItem[]>([]);
  // Open the category picker on mount so there's one row ready to fill.
  const [showCombobox, setShowCombobox] = useState(true);
  const [pending, setPending] = useState(false);

  // A maintenance budget only makes sense if the OC actually runs a
  // maintenance-plan fund.
  const fundOptions = FUND_OPTIONS.filter(
    (o) => o.value !== "maintenance_plan" || hasMaintenanceFund,
  );
  const fundLabel = FUND_OPTIONS.find((o) => o.value === fundType)?.label ?? "Fund";

  const fundCategories = categories.filter((c) => c.fund_type === fundType);

  // Reset items when fund type changes (re-open the picker for the new fund).
  useEffect(() => {
    setItems([]);
    setShowCombobox(true);
  }, [fundType]);

  const total = items.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
  const usedCategoryIds = items.map((i) => i.category_id);

  const addItem = useCallback((cat: { id: string; name: string }) => {
    setItems((prev) => [...prev, {
      category_id: cat.id,
      description: cat.name,
      amount: "",
    }]);
    setShowCombobox(false);
  }, []);

  const updateCategoryId = useCallback((tempId: string, realId: string) => {
    setItems((prev) =>
      prev.map((item) => item.category_id === tempId ? { ...item, category_id: realId } : item)
    );
    setShowCombobox(false);
  }, []);

  function updateAmount(index: number, value: string) {
    setItems((prev) =>
      prev.map((item, i) =>
        i === index ? { ...item, amount: value } : item
      )
    );
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit() {
    const nonZeroItems = items
      .map((i) => ({ ...i, amount: parseFloat(i.amount) || 0 }))
      .filter((i) => i.amount > 0);
    if (nonZeroItems.length === 0) {
      toast.error("Add at least one budget item with an amount");
      return;
    }

    setPending(true);
    const result = await createBudget(ocId, {
      financial_year: financialYear,
      fund_type: fundType,
      items: nonZeroItems,
    });

    if (result.error) {
      setPending(false); // clear ONLY on error — success keeps the spinner through navigation
      toast.error(result.error);
      return;
    }

    toast.success(`${fundLabel} budget created`);
    router.push(`/ocs/${ocCode}/budgets`);
  }

  return (
    <div className="space-y-6">
      {/* Financial year + fund type */}
      <Card>
        <CardContent className="pt-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Financial year</Label>
              <Select value={financialYear} onValueChange={(v) => setFinancialYear(v ?? defaultFinancialYear)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {fyOptions.map((fy) => (
                    <SelectItem key={fy} value={fy}>{fy}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Fund type</Label>
              <Select value={fundType} onValueChange={(v) => setFundType((v as FundType) ?? "administrative")}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {fundOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Budget items table */}
      <Card>
        <CardContent className="pt-5">
          <Label className="mb-3 block">Budget items</Label>
          {items.length > 0 && (
            <div className="rounded-lg border border-border overflow-hidden">
              <Table variant="bordered" className="text-sm">
                <TableHeader>
                  <TableRow>
                    <TableHead>Category</TableHead>
                    <TableHead className="w-[200px]">Annual amount</TableHead>
                    <TableHead className="w-[48px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-sm text-foreground">{item.description}</TableCell>
                      <TableCell>
                        <NumberInput
                          value={item.amount}
                          onChange={(v) => updateAmount(i, v)}
                          thousandsSeparator
                          prefix="$"
                          placeholder="Annual amount"
                        />
                      </TableCell>
                      <TableCell>
                        <button
                          type="button"
                          onClick={() => removeItem(i)}
                          className="text-muted-foreground hover:text-destructive cursor-pointer"
                          aria-label="Remove item"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell className="text-sm font-semibold text-foreground">Total annual</TableCell>
                    <TableCell className="text-sm font-bold text-foreground tabular-nums">{formatCurrency(total)}</TableCell>
                    <TableCell />
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          )}

          {/* Add item — kept OUTSIDE the table so the category dropdown isn't
              clipped by the table's overflow container. */}
          <div className="mt-3">
            {showCombobox ? (
              <CategoryCombobox
                categories={fundCategories}
                usedCategoryIds={usedCategoryIds}
                fundType={fundType}
                onSelect={addItem}
                onCancel={() => setShowCombobox(false)}
                onUpdateCategoryId={updateCategoryId}
              />
            ) : (
              <Button type="button" variant="secondary" size="sm" onClick={() => setShowCombobox(true)}>
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Add item
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Submit */}
      <div className="flex justify-end">
        <Button onClick={handleSubmit} disabled={pending || total === 0}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          Create budget
        </Button>
      </div>
    </div>
  );
}
