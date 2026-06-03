"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { HardHat, Loader2, Plus, Search, Upload, FileText, Power } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { NumberInput } from "@/components/ui/number-input";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/shared/date-picker";
import { PhoneInput } from "@/components/shared/phone-input";
import { BsbInput } from "@/components/shared/bsb-input";
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
import { cn } from "@/lib/utils";
import {
  createContractor, updateContractor, setContractorStatus,
} from "@/lib/actions/contractors";
import {
  CONTRACTOR_TRADE_OPTIONS, tradeLabel, type ContractorRecord,
} from "@/lib/validations/contractors";

function expiryBadge(expiry: string | null): { variant: "success" | "warning" | "destructive" | "neutral"; label: string } | null {
  if (!expiry) return null;
  const days = Math.ceil((new Date(`${expiry}T00:00:00`).getTime() - Date.now()) / 86_400_000);
  const label = new Date(`${expiry}T00:00:00`).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
  if (days < 0) return { variant: "destructive", label: `Expired ${label}` };
  if (days <= 30) return { variant: "warning", label };
  return { variant: "success", label };
}

export function ContractorsContent({ contractors }: { contractors: ContractorRecord[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<ContractorRecord | null>(null);
  // Bumped on each open so the drawer remounts fresh (resets the ABN step +
  // fields) without disturbing the close animation.
  const [openKey, setOpenKey] = useState(0);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return contractors;
    return contractors.filter((c) =>
      [c.business_name, c.name, c.email, c.phone, c.abn, tradeLabel(c.trade)]
        .some((v) => (v ?? "").toLowerCase().includes(q)),
    );
  }, [contractors, query]);

  function openAdd() {
    setEditing(null);
    setOpenKey((k) => k + 1);
    setDrawerOpen(true);
  }
  function openEdit(c: ContractorRecord) {
    setEditing(c);
    setOpenKey((k) => k + 1);
    setDrawerOpen(true);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <p className="text-sm text-muted-foreground">
            {contractors.length} contractor{contractors.length === 1 ? "" : "s"}
          </p>
          {contractors.length > 0 && (
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search contractors"
                className="h-9 w-64 pl-7"
              />
            </div>
          )}
        </div>
        {contractors.length > 0 && (
          <Button onClick={openAdd} className="cursor-pointer">
            <Plus className="mr-2 h-4 w-4" />
            Add contractor
          </Button>
        )}
      </div>

      {contractors.length === 0 ? (
        <EmptyState
          icon={HardHat}
          title="No contractors yet"
          description="Build a reusable contact book of contractors you can attach to recurring jobs across every OC."
          action={
            <Button onClick={openAdd}>
              <Plus className="mr-2 h-4 w-4" />
              Add contractor
            </Button>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <Table variant="striped">
            <TableHeader>
              <TableRow>
                <TableHead>Business</TableHead>
                <TableHead>Trade</TableHead>
                <TableHead>Primary contact</TableHead>
                <TableHead>ABN</TableHead>
                <TableHead>GST</TableHead>
                <TableHead>Public liability expiry</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((c) => {
                const badge = expiryBadge(c.insurance_expiry);
                const inactive = c.status === "inactive";
                return (
                  <TableRow key={c.id} className={cn("cursor-pointer", inactive && "opacity-55")} onClick={() => openEdit(c)}>
                    <TableCell className="font-medium text-foreground">{c.business_name}</TableCell>
                    <TableCell>{tradeLabel(c.trade)}</TableCell>
                    <TableCell className="text-foreground">{c.name}</TableCell>
                    <TableCell className="tabular-nums">{c.abn}</TableCell>
                    <TableCell>{c.gst_registered ? "Registered" : ""}</TableCell>
                    <TableCell>
                      {badge && (
                        <Badge variant={badge.variant} className="rounded-full">{badge.label}</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={inactive ? "neutral" : "success"} className="rounded-full">
                        {inactive ? "Inactive" : "Active"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                    No contractors match your search.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <ContractorDrawer
        key={openKey}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        editing={editing}
        onSaved={() => { setDrawerOpen(false); router.refresh(); }}
      />
    </div>
  );
}

export interface CreatedContractor {
  id: string;
  business_name: string;
  trade: string | null;
}

export function ContractorDrawer({
  open,
  onOpenChange,
  editing,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  editing: ContractorRecord | null;
  onSaved: (created?: CreatedContractor) => void;
}) {
  const [businessName, setBusinessName] = useState(editing?.business_name ?? "");
  const [abn, setAbn] = useState(editing?.abn ?? "");
  const [gst, setGst] = useState(editing?.gst_registered ?? false);
  const [contactName, setContactName] = useState(editing?.name ?? "");
  const [phone, setPhone] = useState(editing?.phone ?? "");
  const [email, setEmail] = useState(editing?.email ?? "");
  const [trade, setTrade] = useState(editing?.trade ?? "");
  const [bankName, setBankName] = useState(editing?.bank_name ?? "");
  const [bsb, setBsb] = useState(editing?.bsb ?? "");
  const [accountNumber, setAccountNumber] = useState(editing?.account_number ?? "");
  const [plInsurer, setPlInsurer] = useState(editing?.pl_insurer ?? "");
  const [plPolicy, setPlPolicy] = useState(editing?.pl_policy_number ?? "");
  const [plLimit, setPlLimit] = useState(editing?.pl_coverage_limit != null ? String(editing.pl_coverage_limit) : "");
  const [plExpiry, setPlExpiry] = useState(editing?.insurance_expiry ?? "");
  const [plDocKey, setPlDocKey] = useState(editing?.pl_document_url ?? "");
  const [docName, setDocName] = useState(editing?.pl_document_url ? "Certificate on file" : "");
  const [notes, setNotes] = useState(editing?.notes ?? "");
  const [uploading, setUploading] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  // New contractors start on the ABN step (look up or skip), then prefill the
  // form. Editing jumps straight to the form.
  const [step, setStep] = useState<"abn" | "form">(editing ? "form" : "abn");

  const [invalid, setInvalid] = useState<Record<string, boolean>>({});
  const [pending, startTransition] = useTransition();

  function clearInvalid(field: string) {
    setInvalid((p) => (p[field] ? { ...p, [field]: false } : p));
  }

  // Fills business name + GST from the ABR for the given digits. Returns true
  // if it found something. Used by the ABN step.
  async function runAbnLookup(digits: string): Promise<boolean> {
    setLookingUp(true);
    try {
      const res = await fetch(`/api/abn-lookup?abn=${digits}`);
      const json = await res.json();
      if (!json.found) return false;
      const r = json.result as { businessName: string | null; gstRegistered: boolean };
      if (r.businessName) setBusinessName(r.businessName);
      setGst(r.gstRegistered);
      return true;
    } catch {
      return false;
    } finally {
      setLookingUp(false);
    }
  }

  // ABN step: look up (if 11 digits) then move to the form.
  async function lookupAndContinue() {
    const digits = abn.replace(/\D/g, "");
    if (digits.length === 11) {
      const found = await runAbnLookup(digits);
      if (!found) toast.error("We couldn't find that ABN. Fill the details manually.");
    }
    setStep("form");
  }

  async function onUpload(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/contractor-docs", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) { toast.error(json.error ?? "Could not upload the document"); return; }
      setPlDocKey(json.key);
      setDocName(json.file_name ?? file.name);
    } catch {
      toast.error("Could not upload the document");
    } finally {
      setUploading(false);
    }
  }

  function onSubmit() {
    const problems: string[] = [];
    const nextInvalid: Record<string, boolean> = {};
    if (!businessName.trim()) { problems.push("Business name is required."); nextInvalid.businessName = true; }
    if (!contactName.trim()) { problems.push("Primary contact name is required."); nextInvalid.contactName = true; }
    if (!phone.trim() && !email.trim()) {
      problems.push("Add a phone number or an email for the primary contact.");
      nextInvalid.phone = true; nextInvalid.email = true;
    }
    if (!plInsurer.trim()) { problems.push("Insurer is required."); nextInvalid.plInsurer = true; }
    if (!plPolicy.trim()) { problems.push("Policy number is required."); nextInvalid.plPolicy = true; }
    const limit = parseFloat(plLimit);
    if (!plLimit.trim() || !Number.isFinite(limit) || limit <= 0) {
      problems.push("Coverage limit is required."); nextInvalid.plLimit = true;
    }
    if (!plExpiry) { problems.push("Insurance expiry date is required."); nextInvalid.plExpiry = true; }

    if (problems.length) {
      setInvalid(nextInvalid);
      toast.error(problems.length === 1 ? problems[0] : "Fix the highlighted fields.");
      return;
    }

    const payload = {
      business_name: businessName.trim(),
      abn: abn.trim() || null,
      gst_registered: gst,
      contact_name: contactName.trim(),
      contact_phone: phone.trim() || null,
      contact_email: email.trim() || null,
      trade: trade || null,
      bank_name: bankName.trim() || null,
      bsb: bsb.trim() || null,
      account_number: accountNumber.trim() || null,
      pl_insurer: plInsurer.trim(),
      pl_policy_number: plPolicy.trim(),
      pl_coverage_limit: limit,
      insurance_expiry: plExpiry,
      pl_document_url: plDocKey || null,
      notes: notes.trim() || null,
      status: editing?.status ?? "active",
    };

    startTransition(async () => {
      if (editing) {
        const res = await updateContractor(editing.id, payload);
        if (res.error) { toast.error(res.error); return; }
        toast.success("Contractor updated");
        onSaved();
        return;
      }
      const res = await createContractor(payload);
      if (res.error) { toast.error(res.error); return; }
      toast.success("Contractor added");
      onSaved(res.contractorId ? { id: res.contractorId, business_name: businessName.trim(), trade: trade || null } : undefined);
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{editing ? "Edit contractor" : "Add contractor"}</SheetTitle>
          <SheetDescription>
            Contractors are shared across every OC you manage.
          </SheetDescription>
        </SheetHeader>

        {step === "abn" && (
          <div className="space-y-4 px-4 pb-4">
            <div className="space-y-1.5">
              <Label>ABN</Label>
              <NumberInput value={abn} onChange={(v) => setAbn(v)} allowDecimal={false} maxLength={11} placeholder="11-digit ABN" />
              <p className="text-xs text-muted-foreground">We&apos;ll look it up and fill in the business name and GST status.</p>
            </div>
            <div className="flex justify-between gap-2">
              <Button variant="secondary" className="cursor-pointer" onClick={() => setStep("form")} disabled={lookingUp}>
                Skip
              </Button>
              <Button className="cursor-pointer" onClick={lookupAndContinue} disabled={lookingUp || abn.replace(/\D/g, "").length !== 11}>
                {lookingUp && <Loader2 className="size-4 animate-spin" />}
                Look up and continue
              </Button>
            </div>
          </div>
        )}

        {step === "form" && (
        <>
        <div className="space-y-5 px-4 pb-4">
          {/* Business */}
          <div className="space-y-1.5">
            <Label>Business name <span className="text-destructive">*</span></Label>
            <Input
              value={businessName}
              onChange={(e) => { setBusinessName(e.target.value); clearInvalid("businessName"); }}
              aria-invalid={invalid.businessName || undefined}
              placeholder="Business name"
            />
          </div>
          <div className="space-y-1.5">
            <Label>ABN</Label>
            <NumberInput value={abn} onChange={(v) => setAbn(v)} allowDecimal={false} maxLength={11} placeholder="11-digit ABN" />
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
          <div className="flex items-center gap-3">
            <Switch checked={gst} onCheckedChange={setGst} />
            <Label className="cursor-default">GST registered</Label>
          </div>

          {/* Primary contact */}
          <div className="border-t border-border pt-4">
            <h3 className="text-sm font-semibold text-foreground">Primary contact</h3>
          </div>
          <div className="space-y-1.5">
            <Label>Name <span className="text-destructive">*</span></Label>
            <Input
              value={contactName}
              onChange={(e) => { setContactName(e.target.value); clearInvalid("contactName"); }}
              aria-invalid={invalid.contactName || undefined}
              placeholder="Contact name"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Phone</Label>
            <PhoneInput
              value={phone}
              onChange={(v) => { setPhone(v); clearInvalid("phone"); clearInvalid("email"); }}
              error={invalid.phone}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input
              value={email}
              onChange={(e) => { setEmail(e.target.value); clearInvalid("email"); clearInvalid("phone"); }}
              aria-invalid={invalid.email || undefined}
              placeholder="Email"
            />
          </div>

          {/* Bank details */}
          <div className="border-t border-border pt-4">
            <h3 className="text-sm font-semibold text-foreground">Bank details</h3>
          </div>
          <div className="space-y-1.5">
            <Label>Bank name</Label>
            <Input value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="Bank name" />
          </div>
          <div className="space-y-1.5">
            <Label>BSB</Label>
            <BsbInput value={bsb} onChange={setBsb} placeholder="6-digit BSB" />
          </div>
          <div className="space-y-1.5">
            <Label>Account number</Label>
            <NumberInput value={accountNumber} onChange={setAccountNumber} allowDecimal={false} maxLength={9} placeholder="Account number" />
          </div>

          {/* Public liability insurance */}
          <div className="border-t border-border pt-4">
            <h3 className="text-sm font-semibold text-foreground">Public liability insurance</h3>
          </div>
          <div className="space-y-1.5">
            <Label>Insurer <span className="text-destructive">*</span></Label>
            <Input
              value={plInsurer}
              onChange={(e) => { setPlInsurer(e.target.value); clearInvalid("plInsurer"); }}
              aria-invalid={invalid.plInsurer || undefined}
              placeholder="Insurer / underwriter name"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Policy number <span className="text-destructive">*</span></Label>
            <Input
              value={plPolicy}
              onChange={(e) => { setPlPolicy(e.target.value); clearInvalid("plPolicy"); }}
              aria-invalid={invalid.plPolicy || undefined}
              placeholder="Policy number"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Coverage limit <span className="text-destructive">*</span></Label>
            <NumberInput
              value={plLimit}
              onChange={(v) => { setPlLimit(v); clearInvalid("plLimit"); }}
              invalid={invalid.plLimit}
              thousandsSeparator
              prefix="$"
              allowDecimal
              maxLength={12}
              placeholder="Coverage limit"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Expiry date <span className="text-destructive">*</span></Label>
            <DatePicker
              value={plExpiry}
              onChange={(v) => { setPlExpiry(v); clearInvalid("plExpiry"); }}
              invalid={invalid.plExpiry}
            />
          </div>

          {/* Related documents / certificate of currency , drop zone */}
          <div className="space-y-1.5">
            <Label>Related documents / certificate of currency</Label>
            <label
              onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
              onDragLeave={() => setDragActive(false)}
              onDrop={(e) => { e.preventDefault(); setDragActive(false); const f = e.dataTransfer.files?.[0]; if (f) onUpload(f); }}
              className={cn(
                "flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-md border border-dashed px-4 py-6 text-center text-sm transition-colors",
                dragActive ? "border-primary bg-primary/5" : "border-border bg-card hover:bg-muted",
              )}
            >
              {uploading ? (
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              ) : docName ? (
                <span className="inline-flex items-center gap-1.5 text-foreground"><FileText className="h-4 w-4" /> {docName}</span>
              ) : (
                <>
                  <Upload className="h-5 w-5 text-muted-foreground" />
                  <span className="text-muted-foreground">Drag a file here, or click to upload</span>
                  <span className="text-xs text-muted-foreground">PDF, PNG or JPG</span>
                </>
              )}
              <input
                type="file"
                accept="application/pdf,image/png,image/jpeg"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f); }}
              />
            </label>
          </div>

          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes" rows={3} />
          </div>
        </div>

        <SheetFooter>
          {editing && (
            <ContractorStatusButton contractorId={editing.id} status={editing.status} onChanged={onSaved} />
          )}
          <Button onClick={onSubmit} disabled={pending || uploading} className="cursor-pointer">
            {pending && <Loader2 className="size-4 animate-spin" />}
            {editing ? "Save changes" : "Add contractor"}
          </Button>
        </SheetFooter>
        </>
        )}
      </SheetContent>
    </Sheet>
  );
}

// We don't delete contractors , we deactivate them. Inactive contractors stay
// in the book + on historical jobs but drop out of the new-job picker.
function ContractorStatusButton({
  contractorId,
  status,
  onChanged,
}: {
  contractorId: string;
  status: "active" | "inactive";
  onChanged: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const next = status === "active" ? "inactive" : "active";
  return (
    <Button
      variant="secondary"
      className="mr-auto cursor-pointer"
      disabled={pending}
      onClick={() => startTransition(async () => {
        const res = await setContractorStatus(contractorId, next);
        if (res.error) { toast.error(res.error); return; }
        toast.success(next === "inactive" ? "Contractor deactivated" : "Contractor reactivated");
        onChanged();
      })}
    >
      {pending ? <Loader2 className="size-4 animate-spin" /> : status === "active" ? <Power className="size-4" /> : <Power className="size-4" />}
      {status === "active" ? "Deactivate" : "Reactivate"}
    </Button>
  );
}
