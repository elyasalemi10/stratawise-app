"use client";

import { useMemo, useState } from "react";
import { Plus, BookOpen, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/shared/empty-state";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ACCOUNT_TYPE_LABEL, ACCOUNT_TYPE_OPTIONS, GST_TREATMENT_LABEL,
  type CoaAccount, type CoaAccountType,
} from "@/lib/chart-of-accounts";
import { CreateAccountDrawer } from "@/components/chart-of-accounts/create-account-drawer";
import { AccountDetailDrawer } from "@/components/chart-of-accounts/account-detail-drawer";

const TYPE_BADGE: Record<CoaAccountType, string> = {
  asset: "bg-blue-50 text-blue-700 border-blue-200",
  liability: "bg-rose-50 text-rose-700 border-rose-200",
  equity: "bg-violet-50 text-violet-700 border-violet-200",
  income: "bg-emerald-50 text-emerald-700 border-emerald-200",
  expense: "bg-amber-50 text-amber-700 border-amber-200",
};

function downloadCsv(rows: CoaAccount[]) {
  const header = ["Code", "Name", "Type", "GST treatment", "Status"];
  const lines = [header.join(",")];
  for (const a of rows) {
    const cells = [
      a.code,
      a.name,
      ACCOUNT_TYPE_LABEL[a.account_type],
      GST_TREATMENT_LABEL[a.gst_treatment],
      a.archived_at ? "Inactive" : "Active",
    ].map((v) => {
      const s = String(v ?? "");
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    });
    lines.push(cells.join(","));
  }
  const blob = new Blob([lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const stamp = new Date().toISOString().slice(0, 10);
  a.download = `chart-of-accounts-${stamp}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function ChartOfAccountsContent({ initialAccounts }: { initialAccounts: CoaAccount[] }) {
  const [accounts, setAccounts] = useState<CoaAccount[]>(initialAccounts);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<CoaAccountType | "all">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("active");
  const [createDrawerOpen, setCreateDrawerOpen] = useState(false);
  // Account currently shown in the detail drawer (null = closed).
  const [openAccount, setOpenAccount] = useState<CoaAccount | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return accounts
      .filter((a) => {
        if (statusFilter === "active") return !a.archived_at;
        if (statusFilter === "inactive") return !!a.archived_at;
        return true;
      })
      .filter((a) => typeFilter === "all" || a.account_type === typeFilter)
      .filter((a) => {
        if (!q) return true;
        return a.code.includes(q) || a.name.toLowerCase().includes(q);
      });
  }, [accounts, query, typeFilter, statusFilter]);

  return (
    <div className="space-y-6">
      {/* Top explainer (replaces the old multi-table layout) */}
      <div className="rounded-md border border-border bg-card p-4 text-sm text-muted-foreground">
        <p>
          Your firm&apos;s general-ledger accounts. The number band tells you where
          each account sits on your reports: <strong>1000s</strong> are assets,
          <strong> 2000s</strong> liabilities, <strong>3000s</strong> member funds
          / equity, <strong>4000s</strong> income, <strong>5000s &amp; 6000s</strong>{" "}
          expenses. Built-in accounts are required by the platform and can&apos;t
          be deactivated. Click a row to view or edit an account.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search code or name"
          className="w-48"
        />
        <Select value={typeFilter} onValueChange={(v) => setTypeFilter((v as CoaAccountType | "all") ?? "all")}>
          <SelectTrigger className="w-40">
            <SelectValue>{typeFilter === "all" ? "All types" : ACCOUNT_TYPE_LABEL[typeFilter]}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {ACCOUNT_TYPE_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter((v as "all" | "active" | "inactive") ?? "active")}>
          <SelectTrigger className="w-36">
            <SelectValue>
              {statusFilter === "all" ? "All status" : statusFilter === "active" ? "Active" : "Inactive"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
            <SelectItem value="all">All status</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="secondary" onClick={() => downloadCsv(filtered)} disabled={filtered.length === 0}>
          <Download className="size-4" />
          Export CSV
        </Button>
        <Button onClick={() => setCreateDrawerOpen(true)}>
          <Plus className="size-4" />
          Add account
        </Button>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="No accounts match"
          description={query || typeFilter !== "all" || statusFilter !== "active" ? "Try clearing the filters." : "Add your first account to get started."}
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <Table variant="striped">
            <TableHeader>
              <TableRow>
                <TableHead className="w-24">Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="w-28">Type</TableHead>
                <TableHead className="w-40">GST treatment</TableHead>
                <TableHead className="w-24">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((a) => {
                const active = !a.archived_at;
                return (
                  <TableRow
                    key={a.id}
                    onClick={() => setOpenAccount(a)}
                    className={`cursor-pointer ${active ? "" : "opacity-60"}`}
                  >
                    <TableCell className="font-mono text-xs">{a.code}</TableCell>
                    <TableCell className="text-sm text-foreground">{a.name}</TableCell>
                    <TableCell>
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${TYPE_BADGE[a.account_type]}`}>
                        {ACCOUNT_TYPE_LABEL[a.account_type]}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {GST_TREATMENT_LABEL[a.gst_treatment]}
                    </TableCell>
                    <TableCell className="text-xs">
                      {active ? (
                        <span className="text-emerald-700">Active</span>
                      ) : (
                        <span className="text-muted-foreground">Inactive</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <CreateAccountDrawer
        open={createDrawerOpen}
        onOpenChange={setCreateDrawerOpen}
        onCreated={(account) => setAccounts((prev) => [...prev, account].sort((a, b) => a.code.localeCompare(b.code)))}
      />

      <AccountDetailDrawer
        account={openAccount}
        onOpenChange={(open) => { if (!open) setOpenAccount(null); }}
        onAccountUpdated={(updated) => {
          setAccounts((prev) =>
            prev.map((a) => (a.id === updated.id ? updated : a))
              .sort((a, b) => a.code.localeCompare(b.code)),
          );
        }}
        onAccountActiveChanged={(id, archivedAt) => {
          setAccounts((prev) =>
            prev.map((a) => (a.id === id ? { ...a, archived_at: archivedAt } : a)),
          );
          // If the open account got toggled, mirror the change in the drawer
          // so the Switch stays correct without re-fetching.
          setOpenAccount((prev) => (prev && prev.id === id ? { ...prev, archived_at: archivedAt } : prev));
        }}
      />
    </div>
  );
}
