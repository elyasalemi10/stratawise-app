"use client";

import { useCallback, useMemo, useState } from "react";
import { Plus, Download } from "lucide-react";
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
  GST_TREATMENT_OPTIONS,
  type CoaAccount, type CoaAccountType, type CoaGstTreatment,
} from "@/lib/chart-of-accounts";
import { updateCoaAccount, setCoaAccountActive } from "@/lib/actions/chart-of-accounts";
import { NumberInput } from "@/components/ui/number-input";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { CreateAccountDrawer } from "@/components/chart-of-accounts/create-account-drawer";

const TYPE_BADGE: Record<CoaAccountType, string> = {
  asset: "bg-info-muted text-info-foreground border-info/25",
  liability: "bg-rose-50 text-rose-700 border-rose-200",
  equity: "bg-violet-50 text-violet-700 border-violet-200",
  income: "bg-success-muted text-success-foreground border-success/25",
  expense: "bg-warning-muted text-warning-foreground border-warning/25",
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
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [createDrawerOpen, setCreateDrawerOpen] = useState(false);

  // One row changed. Re-sort because the code is editable and the list is
  // ordered by it.
  const patchAccount = useCallback((updated: CoaAccount) => {
    setAccounts((prev) =>
      prev
        .map((a) => (a.id === updated.id ? updated : a))
        .sort((x, y) => x.code.localeCompare(y.code)),
    );
  }, []);

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
      {/* Minimal banded legend , the number sells the meaning by itself. */}
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
        <span><strong className="text-foreground">1000s</strong> Assets</span>
        <span><strong className="text-foreground">2000s</strong> Liabilities</span>
        <span><strong className="text-foreground">3000s</strong> Equity</span>
        <span><strong className="text-foreground">4000s</strong> Income</span>
        <span><strong className="text-foreground">5000s &amp; 6000s</strong> Expenses</span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
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
        <div className="ml-auto" />
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
          illustration="documents"
          title="No accounts match"
          description={query || typeFilter !== "all" || statusFilter !== "all" ? "Try clearing the filters." : "Add your first account to get started."}
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <Table variant="striped">
            <TableHeader>
              <TableRow>
                <TableHead className="w-28">Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="w-44">Type</TableHead>
                <TableHead className="w-52">GST treatment</TableHead>
                <TableHead className="w-20 text-right">Active</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((a) => (
                <AccountRow key={a.id} account={a} onChanged={patchAccount} />
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <CreateAccountDrawer
        open={createDrawerOpen}
        onOpenChange={setCreateDrawerOpen}
        onCreated={(account) => setAccounts((prev) => [...prev, account].sort((a, b) => a.code.localeCompare(b.code)))}
      />

    </div>
  );
}

// One account, editable in place.
//
// Every field on this row is a control, not a label with a pencil beside it.
// A five-field row does not need a second surface showing the same five
// fields: the drawer that used to open on row click cost a click to see what
// was already on screen, and another to get back.
//
// Text fields save when you leave them and only if they changed; the two
// selects and the switch save the moment you pick, because there is no
// intermediate state to leave. A refusal puts the old value back rather than
// leaving the row showing something the server declined.
function AccountRow({
  account,
  onChanged,
}: {
  account: CoaAccount;
  onChanged: (next: CoaAccount) => void;
}) {
  const [code, setCode] = useState(account.code);
  const [name, setName] = useState(account.name);
  const [codeInvalid, setCodeInvalid] = useState(false);
  const [nameInvalid, setNameInvalid] = useState(false);
  const [saving, setSaving] = useState(false);
  const [active, setActive] = useState(!account.archived_at);

  // Fundamental accounts are wired into platform code paths by role, so the
  // server refuses edits. Showing live controls that always fail would be a
  // lie; the row reads as text instead.
  const locked = account.is_fundamental;

  async function save(patch: Partial<Pick<CoaAccount, "code" | "name" | "account_type" | "gst_treatment">>, revert: () => void) {
    setSaving(true);
    const res = await updateCoaAccount({
      id: account.id,
      code: patch.code ?? code,
      name: patch.name ?? name,
      account_type: patch.account_type ?? account.account_type,
      gst_treatment: patch.gst_treatment ?? account.gst_treatment,
    });
    setSaving(false);
    if (res.error || !res.account) {
      revert();
      toast.error(res.error ?? "Could not save changes");
      return;
    }
    onChanged(res.account);
    toast.success(`${res.account.code} saved`);
  }

  async function toggleActive(next: boolean) {
    setActive(next);
    const res = await setCoaAccountActive(account.id, next);
    if (res.error) {
      setActive(!next);
      toast.error(res.error);
      return;
    }
    onChanged({ ...account, archived_at: next ? null : new Date().toISOString() });
    toast.success(next ? `${account.code} activated` : `${account.code} deactivated`);
  }

  if (locked) {
    return (
      <TableRow>
        <TableCell className="font-mono text-xs">{account.code}</TableCell>
        <TableCell className="text-sm text-foreground">{account.name}</TableCell>
        <TableCell>
          <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${TYPE_BADGE[account.account_type]}`}>
            {ACCOUNT_TYPE_LABEL[account.account_type]}
          </span>
        </TableCell>
        <TableCell className="text-sm text-muted-foreground">
          {GST_TREATMENT_LABEL[account.gst_treatment]}
        </TableCell>
        <TableCell className="text-right">
          <Switch checked disabled aria-label="Required by the platform" />
        </TableCell>
      </TableRow>
    );
  }

  return (
    <TableRow>
      <TableCell>
        <NumberInput
          value={code}
          onChange={(v) => { setCode(v); if (codeInvalid) setCodeInvalid(false); }}
          onBlur={() => {
            const next = code.trim();
            if (next === account.code) return;
            if (!/^[0-9]{4}$/.test(next)) {
              setCodeInvalid(true);
              toast.error("Code must be exactly 4 digits.");
              return;
            }
            save({ code: next }, () => { setCode(account.code); setCodeInvalid(true); });
          }}
          allowDecimal={false}
          maxLength={4}
          invalid={codeInvalid}
          disabled={saving}
          className="h-8 w-20 font-mono"
          placeholder="Code"
        />
      </TableCell>
      <TableCell>
        <Input
          value={name}
          onChange={(e) => { setName(e.target.value); if (nameInvalid) setNameInvalid(false); }}
          onBlur={() => {
            const next = name.trim();
            if (next === account.name) return;
            if (!next) {
              setNameInvalid(true);
              toast.error("Name is required.");
              return;
            }
            save({ name: next }, () => { setName(account.name); setNameInvalid(true); });
          }}
          aria-invalid={nameInvalid || undefined}
          disabled={saving}
          className="h-8"
          placeholder="Account name"
        />
      </TableCell>
      <TableCell>
        <Select
          value={account.account_type}
          onValueChange={(v) => {
            const next = (v ?? account.account_type) as CoaAccountType;
            if (next === account.account_type) return;
            save({ account_type: next }, () => {});
          }}
          disabled={saving}
        >
          <SelectTrigger className="h-8 w-full">
            <SelectValue>{ACCOUNT_TYPE_LABEL[account.account_type]}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {ACCOUNT_TYPE_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <Select
          value={account.gst_treatment}
          onValueChange={(v) => {
            const next = (v ?? account.gst_treatment) as CoaGstTreatment;
            if (next === account.gst_treatment) return;
            save({ gst_treatment: next }, () => {});
          }}
          disabled={saving}
        >
          <SelectTrigger className="h-8 w-full">
            <SelectValue>{GST_TREATMENT_LABEL[account.gst_treatment]}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {GST_TREATMENT_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell className="text-right">
        <Switch
          checked={active}
          onCheckedChange={(v) => toggleActive(v === true)}
          aria-label={`${account.name} active`}
        />
      </TableCell>
    </TableRow>
  );
}
