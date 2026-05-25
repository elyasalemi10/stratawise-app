"use client";

import { useEffect, useRef, useState, useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2, CircleDashed, Download, Loader2, Pencil, Plus, Trash2, X,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NumberInput } from "@/components/ui/number-input";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { approveBudget, deleteBudget, updateBudgetItems, type BudgetWithItems } from "@/lib/actions/budget";
import type { CoaAccount } from "@/lib/chart-of-accounts";
import { CreateAccountDrawer } from "@/components/chart-of-accounts/create-account-drawer";

const FUND_LABEL: Record<string, string> = {
  administrative: "Administrative Fund",
  capital_works: "Capital Works Fund",
  maintenance_plan: "Maintenance Plan Fund",
};

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n);

// Single-fund variant of the budget create form's combobox.
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
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => {
    function clickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) onCancel();
    }
    document.addEventListener("mousedown", clickOutside);
    return () => document.removeEventListener("mousedown", clickOutside);
  }, [onCancel]);

  const q = query.toLowerCase();
  const filtered = accounts.filter(
    (a) => !usedAccountIds.includes(a.id) && (a.code.includes(q) || a.name.toLowerCase().includes(q)),
  );

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") { onCancel(); return; }
    if (e.key === "Enter") {
      e.preventDefault();
      if (filtered.length === 1) { onSelect(filtered[0]); setQuery(""); }
      else if (query.trim()) onRequestCreate(query.trim());
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <Input
        ref={inputRef}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Search code or account name…"
        className="h-8 text-sm"
      />
      <div className="absolute top-full left-0 right-0 mt-1 z-50 max-h-56 overflow-y-auto rounded-lg border border-border bg-popover shadow-md">
        {filtered.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => { onSelect(a); setQuery(""); }}
            className="flex w-full items-center justify-between px-3 py-2 text-sm text-foreground hover:bg-accent cursor-pointer"
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
      </div>
    </div>
  );
}

interface DraftItem {
  id?: string; // present for items loaded from DB; absent for new rows
  coa_account_id: string | null;
  category_id: string | null;
  description: string;
  amount: string;
}

