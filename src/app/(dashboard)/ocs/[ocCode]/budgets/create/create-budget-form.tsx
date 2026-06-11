"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
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
import type { LotForFund } from "@/lib/actions/funds";
import { CreateAccountDrawer } from "@/components/chart-of-accounts/create-account-drawer";
import { ExcludeLotsDrawer } from "@/components/budget/exclude-lots-drawer";
import { useOCCode } from "@/lib/oc-context";

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n);

type FundType = "operating" | "maintenance_plan";

// FundKey is the unified identifier used in component state. System funds
// are keyed by their enum string; custom funds use the `custom:<uuid>`
// form so a single Record can hold both line-item sets without collisions.
type FundKey = string;

const SYSTEM_FUND_LABELS: Record<FundType, string> = {
  operating: "Admin Fund",
  maintenance_plan: "Maintenance Plan Fund",
};

const SYSTEM_FUND_VALUES: FundType[] = ["operating", "maintenance_plan"];

const isCustomKey = (k: FundKey) => k.startsWith("custom:");
const customIdOf = (k: FundKey) => k.slice("custom:".length);
const customKey = (id: string) => `custom:${id}`;

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
  /** Lots excluded from paying for this line. Empty = every lot pays. */
  excludedLotIds: string[];
}

export function CreateBudgetForm({
  ocId,
  accounts,
  fyOptions,
  defaultFinancialYear,
  availableFunds,
  customFunds = [],
  lots,
}: {
  ocId: string;
  accounts: CoaAccount[];
  fyOptions: string[];
  defaultFinancialYear: string;
  /** System fund types the OC actually has on /funds. Filters which
   *  system options appear in the multi-select. */
  availableFunds: FundType[];
  /** Custom funds created via /funds. Fully selectable and budgetable ,
   *  items get a fund_id on submit instead of a fund_type. */
  customFunds?: Array<{ id: string; name: string }>;
  /** Every lot in the OC, for the per-line "Exclude lots" picker. */
  lots: LotForFund[];
}) {
  const ocCode = useOCCode();
  const router = useRouter();
  const [allAccounts, setAllAccounts] = useState<CoaAccount[]>(accounts);
  const [financialYear, setFinancialYear] = useState(defaultFinancialYear);

  // All fund options for the picker, system first then custom.
  const fundOptionList = useMemo(() => {
    const sys = SYSTEM_FUND_VALUES.filter((v) => availableFunds.includes(v)).map((v) => ({
      key: v as FundKey,
      label: SYSTEM_FUND_LABELS[v],
    }));
    const custom = customFunds.map((cf) => ({ key: customKey(cf.id), label: cf.name }));
    return [...sys, ...custom];
  }, [availableFunds, customFunds]);

  const customFundNameById = useMemo(
    () => new Map(customFunds.map((cf) => [cf.id, cf.name])),
    [customFunds],
  );

  const defaultKey: FundKey = (fundOptionList[0]?.key ?? "operating") as FundKey;

  const [selectedKeys, setSelectedKeys] = useState<FundKey[]>(
    fundOptionList.length > 0 ? [defaultKey] : [],
  );
  const [activeTab, setActiveTab] = useState<FundKey>(defaultKey);
  const [itemsByFund, setItemsByFund] = useState<Record<FundKey, BudgetItem[]>>({
    [defaultKey]: [],
  });
  const [comboOpen, setComboOpen] = useState<Record<FundKey, boolean>>({
    [defaultKey]: true,
  });
  const [pending, setPending] = useState(false);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerSeedName, setDrawerSeedName] = useState("");
  const [drawerFund, setDrawerFund] = useState<FundKey>(defaultKey);

  // Which line item's "Exclude lots" drawer is open, by fund + row index.
  const [excludeTarget, setExcludeTarget] = useState<{ fund: FundKey; index: number } | null>(null);
  const excludeItem = excludeTarget ? itemsByFund[excludeTarget.fund]?.[excludeTarget.index] : undefined;

  // Keep the active tab pointing at a selected fund. If the manager unticks
  // the active fund, jump to the first one that's still selected.
  useEffect(() => {
    if (!selectedKeys.includes(activeTab) && selectedKeys.length > 0) {
      setActiveTab(selectedKeys[0]);
    }
  }, [selectedKeys, activeTab]);

  const accountById = new Map(allAccounts.map((a) => [a.id, a]));

  function labelFor(key: FundKey): string {
    if (isCustomKey(key)) return customFundNameById.get(customIdOf(key)) ?? "Custom fund";
    return SYSTEM_FUND_LABELS[key as FundType] ?? key;
  }

  function toggleFund(key: FundKey, on: boolean) {
    setSelectedKeys((prev) => {
      if (on) return prev.includes(key) ? prev : [...prev, key];
      return prev.filter((f) => f !== key);
    });
    if (on) {
      setItemsByFund((prev) => (prev[key] ? prev : { ...prev, [key]: [] }));
      setComboOpen((prev) => (key in prev ? prev : { ...prev, [key]: true }));
    } else {
      setItemsByFund((prev) => ({ ...prev, [key]: [] }));
      setComboOpen((prev) => ({ ...prev, [key]: true }));
    }
  }

  const addItem = useCallback((fund: FundKey, account: CoaAccount) => {
    setItemsByFund((prev) => ({
      ...prev,
      [fund]: [...(prev[fund] ?? []), { coa_account_id: account.id, description: account.name, amount: "", excludedLotIds: [] }],
    }));
    setComboOpen((prev) => ({ ...prev, [fund]: false }));
  }, []);

  function updateAmount(fund: FundKey, index: number, value: string) {
    setItemsByFund((prev) => ({
      ...prev,
      [fund]: (prev[fund] ?? []).map((item, i) => (i === index ? { ...item, amount: value } : item)),
    }));
  }

  function setExcludedLots(fund: FundKey, index: number, ids: string[]) {
    setItemsByFund((prev) => ({
      ...prev,
      [fund]: (prev[fund] ?? []).map((item, i) => (i === index ? { ...item, excludedLotIds: ids } : item)),
    }));
  }

  function removeItem(fund: FundKey, index: number) {
    setItemsByFund((prev) => ({
      ...prev,
      [fund]: (prev[fund] ?? []).filter((_, i) => i !== index),
    }));
  }

  function fundTotal(fund: FundKey): number {
    return (itemsByFund[fund] ?? []).reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
  }

  async function handleSubmit() {
    if (selectedKeys.length === 0) {
      toast.error("Pick at least one fund.");
      return;
    }
    const empty = selectedKeys.filter(
      (f) => (itemsByFund[f] ?? []).every((i) => (parseFloat(i.amount) || 0) <= 0),
    );
    if (empty.length > 0) {
      const labels = empty.map(labelFor).join(", ");
      toast.error(`Item amounts can't be 0. Set an amount on every line in: ${labels}.`);
      return;
    }

    // A line can't exclude every lot , then no one would pay for it.
    const allExcluded = selectedKeys.some((f) =>
      (itemsByFund[f] ?? []).some(
        (i) => (parseFloat(i.amount) || 0) > 0 && lots.length > 0 && i.excludedLotIds.length >= lots.length,
      ),
    );
    if (allExcluded) {
      toast.error("A line can't exclude every lot. At least one lot must pay for it.");
      return;
    }

    setPending(true);
    const allItems: {
      coa_account_id: string | null;
      description: string;
      amount: number;
      fund_type?: FundType;
      fund_id?: string;
      excluded_lot_ids?: string[];
    }[] = [];
    for (const key of selectedKeys) {
      const items = (itemsByFund[key] ?? [])
        .map((i) => ({ ...i, amount: parseFloat(i.amount) || 0 }))
        .filter((i) => i.amount > 0);
      const isCustom = isCustomKey(key);
      for (const it of items) {
        allItems.push({
          coa_account_id: it.coa_account_id,
          description: it.description,
          amount: it.amount,
          excluded_lot_ids: it.excludedLotIds,
          ...(isCustom
            ? { fund_id: customIdOf(key) }
            : { fund_type: key as FundType }),
        });
      }
    }

    const selectedSystemFunds = selectedKeys
      .filter((k) => !isCustomKey(k))
      .map((k) => k as FundType);
    const selectedCustomFundIds = selectedKeys
      .filter(isCustomKey)
      .map(customIdOf);

    const result = await createBudget(ocId, {
      financial_year: financialYear,
      fund_types: selectedSystemFunds,
      fund_ids: selectedCustomFundIds,
      items: allItems,
    });

    if (result.error) {
      setPending(false);
      toast.error(result.error);
      return;
    }

    toast.success("Budget created");
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
            {fundOptionList.length === 0 ? (
              <div className="rounded-md border border-border bg-muted/40 px-4 py-4 text-sm text-foreground">
                <p>This OC has no funds yet. Create at least one fund (Operating, Maintenance Plan, or a custom one) before you can budget for it.</p>
                <a
                  href={`/ocs/${ocCode}/funds/create`}
                  className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                >
                  Go to fund setup &rarr;
                </a>
              </div>
            ) : (
              <div className="flex flex-wrap gap-3">
                {fundOptionList.map((opt) => {
                  const checked = selectedKeys.includes(opt.key);
                  return (
                    <div key={opt.key} className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2">
                      <Checkbox
                        id={`fund-${opt.key}`}
                        checked={checked}
                        onCheckedChange={(v) => toggleFund(opt.key, v === true)}
                        className="bg-card"
                      />
                      <Label htmlFor={`fund-${opt.key}`} className="cursor-pointer text-sm font-normal">
                        {opt.label}
                      </Label>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* One tab per selected fund. Line items are scoped per-fund. */}
      {selectedKeys.length > 0 && (
        <Card>
          <CardContent className="pt-5">
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab((v as FundKey) ?? selectedKeys[0])}>
              <TabsList variant="line" className="border-b border-border">
                {selectedKeys.map((key) => (
                  <TabsTrigger key={key} value={key}>
                    {labelFor(key)}
                  </TabsTrigger>
                ))}
              </TabsList>

              {selectedKeys.map((key) => {
                const items = itemsByFund[key] ?? [];
                const total = fundTotal(key);
                const usedIds = items.map((i) => i.coa_account_id);
                return (
                  <TabsContent key={key} value={key} className="pt-5">
                    {items.length > 0 && (
                      <div className="overflow-hidden rounded-lg border border-border">
                        <Table variant="bordered" className="text-sm">
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-24">Code</TableHead>
                              <TableHead>Account</TableHead>
                              <TableHead className="w-[170px]">Paying lots</TableHead>
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
                                    <Button
                                      type="button"
                                      variant="secondary"
                                      size="sm"
                                      className="h-8 font-normal"
                                      onClick={() => setExcludeTarget({ fund: key, index: i })}
                                    >
                                      {item.excludedLotIds.length === 0
                                        ? "All lots"
                                        : `${lots.length - item.excludedLotIds.length} of ${lots.length} lots`}
                                    </Button>
                                  </TableCell>
                                  <TableCell>
                                    <NumberInput
                                      value={item.amount}
                                      onChange={(v) => updateAmount(key, i, v)}
                                      thousandsSeparator
                                      prefix="$"
                                      placeholder="Annual amount"
                                    />
                                  </TableCell>
                                  <TableCell>
                                    <button
                                      type="button"
                                      onClick={() => removeItem(key, i)}
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
                              <TableCell colSpan={3} className="text-sm font-semibold text-foreground">Total annual</TableCell>
                              <TableCell className="text-sm font-bold text-foreground tabular-nums pl-6">{formatCurrency(total)}</TableCell>
                              <TableCell />
                            </TableRow>
                          </TableFooter>
                        </Table>
                      </div>
                    )}

                    <div className="mt-3">
                      {comboOpen[key] ? (
                        <AccountCombobox
                          accounts={allAccounts}
                          usedAccountIds={usedIds}
                          onSelect={(account) => addItem(key, account)}
                          onCancel={() => setComboOpen((prev) => ({ ...prev, [key]: false }))}
                          onRequestCreate={(seedName) => {
                            setDrawerSeedName(seedName);
                            setDrawerFund(key);
                            setDrawerOpen(true);
                          }}
                        />
                      ) : (
                        <div className="flex items-center gap-3">
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => setComboOpen((prev) => ({ ...prev, [key]: true }))}
                          >
                            <Plus className="mr-1.5 h-3.5 w-3.5" />
                            Add item
                          </Button>
                          <button
                            type="button"
                            onClick={() => {
                              setDrawerSeedName("");
                              setDrawerFund(key);
                              setDrawerOpen(true);
                            }}
                            className="text-sm font-medium text-[color:var(--brand-gold)] hover:underline cursor-pointer"
                          >
                            Add account
                          </button>
                        </div>
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
          disabled={pending || selectedKeys.length === 0 || selectedKeys.every((f) => fundTotal(f) === 0)}
        >
          {pending && <Loader2 className="size-4 animate-spin" />}
          Create budget
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

      <ExcludeLotsDrawer
        open={!!excludeTarget}
        onOpenChange={(o) => { if (!o) setExcludeTarget(null); }}
        lots={lots}
        value={excludeItem?.excludedLotIds ?? []}
        onChange={(ids) => excludeTarget && setExcludedLots(excludeTarget.fund, excludeTarget.index, ids)}
        itemLabel={excludeItem?.description ?? ""}
      />
    </div>
  );
}
