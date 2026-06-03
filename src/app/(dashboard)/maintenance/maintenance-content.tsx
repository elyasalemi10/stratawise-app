"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Wrench, Loader2, Plus, Search, Trash2, Upload, FileText, Pause, Play,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { NumberInput } from "@/components/ui/number-input";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/shared/date-picker";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList,
} from "@/components/ui/combobox";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter,
} from "@/components/ui/sheet";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/shared/empty-state";
import { ContractorDrawer, type CreatedContractor } from "../contractors/contractors-content";
import {
  createRecurringJob, updateRecurringJob, deleteRecurringJob, setRecurringJobStatus,
  getOCNotifyOwners, getRecurringJobNotifyTargets, getRecurringJobDocuments,
  uploadRecurringJobDocument, deleteRecurringJobDocument,
  type OCSelectOption, type NotifyOwnerOption, type RecurringJobDoc,
} from "@/lib/actions/recurring-jobs";
import {
  RECURRING_FREQUENCY_OPTIONS, RECURRING_FREQUENCY_LABELS,
  RECURRING_JOB_STATUS_LABELS, type RecurringJobRecord, type RecurringFrequency,
} from "@/lib/validations/recurring-jobs";
import {
  CONTRACTOR_TRADE_OPTIONS, tradeLabel,
} from "@/lib/validations/contractors";

const FUND_LABELS: Record<string, string> = {
  administrative: "Administrative fund",
  capital_works: "Capital works fund",
};

