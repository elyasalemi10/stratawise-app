"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Shield, ShieldAlert, ShieldX, Download, CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatDateLong } from "@/lib/utils";
import {
  createInsurancePolicy,
  type InsurancePolicy,
} from "@/lib/actions/insurance";

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n);

const POLICY_TYPES = [
  { value: "building", label: "Building" },
  { value: "public_liability", label: "Public liability" },
  { value: "contents", label: "Contents" },
  { value: "workers_comp", label: "Workers compensation" },
  { value: "office_bearers", label: "Office bearers" },
  { value: "fidelity", label: "Fidelity guarantee" },
  { value: "other", label: "Other" },
];

// ─── Timeline ──────────────────────────────────────────────

function TimelineEntry({
  type,
  startDate,
  endDate,
  isGap,
  policy,
}: {
  type: "covered" | "gap";
  startDate: string;
  endDate: string;
  isGap: boolean;
  policy?: InsurancePolicy;
}) {
  const isExpired = !isGap && policy && new Date(policy.end_date) < new Date();
  const isExpiringSoon = !isGap && policy && !isExpired &&
    new Date(policy.end_date) < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  return (
    <div className="flex gap-4">
      {/* Timeline line */}
      <div className="flex flex-col items-center">
        <div className={`h-3 w-3 rounded-full shrink-0 mt-1 ${
          isGap ? "bg-destructive" : isExpiringSoon ? "bg-warning" : "bg-[hsl(160,100%,37%)]"
        }`} />
        <div className={`w-0.5 flex-1 ${isGap ? "bg-destructive/20" : "bg-border"}`} />
      </div>

      {/* Content */}
      <div className="pb-6 flex-1">
        {isGap ? (
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3">
            <div className="flex items-center gap-2">
              <ShieldX className="h-4 w-4 text-destructive" />
              <p className="text-sm font-medium text-destructive">No coverage</p>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {formatDateLong(startDate)} — {endDate === "now" ? "Present" : formatDateLong(endDate)}
            </p>
          </div>
        ) : policy ? (
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-[hsl(160,100%,37%)]" />
                    <span className="text-sm font-semibold text-foreground">
                      {POLICY_TYPES.find((t) => t.value === policy.policy_type)?.label ?? policy.policy_type}
                    </span>
                    {isExpiringSoon && <Badge variant="warning">Expiring soon</Badge>}
                    {isExpired && <Badge variant="destructive">Expired</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{policy.provider}</p>
                </div>
                {policy.document_url && (
                  <a href={policy.document_url} target="_blank" rel="noopener noreferrer">
                    <Button variant="ghost" size="icon" className="h-7 w-7">
                      <Download className="h-3.5 w-3.5" />
                    </Button>
                  </a>
                )}
              </div>

              <div className="grid grid-cols-2 gap-x-6 gap-y-1 mt-3 text-xs">
                <div>
                  <span className="text-muted-foreground">Period</span>
                  <p className="text-foreground">{formatDateLong(policy.start_date)} — {formatDateLong(policy.end_date)}</p>
                </div>
                {policy.policy_number && (
                  <div>
                    <span className="text-muted-foreground">Policy #</span>
                    <p className="text-foreground">{policy.policy_number}</p>
                  </div>
                )}
                {policy.sum_insured && (
                  <div>
                    <span className="text-muted-foreground">Sum insured</span>
                    <p className="text-foreground">{formatCurrency(policy.sum_insured)}</p>
                  </div>
                )}
                {policy.premium && (
                  <div>
                    <span className="text-muted-foreground">Premium</span>
                    <p className="text-foreground">{formatCurrency(policy.premium)}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}

// ─── Add Policy Dialog ─────────────────────────────────────

function AddPolicyDialog({
  open,
  onClose,
  subdivisionId,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  subdivisionId: string;
  onCreated: () => void;
}) {
  const [policyType, setPolicyType] = useState("building");
  const [provider, setProvider] = useState("");
  const [policyNumber, setPolicyNumber] = useState("");
  const [sumInsured, setSumInsured] = useState("");
  const [premium, setPremium] = useState("");
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [pending, setPending] = useState(false);

  async function handleSubmit() {
    if (!provider || !startDate || !endDate) {
      toast.error("Please fill in all required fields");
      return;
    }

    setPending(true);
    const result = await createInsurancePolicy(subdivisionId, {
      policy_type: policyType,
      provider,
      policy_number: policyNumber || undefined,
      sum_insured: sumInsured ? Number(sumInsured) : undefined,
      premium: premium ? Number(premium) : undefined,
      start_date: format(startDate, "yyyy-MM-dd"),
      end_date: format(endDate, "yyyy-MM-dd"),
    });
    setPending(false);

    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("Insurance policy added");
      onCreated();
      onClose();
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add insurance policy</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Policy type</Label>
            <select
              value={policyType}
              onChange={(e) => setPolicyType(e.target.value)}
              className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
            >
              {POLICY_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label>Provider *</Label>
            <Input value={provider} onChange={(e) => setProvider(e.target.value)} placeholder="e.g. QBE, Allianz" />
          </div>

          <div className="space-y-1.5">
            <Label>Policy number</Label>
            <Input value={policyNumber} onChange={(e) => setPolicyNumber(e.target.value)} placeholder="Optional" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Start date *</Label>
              <Popover>
                <PopoverTrigger className="flex h-9 w-full items-center gap-2 rounded-md border border-border bg-background px-3 text-sm cursor-pointer">
                  <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" />
                  {startDate ? format(startDate, "d MMM yyyy") : "Select"}
                </PopoverTrigger>
                <PopoverContent className="w-auto p-2" align="start">
                  <Calendar mode="single" selected={startDate} onSelect={setStartDate} />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-1.5">
              <Label>End date *</Label>
              <Popover>
                <PopoverTrigger className="flex h-9 w-full items-center gap-2 rounded-md border border-border bg-background px-3 text-sm cursor-pointer">
                  <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" />
                  {endDate ? format(endDate, "d MMM yyyy") : "Select"}
                </PopoverTrigger>
                <PopoverContent className="w-auto p-2" align="start">
                  <Calendar mode="single" selected={endDate} onSelect={setEndDate} />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Sum insured</Label>
              <Input type="number" value={sumInsured} onChange={(e) => setSumInsured(e.target.value)} placeholder="0.00" />
            </div>
            <div className="space-y-1.5">
              <Label>Premium</Label>
              <Input type="number" value={premium} onChange={(e) => setPremium(e.target.value)} placeholder="0.00" />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={pending || !provider || !startDate || !endDate}>
            {pending ? "Adding..." : "Add policy"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Component ────────────────────────────────────────

export function InsuranceTimeline({
  subdivisionId,
  policies: initialPolicies,
}: {
  subdivisionId: string;
  policies: InsurancePolicy[];
}) {
  const router = useRouter();
  const [policies, setPolicies] = useState(initialPolicies);
  const [showAdd, setShowAdd] = useState(false);

  // Sort policies by start_date ascending for timeline
  const sorted = [...policies].sort((a, b) =>
    new Date(a.start_date).getTime() - new Date(b.start_date).getTime()
  );

  // Build timeline entries with gaps
  type TimelineItem = {
    type: "covered" | "gap";
    startDate: string;
    endDate: string;
    policy?: InsurancePolicy;
  };

  const timeline: TimelineItem[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const policy = sorted[i];

    // Check for gap before this policy (compare to previous policy end)
    if (i > 0) {
      const prevEnd = new Date(sorted[i - 1].end_date);
      const thisStart = new Date(policy.start_date);
      prevEnd.setDate(prevEnd.getDate() + 1);

      if (prevEnd < thisStart) {
        timeline.push({
          type: "gap",
          startDate: prevEnd.toISOString().split("T")[0],
          endDate: new Date(thisStart.getTime() - 86400000).toISOString().split("T")[0],
        });
      }
    }

    timeline.push({ type: "covered", startDate: policy.start_date, endDate: policy.end_date, policy });
  }

  // Check for gap after last policy to now
  if (sorted.length > 0) {
    const lastEnd = new Date(sorted[sorted.length - 1].end_date);
    const now = new Date();
    lastEnd.setDate(lastEnd.getDate() + 1);

    if (lastEnd < now) {
      timeline.push({
        type: "gap",
        startDate: lastEnd.toISOString().split("T")[0],
        endDate: "now",
      });
    }
  }

  // Reverse for display (newest at top)
  const displayTimeline = [...timeline].reverse();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-foreground">Insurance</h1>
        <Button size="sm" onClick={() => setShowAdd(true)}>
          <Plus className="mr-2 h-3.5 w-3.5" />
          Add policy
        </Button>
      </div>

      {policies.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <ShieldAlert className="h-12 w-12 text-muted-foreground/30" />
            <p className="mt-4 text-base font-medium text-foreground">No insurance policies</p>
            <p className="mt-1 text-sm text-muted-foreground max-w-sm">
              Add your first insurance policy to track coverage and get expiry alerts.
            </p>
            <Button className="mt-4" onClick={() => setShowAdd(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add policy
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="pl-1">
          {displayTimeline.map((entry, i) => (
            <TimelineEntry
              key={i}
              type={entry.type}
              startDate={entry.startDate}
              endDate={entry.endDate}
              isGap={entry.type === "gap"}
              policy={entry.policy}
            />
          ))}
        </div>
      )}

      {showAdd && (
        <AddPolicyDialog
          open={showAdd}
          onClose={() => setShowAdd(false)}
          subdivisionId={subdivisionId}
          onCreated={() => router.refresh()}
        />
      )}
    </div>
  );
}