export function BudgetDetailContent({
  ocCode, ocId, budget, accounts,
}: {
  ocCode: string;
  ocId: string;
  budget: BudgetWithItems;
  accounts: CoaAccount[];
}) {
  const router = useRouter();
  const isDraft = budget.status === "draft";
  const fundLabel = FUND_LABEL[budget.fund_type] ?? budget.fund_type;
  void ocId;

  const [editing, setEditing] = useState(false);
  // Saved snapshot we restore to when the user hits Cancel. Built once from
  // the server-supplied budget and refreshed after every successful save.
  const buildSnapshot = useCallback((source: BudgetWithItems): DraftItem[] =>
    source.items.map((it) => ({
      id: it.id,
      coa_account_id: it.coa_account_id,
      category_id: it.category_id,
      description: it.description || it.category_name,
      amount: String(it.amount),
    })),
  []);
  const savedItemsRef = useRef<DraftItem[]>(buildSnapshot(budget));
  const [items, setItems] = useState<DraftItem[]>(savedItemsRef.current);
  const [comboOpen, setComboOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerSeedName, setDrawerSeedName] = useState("");
  const [allAccounts, setAllAccounts] = useState<CoaAccount[]>(accounts);
  const [savePending, setSavePending] = useState(false);

  const [approveOpen, setApproveOpen] = useState(false);
  const [approveNote, setApproveNote] = useState("");
  const [approving, setApproving] = useState(false);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const accountById = new Map(allAccounts.map((a) => [a.id, a]));

  const total = items.reduce((s, it) => s + (parseFloat(it.amount) || 0), 0);

  const addItem = useCallback((account: CoaAccount) => {
    setItems((prev) => [
      ...prev,
      { coa_account_id: account.id, category_id: null, description: account.name, amount: "" },
    ]);
    setComboOpen(false);
  }, []);

  function removeRow(i: number) {
    setItems((prev) => prev.filter((_, idx) => idx !== i));
  }
  function updateAmount(i: number, v: string) {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, amount: v } : it)));
  }

  async function handleSave() {
    setSavePending(true);
    const payload = items
      .map((it) => ({
        coa_account_id: it.coa_account_id,
        category_id: it.category_id,
        description: it.description,
        amount: parseFloat(it.amount) || 0,
      }))
      .filter((it) => it.amount > 0 && (it.coa_account_id || it.category_id));
    if (payload.length === 0) {
      setSavePending(false);
      toast.error("Add at least one item with an amount.");
      return;
    }
    const res = await updateBudgetItems(budget.id, payload);
    setSavePending(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success("Budget updated");
    // Promote the just-saved state to the snapshot so a subsequent Cancel
    // restores back to here (not back to the original server load).
    savedItemsRef.current = items.map((it) => ({ ...it }));
    setEditing(false);
    router.refresh();
  }

  function handleCancelEdit() {
    // Restore the last-saved snapshot so the user's in-progress edits don't
    // linger on the page. Deep-clone so the user can edit again without
    // mutating the snapshot.
    setItems(savedItemsRef.current.map((it) => ({ ...it })));
    setComboOpen(false);
    setEditing(false);
  }

  async function handleApprove() {
    setApproving(true);
    const res = await approveBudget(budget.oc_id, budget.id, approveNote);
    if (res.error) {
      setApproving(false);
      toast.error(res.error);
      return;
    }
    toast.success("Budget approved");
    setApproveOpen(false);
    router.refresh();
  }

  async function handleDelete() {
    setDeleting(true);
    const res = await deleteBudget(budget.id);
    if (res.error) {
      setDeleting(false);
      toast.error(res.error);
      return;
    }
    toast.success("Budget deleted");
    router.push(`/ocs/${ocCode}/budgets`);
  }

  // Fetch the PDF as a blob so the browser drops it straight into Downloads
  // instead of navigating to the API URL. Same UX as the CSV export.
  const [pdfPending, startPdf] = useTransition();
  function downloadPdf() {
    startPdf(async () => {
      try {
        const res = await fetch(`/api/budgets/${budget.id}/pdf`);
        if (!res.ok) {
          toast.error("Couldn't download the PDF , please try again.");
          return;
        }
        const blob = await res.blob();
        const filename = `budget-${budget.fund_type}-${budget.financial_year}.pdf`;
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (err) {
        console.error("Budget PDF download failed", err);
        toast.error("Couldn't download the PDF , please try again.");
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          {isDraft ? (
            <CircleDashed className="h-5 w-5 text-muted-foreground" />
          ) : (
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          )}
          <div>
            <h1 className="text-lg font-semibold text-foreground">
              {fundLabel} <span className="text-muted-foreground font-normal">, {budget.financial_year}</span>
            </h1>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Badge variant={isDraft ? "warning" : "success"}>{isDraft ? "Draft" : "Approved"}</Badge>
              {budget.approved_at && <span>Approved {new Date(budget.approved_at).toLocaleDateString("en-AU")}</span>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={downloadPdf} disabled={pdfPending}>
            {pdfPending ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
            Download PDF
          </Button>
          {isDraft && !editing && (
            <Button variant="secondary" onClick={() => setEditing(true)}>
              <Pencil className="size-4" />
              Edit items
            </Button>
          )}
          {isDraft && !editing && (
            <Button onClick={() => { setApproveNote(""); setApproveOpen(true); }}>
              <CheckCircle2 className="size-4" />
              Approve
            </Button>
          )}
          {isDraft && !editing && (
            <Button
              variant="secondary"
              onClick={() => setDeleteOpen(true)}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="size-4" />
              Delete
            </Button>
          )}
        </div>
      </div>

      {budget.approval_note && !isDraft && (
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Approval note</p>
            <p className="mt-1 text-sm text-foreground">{budget.approval_note}</p>
          </CardContent>
        </Card>
      )}

      {/* Items */}
      <Card>
        <CardContent className="pt-5">
          <div className="overflow-hidden rounded-lg border border-border">
            <Table variant="bordered" className="text-sm">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-28">Account code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead className="w-[220px]">Annual amount</TableHead>
                  {editing && <TableHead className="w-12" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item, i) => {
                  const account = item.coa_account_id ? accountById.get(item.coa_account_id) : null;
                  return (
                    <TableRow key={i}>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {account?.code ?? ""}
                      </TableCell>
                      <TableCell className="text-sm text-foreground">
                        {item.description}
                      </TableCell>
                      <TableCell>
                        {editing ? (
                          <NumberInput
                            value={item.amount}
                            onChange={(v) => updateAmount(i, v)}
                            thousandsSeparator
                            prefix="$"
                            placeholder="Annual amount"
                          />
                        ) : (
                          <span className="tabular-nums text-foreground">{formatCurrency(parseFloat(item.amount) || 0)}</span>
                        )}
                      </TableCell>
                      {editing && (
                        <TableCell>
                          <button
                            type="button"
                            onClick={() => removeRow(i)}
                            className="text-muted-foreground hover:text-destructive cursor-pointer"
                            aria-label="Remove item"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell />
                  <TableCell className="text-sm font-semibold text-foreground">Total annual</TableCell>
                  <TableCell className="text-sm font-bold tabular-nums text-foreground">{formatCurrency(total)}</TableCell>
                  {editing && <TableCell />}
                </TableRow>
              </TableFooter>
            </Table>
          </div>

          {editing && (
            <div className="mt-3 space-y-2">
              {comboOpen ? (
                <AccountCombobox
                  accounts={allAccounts}
                  usedAccountIds={items.map((i) => i.coa_account_id).filter((x): x is string => !!x)}
                  onSelect={addItem}
                  onCancel={() => setComboOpen(false)}
                  onRequestCreate={(seed) => { setDrawerSeedName(seed); setDrawerOpen(true); }}
                />
              ) : (
                <div className="flex items-center gap-3">
                  <Button type="button" variant="secondary" size="sm" onClick={() => setComboOpen(true)}>
                    <Plus className="mr-1.5 h-3.5 w-3.5" />
                    Add item
                  </Button>
                  <button
                    type="button"
                    onClick={() => { setDrawerSeedName(""); setDrawerOpen(true); }}
                    className="text-sm font-medium text-[color:var(--brand-gold)] hover:underline cursor-pointer"
                  >
                    Add account
                  </button>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 border-t border-border pt-3">
                <Button variant="secondary" onClick={handleCancelEdit} disabled={savePending}>
                  Cancel
                </Button>
                <Button onClick={handleSave} disabled={savePending}>
                  {savePending && <Loader2 className="size-4 animate-spin" />}
                  Save changes
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Approve dialog */}
      <Dialog open={approveOpen} onOpenChange={(o) => { if (!approving) setApproveOpen(o); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Approve this budget?</DialogTitle>
            <DialogDescription>
              Approving locks the budget so levies can be generated from it. Add a note if useful, e.g. the meeting it was adopted at.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="approve-note">Note</Label>
            <Textarea
              id="approve-note"
              value={approveNote}
              onChange={(e) => setApproveNote(e.target.value)}
              placeholder="Adopted at the AGM held on…"
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setApproveOpen(false)} disabled={approving}>
              Cancel
            </Button>
            <Button onClick={handleApprove} disabled={approving}>
              {approving && <Loader2 className="size-4 animate-spin" />}
              Approve budget
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={deleteOpen} onOpenChange={(o) => { if (!deleting) setDeleteOpen(o); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete this budget?</DialogTitle>
            <DialogDescription>
              The {fundLabel} budget for {budget.financial_year} will be removed along with all its items.
              This can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDeleteOpen(false)} disabled={deleting}>Cancel</Button>
            <Button
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="size-4 animate-spin" />}
              Delete budget
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CreateAccountDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        lockedType="expense"
        initialName={drawerSeedName}
        onCreated={(account) => {
          setAllAccounts((prev) => [...prev, account]);
          addItem(account);
        }}
      />
    </div>
  );
}