function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString("en-AU", {
    day: "numeric", month: "short", year: "numeric",
  });
}
function formatMoney(n: number | null): string {
  if (n == null) return "";
  return `$${n.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

type ContractorOption = {
  id: string;
  business_name: string;
  trade: string | null;
  contact_name?: string | null;
  contact_phone?: string | null;
  contact_email?: string | null;
};

export function MaintenanceContent({
  jobs,
  ocs,
  contractors,
  fixedOcId,
}: {
  jobs: RecurringJobRecord[];
  ocs: OCSelectOption[];
  contractors: ContractorOption[];
  // When set (per-OC maintenance page), the OC is locked to this one and the
  // OC combobox is hidden.
  fixedOcId?: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<RecurringJobRecord | null>(null);

  // Contractor list is held locally so a contractor created from the job
  // drawer can be appended + auto-selected without a full refresh (which would
  // reset the open job drawer).
  const [contractorList, setContractorList] = useState<ContractorOption[]>(contractors);
  useEffect(() => { setContractorList(contractors); }, [contractors]);
  const [contractorDrawerOpen, setContractorDrawerOpen] = useState(false);
  const [contractorKey, setContractorKey] = useState(0);
  const [selectContractorId, setSelectContractorId] = useState<string | null>(null);

  function openContractorDrawer() {
    setContractorKey((k) => k + 1);
    setContractorDrawerOpen(true);
  }

  function onContractorCreated(created?: CreatedContractor) {
    setContractorDrawerOpen(false);
    if (created) {
      setContractorList((prev) => prev.some((c) => c.id === created.id) ? prev : [...prev, created]);
      setSelectContractorId(created.id);
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return jobs;
    return jobs.filter((j) =>
      [j.title, j.oc_name, j.contractor_name, tradeLabel(j.trade), j.reference_number]
        .some((v) => (v ?? "").toLowerCase().includes(q)),
    );
  }, [jobs, query]);

  function openAdd() { setEditing(null); setDrawerOpen(true); }
  function openEdit(j: RecurringJobRecord) { setEditing(j); setDrawerOpen(true); }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <p className="text-sm text-muted-foreground">
            {jobs.length} recurring job{jobs.length === 1 ? "" : "s"}
          </p>
          {jobs.length > 0 && (
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search jobs"
                className="h-9 w-64 pl-7"
              />
            </div>
          )}
        </div>
        {jobs.length > 0 && (
          <Button onClick={openAdd} className="cursor-pointer">
            <Plus className="mr-2 h-4 w-4" />
            New recurring job
          </Button>
        )}
      </div>

      {jobs.length === 0 ? (
        <EmptyState
          icon={Wrench}
          title="No recurring jobs yet"
          description="Set up recurring maintenance (lift servicing, fire testing, gardening) once and let it run across the right OC on schedule."
          action={
            <Button onClick={openAdd}>
              <Plus className="mr-2 h-4 w-4" />
              New recurring job
            </Button>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <Table variant="striped">
            <TableHeader>
              <TableRow>
                <TableHead>Job</TableHead>
                {!fixedOcId && <TableHead>OC</TableHead>}
                <TableHead>Contractor</TableHead>
                <TableHead>Frequency</TableHead>
                <TableHead>Next due</TableHead>
                <TableHead className="text-right">Cost / visit</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((j) => (
                <TableRow key={j.id} className="cursor-pointer" onClick={() => openEdit(j)}>
                  <TableCell className="font-medium text-foreground">
                    {j.title}
                    {j.trade && <span className="ml-2 text-xs text-muted-foreground">{tradeLabel(j.trade)}</span>}
                  </TableCell>
                  {!fixedOcId && <TableCell>{j.oc_name}</TableCell>}
                  <TableCell>{j.contractor_name}</TableCell>
                  <TableCell>{RECURRING_FREQUENCY_LABELS[j.frequency]}</TableCell>
                  <TableCell>{formatDate(j.next_occurrence_date)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMoney(j.cost_per_visit)}</TableCell>
                  <TableCell>
                    <Badge variant={j.status === "active" ? "success" : "neutral"} className="rounded-full">
                      {RECURRING_JOB_STATUS_LABELS[j.status]}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={fixedOcId ? 6 : 7} className="py-8 text-center text-sm text-muted-foreground">
                    No jobs match your search.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <RecurringJobDrawer
        key={editing?.id ?? "new"}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        editing={editing}
        ocs={ocs}
        fixedOcId={fixedOcId}
        contractors={contractorList}
        selectContractorId={selectContractorId}
        onContractorSelected={() => setSelectContractorId(null)}
        onRequestCreateContractor={openContractorDrawer}
        onSaved={() => { setDrawerOpen(false); router.refresh(); }}
      />

      {/* Lifted to the page level so it stacks above the job drawer and its
          overlay-dismiss closes only itself, leaving the job drawer open. */}
      <ContractorDrawer
        key={contractorKey}
        open={contractorDrawerOpen}
        onOpenChange={setContractorDrawerOpen}
        editing={null}
        onSaved={onContractorCreated}
      />
    </div>
  );
}

function RecurringJobDrawer({
  open,
  onOpenChange,
  editing,
  ocs,
  fixedOcId,
  contractors,
  selectContractorId,
  onContractorSelected,
  onRequestCreateContractor,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  editing: RecurringJobRecord | null;
  ocs: OCSelectOption[];
  fixedOcId?: string;
  contractors: ContractorOption[];
  selectContractorId: string | null;
  onContractorSelected: () => void;
  onRequestCreateContractor: () => void;
  onSaved: () => void;
}) {
  const [ocId, setOcId] = useState(editing?.oc_id ?? fixedOcId ?? "");
  const [contractorId, setContractorId] = useState(editing?.contractor_id ?? "");
  const [title, setTitle] = useState(editing?.title ?? "");
  const [trade, setTrade] = useState(editing?.trade ?? "");
  const [frequency, setFrequency] = useState<RecurringFrequency>(editing?.frequency ?? "quarterly");
  const [startDate, setStartDate] = useState(editing?.start_date ?? "");
  const [ongoing, setOngoing] = useState(editing ? !editing.end_date : true);
  const [endDate, setEndDate] = useState(editing?.end_date ?? "");
  const [fundType, setFundType] = useState(editing?.fund_type ?? "");
  const [notifyScope, setNotifyScope] = useState<"all_owners" | "specific" | "none">(editing?.notify_scope ?? "none");
  const [notifyOwnerIds, setNotifyOwnerIds] = useState<Set<string>>(new Set());
  const [leadTime, setLeadTime] = useState(editing ? String(editing.lead_time_days) : "0");
  const [scope, setScope] = useState(editing?.scope ?? "");
  const [costPerVisit, setCostPerVisit] = useState(editing?.cost_per_visit != null ? String(editing.cost_per_visit) : "");
  const [approvalRef] = useState(editing?.approval_reference ?? "");

  const [owners, setOwners] = useState<NotifyOwnerOption[]>([]);
  const [loadingOwners, setLoadingOwners] = useState(false);
  const [docs, setDocs] = useState<RecurringJobDoc[]>([]);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]); // queued before a new job exists
  const [uploading, setUploading] = useState(false);

  const [invalid, setInvalid] = useState<Record<string, boolean>>({});
  const [pending, startTransition] = useTransition();
  const clearInvalid = (f: string) => setInvalid((p) => (p[f] ? { ...p, [f]: false } : p));

  // A contractor was just created from the lifted drawer , select it here.
  useEffect(() => {
    if (selectContractorId) {
      setContractorId(selectContractorId);
      onContractorSelected();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectContractorId]);

  // Load owners whenever an OC is chosen (used for the specific-notify list).
  useEffect(() => {
    if (!ocId) { setOwners([]); return; }
    let cancelled = false;
    setLoadingOwners(true);
    getOCNotifyOwners(ocId)
      .then((list) => { if (!cancelled) setOwners(list); })
      .catch(() => { if (!cancelled) setOwners([]); })
      .finally(() => { if (!cancelled) setLoadingOwners(false); });
    return () => { cancelled = true; };
  }, [ocId]);

  // Load existing notify targets + documents for an existing job.
  useEffect(() => {
    if (!editing) return;
    getRecurringJobNotifyTargets(editing.id).then((ids) => setNotifyOwnerIds(new Set(ids))).catch(() => {});
    getRecurringJobDocuments(editing.id).then(setDocs).catch(() => {});
  }, [editing]);

  function toggleOwner(id: string, checked: boolean) {
    setNotifyOwnerIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  }

  async function onUploadDoc(file: File) {
    if (!editing) {
      // New job doesn't exist yet , queue the file; uploaded after create.
      setPendingFiles((p) => [...p, file]);
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await uploadRecurringJobDocument(editing.id, fd);
      if (res.error) { toast.error(res.error); return; }
      setDocs((d) => [{ id: res.docId!, file_name: res.file_name!, created_at: new Date().toISOString() }, ...d]);
    } finally {
      setUploading(false);
    }
  }

  function onSubmit() {
    const problems: string[] = [];
    const nextInvalid: Record<string, boolean> = {};
    if (!ocId) { problems.push("Pick an OC."); nextInvalid.ocId = true; }
    if (!title.trim()) { problems.push("Job title is required."); nextInvalid.title = true; }
    if (!startDate) { problems.push("Start date is required."); nextInvalid.startDate = true; }
    if (!ongoing && endDate && startDate && endDate < startDate) {
      problems.push("End date can't be before the start date."); nextInvalid.endDate = true;
    }
    if (problems.length) {
      setInvalid(nextInvalid);
      toast.error(problems.length === 1 ? problems[0] : "Fix the highlighted fields.");
      return;
    }

    const cost = costPerVisit.trim() ? parseFloat(costPerVisit) : null;
    const lead = leadTime.trim() ? parseInt(leadTime, 10) : 0;
    const payload = {
      oc_id: ocId,
      title: title.trim(),
      trade: trade || null,
      contractor_id: contractorId || null,
      frequency,
      start_date: startDate,
      end_date: ongoing ? null : (endDate || null),
      lead_time_days: Number.isFinite(lead) ? lead : 0,
      notify_scope: notifyScope,
      notify_lot_owner_ids: notifyScope === "specific" ? Array.from(notifyOwnerIds) : [],
      scope: scope.trim() || null,
      cost_per_visit: cost != null && Number.isFinite(cost) ? cost : null,
      fund_type: (fundType || null) as "administrative" | "capital_works" | null,
      approval_reference: approvalRef.trim() || null,
      status: editing?.status ?? "active",
    };

    startTransition(async () => {
      if (editing) {
        const res = await updateRecurringJob(editing.id, payload);
        if (res.error) { toast.error(res.error); return; }
        toast.success("Recurring job updated");
        onSaved();
        return;
      }
      const res = await createRecurringJob(payload);
      if (res.error || !res.jobId) { toast.error(res.error ?? "Could not create job"); return; }
      // Upload any documents queued before the job existed.
      for (const f of pendingFiles) {
        const fd = new FormData();
        fd.append("file", f);
        await uploadRecurringJobDocument(res.jobId, fd);
      }
      toast.success("Recurring job created");
      onSaved();
    });
  }

  const selectedOc = ocs.find((o) => o.id === ocId);
  const selectedContractor = contractors.find((c) => c.id === contractorId);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{editing ? "Edit recurring job" : "New recurring job"}</SheetTitle>
          <SheetDescription>Set it up once; it runs for the chosen OC on schedule.</SheetDescription>
        </SheetHeader>

        <div className="space-y-5 px-4 pb-4">
          {/* OC (hidden + locked on the per-OC maintenance page) */}
          {!fixedOcId && (
            <div className="space-y-1.5">
              <Label>Owners Corporation <span className="text-destructive">*</span></Label>
              <Combobox items={ocs} value={ocId} onValueChange={(v) => { setOcId(v ?? ""); clearInvalid("ocId"); }}>
                <ComboboxInput placeholder="Pick an OC" aria-invalid={invalid.ocId || undefined} />
                <ComboboxContent>
                  <ComboboxEmpty>No OCs found.</ComboboxEmpty>
                  <ComboboxList>
                    {(o: OCSelectOption) => (
                      <ComboboxItem key={o.id} value={o.id} keywords={[o.name, o.short_code]}>
                        {o.name}
                      </ComboboxItem>
                    )}
                  </ComboboxList>
                </ComboboxContent>
              </Combobox>
              {selectedOc && <span className="hidden">{selectedOc.name}</span>}
            </div>
          )}

          {/* Contractor */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>Contractor</Label>
              <button
                type="button"
                onClick={onRequestCreateContractor}
                className="cursor-pointer text-xs font-medium text-primary hover:underline"
              >
                + Create contractor
              </button>
            </div>
            <Combobox items={contractors} value={contractorId} onValueChange={(v) => setContractorId(v ?? "")}>
              <ComboboxInput placeholder={selectedContractor?.business_name ?? "Pick a contractor"} />
              <ComboboxContent>
                <ComboboxEmpty>No contractors yet.</ComboboxEmpty>
                <ComboboxList>
                  {(c: ContractorOption) => (
                    <ComboboxItem
                      key={c.id}
                      value={c.id}
                      keywords={[c.business_name, tradeLabel(c.trade), c.contact_name ?? "", c.contact_phone ?? "", c.contact_email ?? ""]}
                    >
                      {c.business_name}
                      {c.trade && <span className="ml-2 text-xs text-muted-foreground">{tradeLabel(c.trade)}</span>}
                    </ComboboxItem>
                  )}
                </ComboboxList>
              </ComboboxContent>
            </Combobox>
          </div>

          {/* Title + trade */}
          <div className="space-y-1.5">
            <Label>Job title <span className="text-destructive">*</span></Label>
            <Input
              value={title}
              onChange={(e) => { setTitle(e.target.value); clearInvalid("title"); }}
              aria-invalid={invalid.title || undefined}
              placeholder="Job title"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Trade</Label>
            <Combobox items={CONTRACTOR_TRADE_OPTIONS} value={trade} onValueChange={(v) => setTrade(v ?? "")}>
              <ComboboxInput placeholder={trade ? tradeLabel(trade) : "Search trade"} />
              <ComboboxContent>
                <ComboboxEmpty>No trade found.</ComboboxEmpty>
                <ComboboxList>
                  {(o: { value: string; label: string }) => (
                    <ComboboxItem key={o.value} value={o.value} keywords={[o.label]}>{o.label}</ComboboxItem>
                  )}
                </ComboboxList>
              </ComboboxContent>
            </Combobox>
          </div>

          {/* Schedule */}
          <div className="border-t border-border pt-4">
            <h3 className="text-sm font-semibold text-foreground">Schedule</h3>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Start date <span className="text-destructive">*</span></Label>
              <DatePicker value={startDate} onChange={(v) => { setStartDate(v); clearInvalid("startDate"); }} invalid={invalid.startDate} />
            </div>
            <div className="space-y-1.5">
              <Label>Frequency <span className="text-destructive">*</span></Label>
              <Select value={frequency} onValueChange={(v) => setFrequency((v as RecurringFrequency) ?? "quarterly")}>
                <SelectTrigger className="w-full">
                  <SelectValue>{RECURRING_FREQUENCY_LABELS[frequency]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {RECURRING_FREQUENCY_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Switch checked={ongoing} onCheckedChange={setOngoing} />
            <Label className="cursor-default">Ongoing (no end date)</Label>
          </div>
          {!ongoing && (
            <div className="space-y-1.5">
              <Label>End date</Label>
              <DatePicker value={endDate} onChange={(v) => { setEndDate(v); clearInvalid("endDate"); }} invalid={invalid.endDate} minDate={startDate || undefined} />
            </div>
          )}

          {/* Fund + approval */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Fund</Label>
              <Select value={fundType} onValueChange={(v) => setFundType((v as typeof fundType) ?? "")}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Fund">{fundType ? FUND_LABELS[fundType] : undefined}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="administrative">Administrative fund</SelectItem>
                  <SelectItem value="capital_works">Capital works fund</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Approval reference</Label>
              <Input value={approvalRef} disabled placeholder="Link a meeting (coming soon)" />
            </div>
          </div>

          {/* Notify */}
          <div className="border-t border-border pt-4">
            <h3 className="text-sm font-semibold text-foreground">Notify lot owners</h3>
          </div>
          <div className="space-y-2">
            {(["all_owners", "specific", "none"] as const).map((scopeKey) => (
              <label key={scopeKey} className="flex cursor-pointer items-center gap-2.5 text-sm">
                <input
                  type="radio"
                  name="notify_scope"
                  checked={notifyScope === scopeKey}
                  onChange={() => setNotifyScope(scopeKey)}
                  className="size-4 accent-[color:var(--primary)]"
                />
                <span className="text-foreground">
                  {scopeKey === "all_owners" ? "All lot owners" : scopeKey === "specific" ? "Specific lot owners" : "Don't notify owners"}
                </span>
              </label>
            ))}
          </div>
          {notifyScope === "specific" && (
            <div className="space-y-2">
              {!ocId ? (
                <p className="text-sm text-muted-foreground">Pick an OC first.</p>
              ) : loadingOwners ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Loading owners</div>
              ) : owners.length === 0 ? (
                <p className="text-sm text-muted-foreground">No owners with an email on file (post-only owners are excluded).</p>
              ) : (
                <div className="max-h-48 space-y-1.5 overflow-y-auto rounded-md border border-border p-2">
                  {owners.map((o) => (
                    <div key={o.lot_owner_id} className="flex items-center gap-2.5">
                      <Checkbox checked={notifyOwnerIds.has(o.lot_owner_id)} onCheckedChange={(v) => toggleOwner(o.lot_owner_id, v === true)} />
                      <span className="text-sm text-foreground">{o.name}</span>
                      <span className="text-xs text-muted-foreground">{o.lot_label}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {notifyScope !== "none" && (
            <div className="space-y-1.5">
              <Label>Lead time (days before visit)</Label>
              <NumberInput value={leadTime} onChange={setLeadTime} allowDecimal={false} placeholder="Lead time in days" />
            </div>
          )}

          {/* Scope + cost */}
          <div className="border-t border-border pt-4">
            <h3 className="text-sm font-semibold text-foreground">Details</h3>
          </div>
          <div className="space-y-1.5">
            <Label>Scope of work</Label>
            <Textarea value={scope} onChange={(e) => setScope(e.target.value)} placeholder="What this job covers" rows={3} />
          </div>
          <div className="space-y-1.5">
            <Label>Cost per visit</Label>
            <NumberInput value={costPerVisit} onChange={setCostPerVisit} thousandsSeparator prefix="$" allowDecimal placeholder="Cost per visit" />
          </div>

          {/* Documents , attach files to this job (queued before save on a new job). */}
          <div className="border-t border-border pt-4">
            <h3 className="text-sm font-semibold text-foreground">Documents</h3>
          </div>
          <div className="space-y-2">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground hover:bg-muted">
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              <span>Attach document</span>
              <input
                type="file"
                accept="application/pdf,image/png,image/jpeg,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) onUploadDoc(f); e.currentTarget.value = ""; }}
              />
            </label>
            {docs.map((d) => (
              <div key={d.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
                <span className="inline-flex items-center gap-1.5 text-foreground"><FileText className="h-4 w-4 text-muted-foreground" /> {d.file_name}</span>
                <button
                  type="button"
                  onClick={() => startTransition(async () => {
                    const res = await deleteRecurringJobDocument(d.id);
                    if (res.error) { toast.error(res.error); return; }
                    setDocs((cur) => cur.filter((x) => x.id !== d.id));
                  })}
                  className="cursor-pointer text-muted-foreground hover:text-destructive"
                  aria-label="Remove document"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
            {pendingFiles.map((f, i) => (
              <div key={`pending-${i}`} className="flex items-center justify-between rounded-md border border-dashed border-border px-3 py-2 text-sm">
                <span className="inline-flex items-center gap-1.5 text-foreground"><FileText className="h-4 w-4 text-muted-foreground" /> {f.name} <span className="text-xs text-muted-foreground">(uploads on save)</span></span>
                <button
                  type="button"
                  onClick={() => setPendingFiles((p) => p.filter((_, idx) => idx !== i))}
                  className="cursor-pointer text-muted-foreground hover:text-destructive"
                  aria-label="Remove document"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <SheetFooter>
          {editing && (
            <div className="mr-auto flex gap-2">
              <Button
                variant="secondary"
                className="cursor-pointer"
                onClick={() => startTransition(async () => {
                  const next = editing.status === "active" ? "paused" : "active";
                  const res = await setRecurringJobStatus(editing.id, next);
                  if (res.error) { toast.error(res.error); return; }
                  toast.success(next === "paused" ? "Job paused" : "Job resumed");
                  onSaved();
                })}
              >
                {editing.status === "active" ? <Pause className="size-4" /> : <Play className="size-4" />}
                {editing.status === "active" ? "Pause" : "Resume"}
              </Button>
              <Button
                variant="secondary"
                className="cursor-pointer"
                onClick={() => startTransition(async () => {
                  const res = await deleteRecurringJob(editing.id);
                  if (res.error) { toast.error(res.error); return; }
                  toast.success("Job deleted");
                  onSaved();
                })}
              >
                <Trash2 className="size-4" />
                Delete
              </Button>
            </div>
          )}
          <Button onClick={onSubmit} disabled={pending || uploading} className="cursor-pointer">
            {pending && <Loader2 className="size-4 animate-spin" />}
            {editing ? "Save changes" : "Create job"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
