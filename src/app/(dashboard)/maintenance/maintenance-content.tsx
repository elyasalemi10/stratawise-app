"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Wrench, Loader2, Plus, Search, Trash2, Upload, FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
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
  createRecurringJob, updateRecurringJob, setRecurringJobStatus,
  getOCNotifyOwners, getRecurringJobNotifyTargets, getRecurringJobDocuments,
  linkRecurringJobDocs, deleteRecurringJobDocument, type UploadedDocRef,
  getJobSchedule, addJobOccurrence, updateJobOccurrence, deleteJobOccurrence,
  type OCSelectOption, type NotifyOwnerOption, type RecurringJobDoc,
  type JobOccurrence,
} from "@/lib/actions/recurring-jobs";
import {
  RECURRING_FREQUENCY_OPTIONS, RECURRING_FREQUENCY_LABELS,
  RECURRING_JOB_STATUS_LABELS, RECURRING_FUND_OPTIONS, RECURRING_FUND_LABELS,
  type RecurringJobRecord, type RecurringFrequency, type RecurringFundType,
} from "@/lib/validations/recurring-jobs";
import {
  CONTRACTOR_TRADE_OPTIONS, tradeLabel,
} from "@/lib/validations/contractors";

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
                    {!fixedOcId && j.trade && <span className="ml-2 text-xs text-muted-foreground">{tradeLabel(j.trade)}</span>}
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
  const [pendingDocs, setPendingDocs] = useState<UploadedDocRef[]>([]); // uploaded to R2, linked on save (new job)
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);

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

  // Upload to R2 immediately (progress shown straight away, like contractor
  // docs). On an existing job the documents row is created now; on a new job
  // the uploaded refs are linked on save.
  async function onUploadDoc(file: File) {
    if (!ocId) { toast.error("Pick an OC first."); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("oc_id", ocId);
      const res = await fetch("/api/recurring-job-docs", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) { toast.error(json.error ?? "Could not upload the document"); return; }
      const ref: UploadedDocRef = { key: json.key, file_name: json.file_name, file_size: json.file_size, mime_type: json.mime_type };
      if (editing) {
        const linked = await linkRecurringJobDocs(editing.id, [ref]);
        if (linked.error || !linked.docs) { toast.error(linked.error ?? "Could not attach the document"); return; }
        setDocs((d) => [...linked.docs!, ...d]);
      } else {
        setPendingDocs((p) => [...p, ref]);
      }
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
      fund_type: (fundType || null) as RecurringFundType | null,
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
      // Link documents already uploaded to R2 during the wizard.
      if (pendingDocs.length > 0) await linkRecurringJobDocs(res.jobId, pendingDocs);
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
                  <SelectValue placeholder="Fund">{fundType ? RECURRING_FUND_LABELS[fundType as RecurringFundType] : undefined}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {RECURRING_FUND_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
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
            <label
              onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
              onDragLeave={() => setDragActive(false)}
              onDrop={(e) => { e.preventDefault(); setDragActive(false); const f = e.dataTransfer.files?.[0]; if (f) onUploadDoc(f); }}
              className={cn(
                "flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-md border border-dashed px-4 py-6 text-center text-sm transition-colors",
                dragActive ? "border-primary bg-primary/5" : "border-border bg-card hover:bg-muted",
              )}
            >
              {uploading ? (
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              ) : (
                <>
                  <Upload className="h-5 w-5 text-muted-foreground" />
                  <span className="text-muted-foreground">Drag a file here, or click to upload</span>
                  <span className="text-xs text-muted-foreground">PDF, image or Word</span>
                </>
              )}
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
            {pendingDocs.map((d, i) => (
              <div key={`pending-${i}`} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
                <span className="inline-flex items-center gap-1.5 text-foreground"><FileText className="h-4 w-4 text-muted-foreground" /> {d.file_name}</span>
                <button
                  type="button"
                  onClick={() => setPendingDocs((p) => p.filter((_, idx) => idx !== i))}
                  className="cursor-pointer text-muted-foreground hover:text-destructive"
                  aria-label="Remove document"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>

          {/* Schedule & visits (edit mode) */}
          {editing && (
            <>
              <div className="border-t border-border pt-4">
                <h3 className="text-sm font-semibold text-foreground">Schedule & visits</h3>
              </div>
              <JobScheduleSection jobId={editing.id} />
            </>
          )}
        </div>

        <SheetFooter>
          {editing && (
            <div className="mr-auto flex items-center gap-2.5">
              <Switch
                checked={editing.status === "active"}
                onCheckedChange={(on) => startTransition(async () => {
                  const next = on ? "active" : "paused";
                  const res = await setRecurringJobStatus(editing.id, next);
                  if (res.error) { toast.error(res.error); return; }
                  toast.success(next === "active" ? "Job active" : "Job paused");
                  onSaved();
                })}
              />
              <Label className="cursor-default">Active</Label>
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

const OCC_STATUS_LABEL: Record<string, string> = { scheduled: "Scheduled", attended: "Attended", skipped: "Skipped" };
const OCC_STATUS_VARIANT: Record<string, "success" | "neutral" | "info"> = { scheduled: "info", attended: "success", skipped: "neutral" };

function fmtOccDate(iso: string) {
  return new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

function JobScheduleSection({ jobId }: { jobId: string }) {
  const [rows, setRows] = useState<JobOccurrence[]>([]);
  const [loading, setLoading] = useState(true);
  const [addDate, setAddDate] = useState("");
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getJobSchedule(jobId)
      .then((r) => { if (!cancelled) setRows(r); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [jobId]);

  // Insert keeping the list sorted by date ascending.
  function upsertRow(occ: JobOccurrence) {
    setRows((prev) => {
      const next = prev.some((r) => r.id === occ.id) ? prev.map((r) => (r.id === occ.id ? occ : r)) : [...prev, occ];
      return next.sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date));
    });
  }

  async function setStatus(id: string, status: "scheduled" | "attended" | "skipped") {
    setBusyId(id);
    const res = await updateJobOccurrence(id, { status });
    setBusyId(null);
    if (res.error || !res.occurrence) { toast.error(res.error ?? "Could not update the visit"); return; }
    upsertRow(res.occurrence);
  }

  async function remove(id: string) {
    setBusyId(id);
    const res = await deleteJobOccurrence(id);
    setBusyId(null);
    if (res.error) { toast.error(res.error); return; }
    setRows((prev) => prev.filter((r) => r.id !== id));
  }

  async function add() {
    if (!addDate) return;
    setAdding(true);
    const res = await addJobOccurrence(jobId, { scheduled_date: addDate, status: "scheduled" });
    setAdding(false);
    if (res.error || !res.occurrence) { toast.error(res.error ?? "Could not add the visit"); return; }
    upsertRow(res.occurrence);
    setAddDate("");
  }

  if (loading) return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Loading schedule</div>;

  return (
    <div className="space-y-3">
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No visits scheduled yet. Add one below.</p>
      ) : (
        <div className="space-y-1.5">
          {rows.map((o) => {
            const busy = busyId === o.id;
            return (
              <div key={o.id} className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-foreground">{fmtOccDate(o.scheduled_date)}</span>
                  <Badge variant={OCC_STATUS_VARIANT[o.status]} className="rounded-full">{OCC_STATUS_LABEL[o.status]}</Badge>
                </div>
                <div className="flex items-center gap-1.5">
                  {o.status !== "attended" && (
                    <Button size="sm" variant="secondary" className="h-7 cursor-pointer px-2" disabled={busy} onClick={() => setStatus(o.id, "attended")}>
                      {busy ? <Loader2 className="size-3.5 animate-spin" /> : "Mark attended"}
                    </Button>
                  )}
                  {o.status === "scheduled" && (
                    <Button size="sm" variant="secondary" className="h-7 cursor-pointer px-2" disabled={busy} onClick={() => setStatus(o.id, "skipped")}>
                      Skip
                    </Button>
                  )}
                  {o.status !== "scheduled" && (
                    <Button size="sm" variant="secondary" className="h-7 cursor-pointer px-2" disabled={busy} onClick={() => setStatus(o.id, "scheduled")}>
                      Reset
                    </Button>
                  )}
                  <button type="button" disabled={busy} onClick={() => remove(o.id)} className="cursor-pointer text-muted-foreground hover:text-destructive disabled:opacity-40" aria-label="Remove visit">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex items-end gap-2">
        <div className="flex-1 space-y-1.5">
          <Label>Add a visit date</Label>
          <DatePicker value={addDate} onChange={setAddDate} />
        </div>
        <Button variant="secondary" disabled={adding || !addDate} className="cursor-pointer" onClick={add}>
          {adding ? <Loader2 className="size-4 animate-spin" /> : "Add"}
        </Button>
      </div>
    </div>
  );
}
