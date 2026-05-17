"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Repeat, Building2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/shared/date-picker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  listManagementCompanies,
  transferOCManagement,
  type ManagementCompanyOption,
  type ActiveAgreement,
} from "@/lib/actions/management-transfer";

// Settings → Management card. Shows the active management_agreement +
// a "Transfer" action that closes the active row, opens a new one for
// the chosen agency, and updates the legacy pointer on the OC. The
// outgoing manager keeps attribution on all historical levies / audit
// trail because every levy / payment row is timestamped against the
// agreement that was active at that time.

export function ManagementCard({
  ocId,
  currentCompanyId,
  agreement,
}: {
  ocId: string;
  currentCompanyId: string;
  agreement: ActiveAgreement | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<ManagementCompanyOption[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [chosenId, setChosenId] = useState<string>("");
  const [date, setDate] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  // Lazy-load the picker list when the dialog opens — keeps the Settings
  // page snappy when the user isn't actually transferring.
  useEffect(() => {
    if (!open || options.length > 0) return;
    setLoadingOptions(true);
    listManagementCompanies(currentCompanyId).then((data) => {
      setOptions(data);
      setLoadingOptions(false);
    });
  }, [open, currentCompanyId, options.length]);

  async function submit() {
    if (!chosenId) {
      toast.error("Pick a management agency to transfer to.");
      return;
    }
    if (!date) {
      toast.error("Pick a transfer date.");
      return;
    }
    setSubmitting(true);
    const r = await transferOCManagement({
      ocId,
      newManagementCompanyId: chosenId,
      transferDate: date,
      notes: notes.trim() || undefined,
    });
    setSubmitting(false);
    if ("error" in r) {
      toast.error(r.error);
      return;
    }
    toast.success("Management transferred.");
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <Card>
        <CardContent className="pt-5">
          <h3 className="text-sm font-semibold text-foreground mb-3">Management</h3>
          <div className="flex items-start justify-between gap-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm text-muted-foreground">Current agency</p>
              <p className="mt-1 text-base font-semibold text-foreground truncate">
                {agreement?.manager_name ?? "Not set"}
              </p>
              {agreement?.manager_trading_as && (
                <p className="text-xs text-muted-foreground truncate">
                  trading as {agreement.manager_trading_as}
                </p>
              )}
              {agreement?.start_date && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Active since {new Date(agreement.start_date).toLocaleDateString("en-AU", {
                    day: "numeric", month: "short", year: "numeric",
                  })}
                </p>
              )}
            </div>
            <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
              <Repeat className="mr-2 h-3.5 w-3.5" />
              Transfer
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={(o) => { if (!submitting) setOpen(o); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Transfer to a different agency</DialogTitle>
            <DialogDescription>
              Closes the current management agreement on the transfer date and opens a new one with the chosen agency. Historical levies, audit trail, and lot ownerships stay attributed to the previous manager.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>New management agency</Label>
              {loadingOptions ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Loading agencies…
                </div>
              ) : options.length === 0 ? (
                <p className="text-sm text-muted-foreground inline-flex items-center gap-2">
                  <Building2 className="h-3.5 w-3.5" />
                  No other agencies are registered on the platform.
                </p>
              ) : (
                <Select value={chosenId} onValueChange={(v) => setChosenId(v ?? "")}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Pick an agency…">
                      {options.find((o) => o.id === chosenId)?.name ?? "Pick an agency…"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {options.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.name}{o.trading_as ? ` (${o.trading_as})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Transfer date</Label>
              <DatePicker value={date} onChange={setDate} />
            </div>

            <div className="space-y-1.5">
              <Label>Notes (optional)</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Reason for the transfer, handover terms, etc."
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={submitting || options.length === 0}>
              {submitting && <Loader2 className="size-4 animate-spin" />}
              {submitting ? "Transferring…" : "Transfer management"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
