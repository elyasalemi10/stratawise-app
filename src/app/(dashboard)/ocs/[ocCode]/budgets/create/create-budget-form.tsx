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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { createBudget } from "@/lib/actions/budget";
import type { CoaAccount } from "@/lib/chart-of-accounts";
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
  /** Caller opens the create-account drawer. The typed query is forwarded so
   *  the drawer can prefill the name field with what the manager was typing. */
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
            Add new account{query.trim() ? `, "${query.trim()}"` : ""}
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

// Per-fund line items, keyed by FundType. A budget is created per fund at
// submit-time, so each selected fund's items are tracked independently.
type FundItemsMap = Record<FundType, BudgetItem[]>;

function emptyItems(): FundItemsMap {
  return { administrative: [], capital_works: [], maintenance_plan: [] };
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

  // Funds the manager wants to budget for this year. At least one required.
  const [selectedFunds, setSelectedFunds] = useState<FundType[]>(["administrative"]);
  const [activeTab, setActiveTab] = useState<FundType>("administrative");
  const [itemsByFund, setItemsByFund] = useState<FundItemsMap>(emptyItems);
  // Combobox visibility tracked per fund (re-opens on tab switch so each tab
  // has one ready row to fill).
  const [comboOpen, setComboOpen] = useState<Record<FundType, boolean>>({
    administrative: true, capital_works: true, maintenance_plan: true,
  });
  const [pending, setPending] = useState(false);

  // Drawer state , captures the fund the request came from + any typed name
  // to seed into the drawer.
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerSeedName, setDrawerSeedName] = useState("");
  const [drawerFund, setDrawerFund] = useState<FundType>("administrative");

  const fundOptions = FUND_OPTIONS.filter(
    (o) => o.value !== "maintenance_plan" || hasMaintenanceFund,
  );

  // Keep the active tab pointing at a selected fund. If the manager unticks
  // the active fund, jump to the first one that's still selected.
  useEffect(() => {
    if (!selectedFunds.includes(activeTab) && selectedFunds.length > 0) {
      setActiveTab(selectedFunds[0]);
    }
  }, [selectedFunds, activeTab]);

  const accountById = new Map(allAccounts.map((a) => [a.id, a]));

  function toggleFund(fund: FundType, on: boolean) {
    setSelectedFunds((prev) => {
      if (on) return prev.includes(fund) ? prev : [...prev, fund];
      return prev.filter((f) => f !== fund);
    });
    if (!on) {
      // Drop that fund's items so unticked + reticked starts clean.
      setItemsByFund((prev) => ({ ...prev, [fund]: [] }));
      setComboOpen((prev) => ({ ...prev, [fund]: true }));
    }
  }

  const addItem = useCallback((fund: FundType, account: CoaAccount) => {
    setItemsByFund((prev) => ({
      ...prev,
      [fund]: [...prev[fund], { coa_account_id: account.id, description: account.name, amount: "" }],
    }));
    setComboOpen((prev) => ({ ...prev, [fund]: false }));
  }, []);

  function updateAmount(fund: FundType, index: number, value: string) {
    setItemsByFund((prev) => ({
      ...prev,
      [fund]: prev[fund].map((item, i) => (i === index ? { ...item, amount: value } : item)),
    }));
  }

  function removeItem(fund: FundType, index: number) {
    setItemsByFund((prev) => ({
      ...prev,
      [fund]: prev[fund].filter((_, i) => i !== index),
    }));
  }

  function fundTotal(fund: FundType): number {
    return itemsByFund[fund].reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
  }

  async function handleSubmit() {
    if (selectedFunds.length === 0) {
      toast.error("Pick at least one fund.");
      return;
    }
    // Validate every selected fund has at least one positive line item.
    const empty = selectedFunds.filter(
      (f) => itemsByFund[f].every((i) => (parseFloat(i.amount) || 0) <= 0),
    );
    if (empty.length > 0) {
      const labels = empty.map((f) => FUND_OPTIONS.find((o) => o.value === f)?.label).join(", ");
      toast.error(`Add at least one budget item with an amount to: ${labels}.`);
      return;
    }

    setPending(true);
    // Submit one budget per selected fund. If any single one fails we surface
    // the error and stop , partial-success is confusing to recover from.
    for (const fund of selectedFunds) {
      const nonZeroItems = itemsByFund[fund]
        .map((i) => ({ ...i, amount: parseFloat(i.amount) || 0 }))
        .filter((i) => i.amount > 0);

      const result = await createBudget(ocId, {
        financial_year: financialYear,
        fund_type: fund,
        items: nonZeroItems.map((i) => ({
          coa_account_id: i.coa_account_id,
          description: i.description,
          amount: i.amount,
        })),
      });

      if (result.error) {
        setPending(false); // clear ONLY on error
        const fundLabel = FUND_OPTIONS.find((o) => o.value === fund)?.label ?? "Fund";
        toast.error(`${fundLabel}: ${result.error}`);
        return;
      }
    }

    toast.success(
      selectedFunds.length === 1
        ? `${FUND_OPTIONS.find((o) => o.value === selectedFunds[0])?.label} budget created`
        : `${selectedFunds.length} budgets created`,
    );
    router.push(`/ocs/${ocCode}/budgets`);
  }

  return (
    <div className="space-y-6">
      {/* Financial year + which funds to budget for */}
      <Card>
        <CardContent className="space-y-5 pt-5">
          <div className="space-y-1.5">
            <Label>Financial year</Label>
            <Select value={financialYear} onValueChange={(v) => setFinancialYear(v ?? defaultFinancialYear)}>
              <SelectTrigger className="w-full max-w-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {fyOptions.map((fy) => (
                  <SelectItem key={fy} value={fy}>{fy}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Funds</Label>
            <p className="text-xs text-muted-foreground">
              Tick every fund you&apos;re budgeting for this year. Each one gets its own tab below.
            </p>
            <div className="flex flex-wrap gap-3">
              {fundOptions.map((opt) => {
                const checked = selectedFunds.includes(opt.value);
                return (
                  <div key={opt.value} className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2">
                    <Checkbox
                      id={`fund-${opt.value}`}
                      checked={checked}
                      onCheckedChange={(v) => toggleFund(opt.value, v === true)}
                      className="bg-card"
                    />
                    <Label htmlFor={`fund-${opt.value}`} className="cursor-pointer text-sm font-normal">
                      {opt.label}
                    </Label>
                  </div>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* One tab per selected fund. Line items are scoped per-fund. */}
      {selectedFunds.length > 0 && (
        <Card>
          <CardContent className="pt-5">
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab((v as FundType) ?? selectedFunds[0])}>
              <TabsList variant="line" className="border-b border-border">
                {selectedFunds.map((fund) => {
                  const label = FUND_OPTIONS.find((o) => o.value === fund)?.label ?? fund;
                  return (
                    <TabsTrigger key={fund} value={fund}>
                      {label}
                    </TabsTrigger>
                  );
                })}
              </TabsList>

              {selectedFunds.map((fund) => {
                const items = itemsByFund[fund];
                const total = fundTotal(fund);
                const usedIds = items.map((i) => i.coa_account_id);
                return (
                  <TabsContent key={fund} value={fund} className="pt-5">
                    {items.length > 0 && (
                      <div className="overflow-hidden rounded-lg border border-border">
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
                                      onChange={(v) => updateAmount(fund, i, v)}
                                      thousandsSeparator
                                      prefix="$"
                                      placeholder="Annual amount"
                                    />
                                  </TableCell>
                                  <TableCell>
                                    <button
                                      type="button"
                                      onClick={() => removeItem(fund, i)}
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

                    <div className="mt-3">
                      {comboOpen[fund] ? (
                        <AccountCombobox
                          accounts={allAccounts}
                          usedAccountIds={usedIds}
                          onSelect={(account) => addItem(fund, account)}
                          onCancel={() => setComboOpen((prev) => ({ ...prev, [fund]: false }))}
                          onRequestCreate={(seedName) => {
                            setDrawerSeedName(seedName);
                            setDrawerFund(fund);
                            setDrawerOpen(true);
                          }}
                        />
                      ) : (
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => setComboOpen((prev) => ({ ...prev, [fund]: true }))}
                        >
                          <Plus className="mr-1.5 h-3.5 w-3.5" />
                          Add item
                        </Button>
                      )}
                    </div>
                  </TabsContent>
                );
              })}
            </Tabs>
          </CardContent>
        </Card>
      )}

      {/* Submit */}
      <div className="flex justify-end">
        <Button
          onClick={handleSubmit}
          disabled={pending || selectedFunds.length === 0 || selectedFunds.every((f) => fundTotal(f) === 0)}
        >
          {pending && <Loader2 className="size-4 animate-spin" />}
          {selectedFunds.length > 1 ? `Create ${selectedFunds.length} budgets` : "Create budget"}
        </Button>
      </div>

      <CreateAccountDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        lockedType="expense"
        initialName={drawerSeedName}
        onCreated={(account) => {
          setAllAccounts((prev) => [...prev, account]);
          addItem(drawerFund, account);
        }}
      />
    </div>
  );
}
