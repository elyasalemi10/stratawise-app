"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Gavel, Loader2, Download, AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { NumberInput } from "@/components/ui/number-input";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/shared/date-picker";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter,
} from "@/components/ui/sheet";
import { getVcatStatus, generateVcatPack, type VcatStatus } from "@/lib/actions/vcat";

function YesNo({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex gap-2">
      {([["Yes", true], ["No", false]] as const).map(([label, v]) => (
        <button
          key={label}
          type="button"
          onClick={() => onChange(v)}
          className={`flex-1 rounded-md border px-3 py-2 text-sm transition-colors cursor-pointer ${value === v ? "border-primary ring-2 ring-primary/20" : "border-border bg-card hover:border-primary/40"}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function VcatPackPanel({ lotId }: { lotId: string }) {
  const [status, setStatus] = useState<VcatStatus | null>(null);
  const [packId, setPackId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  function load() {
    getVcatStatus(lotId)
      .then((s) => { setStatus(s); setPackId(s.latestPackId); })
      .catch(() => {});
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [lotId]);

  // Only render when there's arrears, an eligible final notice, or an existing pack.
  if (!status) return null;
  if (!status.hasArrears && !status.levyNoticeId && !status.latestPackId) return null;

  return (
    <>
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-5">
          <div className="flex items-start gap-3">
            <Gavel className="mt-0.5 h-5 w-5 text-primary" />
            <div>
              <h3 className="text-sm font-semibold text-foreground">VCAT fee recovery</h3>
              <p className="text-sm text-muted-foreground">
                {status.eligible
                  ? "A final notice has been served and the 28-day period has passed. You can prepare the VCAT application pack."
                  : status.reason ?? "Available once a final notice has been served for 28 days."}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            {packId && (
              <a
                href={`/api/vcat-docs/${packId}`}
                className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-sm text-foreground hover:bg-muted"
              >
                <Download className="h-4 w-4" /> Download pack
              </a>
            )}
            {status.eligible && status.levyNoticeId && (
              <Button className="cursor-pointer" onClick={() => setDrawerOpen(true)}>
                {packId ? "Regenerate pack" : "Prepare VCAT pack"}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {status.eligible && status.levyNoticeId && (
        <VcatInputsDrawer
          open={drawerOpen}
          onOpenChange={setDrawerOpen}
          lotId={lotId}
          levyNoticeId={status.levyNoticeId}
          onGenerated={(id) => { setPackId(id); setDrawerOpen(false); }}
        />
      )}
    </>
  );
}

function VcatInputsDrawer({
  open,
  onOpenChange,
  lotId,
  levyNoticeId,
  onGenerated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  lotId: string;
  levyNoticeId: string;
  onGenerated: (packId: string) => void;
}) {
  const [interestResolution, setInterestResolution] = useState(false);
  const [resolutionDate, setResolutionDate] = useState("");
  const [reasonableCosts, setReasonableCosts] = useState("");
  const [reasonableCostsDetails, setReasonableCostsDetails] = useState("");
  const [costsInProceeding, setCostsInProceeding] = useState("");
  const [specialResolution, setSpecialResolution] = useState(false);
  const [respondentCurrentOwner, setRespondentCurrentOwner] = useState(true);
  const [acknowledged, setAcknowledged] = useState(false);
  const [pending, setPending] = useState(false);

  async function onGenerate() {
    if (!acknowledged) { toast.error("Tick the acknowledgement to continue."); return; }
    setPending(true);
    const res = await generateVcatPack(lotId, levyNoticeId, {
      interest_resolution: interestResolution,
      interest_resolution_date: interestResolution ? (resolutionDate || null) : null,
      reasonable_costs: reasonableCosts.trim() ? parseFloat(reasonableCosts) : 0,
      reasonable_costs_details: reasonableCostsDetails.trim() || null,
      costs_in_proceeding: costsInProceeding.trim() ? parseFloat(costsInProceeding) : 0,
      special_resolution: specialResolution,
      respondent_is_current_owner: respondentCurrentOwner,
      acknowledged: true,
    });
    if (res.error || !res.packId) { setPending(false); toast.error(res.error ?? "Could not generate the pack"); return; }
    toast.success("VCAT pack ready to download");
    setPending(false);
    onGenerated(res.packId);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Prepare VCAT pack</SheetTitle>
          <SheetDescription>A few details we can&apos;t infer go on the application.</SheetDescription>
        </SheetHeader>

        <div className="space-y-5 px-4 pb-4">
          <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-xs text-foreground">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <span>
              StrataWise generates these documents from your records as an administrative convenience. This is not legal advice, and StrataWise is not liable for the contents or the outcome of any application. You are responsible for checking every document before lodging it with VCAT.
            </span>
          </div>

          <div className="space-y-1.5">
            <Label>Interest approved by resolution at a general meeting?</Label>
            <YesNo value={interestResolution} onChange={setInterestResolution} />
          </div>
          {interestResolution && (
            <div className="space-y-1.5">
              <Label>Date of resolution</Label>
              <DatePicker value={resolutionDate} onChange={setResolutionDate} />
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Reasonable costs incurred (other than costs in the proceeding)</Label>
            <NumberInput value={reasonableCosts} onChange={setReasonableCosts} thousandsSeparator prefix="$" allowDecimal placeholder="Reasonable costs" />
          </div>
          <div className="space-y-1.5">
            <Label>Details of those costs</Label>
            <Textarea value={reasonableCostsDetails} onChange={(e) => setReasonableCostsDetails(e.target.value)} rows={2} placeholder="What the costs were for" />
          </div>
          <div className="space-y-1.5">
            <Label>Costs in the proceeding (including the application fee)</Label>
            <NumberInput value={costsInProceeding} onChange={setCostsInProceeding} thousandsSeparator prefix="$" allowDecimal placeholder="Costs in the proceeding" />
          </div>
          <div className="space-y-1.5">
            <Label>Is the respondent the current registered proprietor?</Label>
            <YesNo value={respondentCurrentOwner} onChange={setRespondentCurrentOwner} />
          </div>
          <div className="space-y-1.5">
            <Label>Special resolution in support of this application?</Label>
            <YesNo value={specialResolution} onChange={setSpecialResolution} />
            <p className="text-xs text-muted-foreground">Not required for fee recovery, but the VCAT form asks.</p>
          </div>

          <label className="flex cursor-pointer items-start gap-2.5 rounded-md border border-border p-3 text-sm">
            <Checkbox checked={acknowledged} onCheckedChange={(v) => setAcknowledged(v === true)} />
            <span className="text-foreground">I understand this is not legal advice and I am responsible for verifying the pack before filing.</span>
          </label>
        </div>

        <SheetFooter>
          <Button onClick={onGenerate} disabled={pending || !acknowledged} className="cursor-pointer">
            {pending && <Loader2 className="size-4 animate-spin" />}
            Generate pack
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
