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
import { createBudget } from "@/lib/actions/budget";
import type { CoaAccount } from "@/lib/actions/chart-of-accounts";
import { CreateAccountDrawer } from "@/components/chart-of-accounts/create-account-drawer";
import { useOCCode } from "@/lib/oc-context";

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n);

type FundType = "administrative" | "capital_works" | "maintenance_plan";

const FUND_OPTIONS: { value: FundType; label: string }[] = [
  { value: "administrative", label: "Administrative Fund" },
  { value: "capital_works", label: "Capital Works Fund" },
  { value: "maintenance_plan", label: "Maintenance Plan Fund" },
];

// ─── Account Combobox ──────────────────────────────────────
// Search + pick from the firm-wide chart of accounts. "Add new account…"
// opens the right-side drawer (shared with the Chart of accounts page) so a
// new account is created against the firm rather than this single budget.

function AccountCombobox({
  accounts,
  usedAccountIds,
  onSelect,
  onCancel,
  onRequestCreate,
}: {
  accounts: CoaAccount[];
  usedAccountIds: string[];
  onSelect: (account: CoaAccount) => void;
  onCancel: () => void;
  onRequestCreate: (seedName: string) => void;
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
        onCancel();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onCancel]);

  const q = query.toLowerCase();
  const filtered = accounts.filter(
    (a) => !usedAccountIds.includes(a.id) && (a.code.includes(q) || a.name.toLowerCase().includes(q)),
  );

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") { onCancel(); return; }
    if (e.key === "Enter") {
      e.preventDefault();
      if (filtered.length === 1) {
        onSelect(filtered[0]);
        setQuery("");
      } else if (query.trim()) {
        onRequestCreate(query.trim());
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
        placeholder="Search code or account name…"
        className="h-8 text-sm"
      />
      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 z-50 max-h-56 overflow-y-auto rounded-lg border border-border bg-popover shadow-md">
          {filtered.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => { onSelect(a); setQuery(""); }}
              className="flex w-full items-center justify-between px-3 py-2 text-sm text-foreground hover:bg-accent hover:text-accent-foreground cursor-pointer"
            >
              <span>{a.name}</span>
              <span className="ml-3 font-mono text-xs text-muted-foreground">{a.code}</span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => onRequestCreate(query.trim())}
            className="flex w-full items-center px-3 py-2 text-sm text-primary hover:bg-accent cursor-pointer border-t border-border"
          >
            <Plus className="mr-2 h-3.5 w-3.5" />
            Add new account{query.trim() ? ` — "${query.trim()}"` : ""}
          </button>
          {filtered.length === 0 && !query.trim() && (
            <div className="border-t border-border px-3 py-2 text-xs text-muted-foreground">No accounts left to add</div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Form ─────────────────────────────────────────────

interface BudgetItem {
  coa_account_id: string;
  description: string;
  // Held as a string so the field can be cleared mid-edit ("" = nothing
  // typed). Parsed to a number at submit. See NumberInput.
  amount: string;
}

export function CreateBudgetForm({
  ocId,
  accounts,
  fyOptions,
  defaultFinancialYear,
  hasMaintenanceFund,
}: {
  ocId: string;
  accounts: CoaAccount[];
  fyOptions: string[];
  defaultFinancialYear: string;
  hasMaintenanceFund: boolean;
}) {
  const ocCode = useOCCode();
  const router = useRouter();
  const [allAccounts, setAllAccounts] = useState<CoaAccount[]>(accounts);
  const [financialYear, setFinancialYear] = useState(defaultFinancialYear);
  const [fundType, setFundType] = useState<FundType>("administrative");
  const [items, setItems] = useState<BudgetItem[]>([]);
  // Open the picker on mount so there's one row ready to fill.
  const [showCombobox, setShowCombobox] = useState(true);
  const [pending, setPending] = useState(false);
  // Drawer state for "Add new account…"
  const [drawerOpen, setDrawerOpen] = useState(false);

  // A maintenance budget only makes sense if the OC actually runs a
  // maintenance-plan fund.
  const fundOptions = FUND_OPTIONS.filter(
    (o) => o.value !== "maintenance_plan" || hasMaintenanceFund,
  );
  const fundLabel = FUND_OPTIONS.find((o) => o.value === fundType)?.label ?? "Fund";

  // Reset items when fund type changes (re-open the picker for the new fund).
  useEffect(() => {
    setItems([]);
    setShowCombobox(true);
  }, [fundType]);

  const total = items.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
  const usedAccountIds = items.map((i) => i.coa_account_id);
  const accountById = new Map(allAccounts.map((a) => [a.id, a]));

  const addItem = useCallback((account: CoaAccount) => {
    setItems((prev) => [...prev, {
      coa_account_id: account.id,
      description: account.name,
      amount: "",
    }]);
    setShowCombobox(false);
  }, []);

  function updateAmount(index: number, value: string) {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, amount: value } : item)));
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
      items: nonZeroItems.map((i) => ({
        coa_account_id: i.coa_account_id,
        description: i.description,
        amount: i.amount,
      })),
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
                    <TableHead className="w-24">Code</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead className="w-[200px]">Annual amount</TableHead>
                    <TableHead className="w-[48px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item, i) => {
                    const account = accountById.get(item.coa_account_id);
                    return (
                      <TableRow key={i}>
                        <TableCell className="font-mono text-xs">{account?.code ?? ""}</TableCell>
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
                    );
                  })}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell />
                    <TableCell className="text-sm font-semibold text-foreground">Total annual</TableCell>
                    <TableCell className="text-sm font-bold text-foreground tabular-nums">{formatCurrency(total)}</TableCell>
                    <TableCell />
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          )}

          {/* Add item — kept OUTSIDE the table so the dropdown isn't clipped
              by the table's overflow container. */}
          <div className="mt-3">
            {showCombobox ? (
              <AccountCombobox
                accounts={allAccounts}
                usedAccountIds={usedAccountIds}
                onSelect={addItem}
                onCancel={() => setShowCombobox(false)}
                onRequestCreate={() => setDrawerOpen(true)}
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

      <CreateAccountDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        lockedType="expense"
        onCreated={(account) => {
          setAllAccounts((prev) => [...prev, account]);
          addItem(account);
        }}
      />
    </div>
  );
}
