"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, ChevronDown, Download, Mail, Trash2, FolderDown, DollarSign, Undo2, RefreshCw, CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { formatDateLong } from "@/lib/utils";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  markBatchSent,
  markLevySent,
  sendBatchEmails,
  cancelBatch,
  recallBatch,
  resendBatchEmails,
  markBatchPaid,
  regenerateBatch,
  type LevyBatchDetail,
} from "@/lib/actions/levy";

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n);

export function BatchDetailContent({
  subdivisionId,
  batch: initialBatch,
}: {
  subdivisionId: string;
  batch: LevyBatchDetail;
}) {
  const router = useRouter();
  const [batch, setBatch] = useState(initialBatch);
  const [sendingAll, setSendingAll] = useState(false);
  const [emailingAll, setEmailingAll] = useState(false);
  const [sendingIds, setSendingIds] = useState<Set<string>>(new Set());
  const [openLevyId, setOpenLevyId] = useState<string | null>(null);

  async function handleSendAll() {
    setSendingAll(true);
    const result = await markBatchSent(subdivisionId, batch.id);
    setSendingAll(false);

    if (result.success) {
      toast.success("All levies marked as sent");
      setBatch((prev) => ({
        ...prev,
        status: "sent",
        levies: prev.levies.map((l) => ({ ...l, status: l.status === "draft" ? "issued" : l.status })),
      }));
    }
  }

  async function handleEmailAll() {
    setEmailingAll(true);
    const result = await sendBatchEmails(subdivisionId, batch.id);
    setEmailingAll(false);

    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success(`${result.sentCount} levy emails sent`);
      setBatch((prev) => ({
        ...prev,
        status: "sent",
        levies: prev.levies.map((l) => ({
          ...l,
          status: l.status === "draft" && l.owner_contact_email ? "issued" : l.status,
        })),
      }));
    }
  }

  async function handleMarkSent(levyId: string) {
    setSendingIds((prev) => new Set(prev).add(levyId));
    const result = await markLevySent(subdivisionId, levyId);
    setSendingIds((prev) => {
      const next = new Set(prev);
      next.delete(levyId);
      return next;
    });

    if (result.success) {
      toast.success("Levy marked as sent");
      setBatch((prev) => {
        const updatedLevies = prev.levies.map((l) =>
          l.id === levyId ? { ...l, status: "issued" } : l
        );
        const allSent = updatedLevies.every((l) => l.status !== "draft");
        return {
          ...prev,
          status: allSent ? "sent" : "partially_sent",
          levies: updatedLevies,
        };
      });
    }
  }

  const [cancelling, setCancelling] = useState(false);
  const [resending, setResending] = useState(false);
  const [recalling, setRecalling] = useState(false);
  const [markingPaid, setMarkingPaid] = useState(false);
  const [showRegenerate, setShowRegenerate] = useState(false);
  const [regenDate, setRegenDate] = useState<Date | undefined>(undefined);
  const [regenDateOpen, setRegenDateOpen] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  async function handleRegenerate() {
    if (!regenDate) { toast.error("Select a new due date"); return; }
    setRegenerating(true);
    const result = await regenerateBatch(subdivisionId, batch.id, format(regenDate, "yyyy-MM-dd"));
    setRegenerating(false);
    if (result.success) {
      toast.success("Batch regenerated with new due date");
      setShowRegenerate(false);
      router.refresh();
    }
  }

  async function handleRecall() {
    if (!confirm("Recall this levy batch? All levies will revert to draft and be hidden from lot owners. Emails already sent cannot be unsent.")) return;
    setRecalling(true);
    const result = await recallBatch(subdivisionId, batch.id);
    setRecalling(false);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("Batch recalled — levies reverted to draft");
      setBatch((prev) => ({
        ...prev,
        status: "draft",
        levies: prev.levies.map((l) => ({ ...l, status: "draft" })),
      }));
    }
  }

  async function handleMarkPaid() {
    if (!confirm("Mark all levies in this batch as paid? This is for testing purposes.")) return;
    setMarkingPaid(true);
    const result = await markBatchPaid(subdivisionId, batch.id);
    setMarkingPaid(false);
    if (result.success) {
      toast.success("All levies marked as paid");
      setBatch((prev) => ({
        ...prev,
        levies: prev.levies.map((l) => ({ ...l, status: "paid" })),
      }));
    }
  }

  async function handleResendAll() {
    setResending(true);
    const result = await resendBatchEmails(subdivisionId, batch.id);
    setResending(false);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success(`${result.sentCount} levy emails resent`);
    }
  }

  async function handleCancel() {
    if (!confirm("Cancel this levy batch? All levy notices in this batch will be deleted. This cannot be undone.")) return;
    setCancelling(true);
    const result = await cancelBatch(subdivisionId, batch.id);
    setCancelling(false);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("Batch cancelled");
      router.push(`/subdivisions/${subdivisionId}/finance/levies`);
    }
  }

  async function handleDownloadAll() {
    const pdfUrls = batch.levies.filter((l) => l.pdf_url).map((l) => ({ url: l.pdf_url!, name: `${l.reference_number}.pdf` }));
    if (pdfUrls.length === 0) { toast.error("No PDFs available"); return; }

    // Download each PDF and trigger individual downloads
    for (const pdf of pdfUrls) {
      const a = document.createElement("a");
      a.href = pdf.url;
      a.download = pdf.name;
      a.target = "_blank";
      a.click();
      await new Promise((r) => setTimeout(r, 300)); // Small delay between downloads
    }
    toast.success(`${pdfUrls.length} levy PDFs downloading`);
  }

  const draftCount = batch.levies.filter((l) => l.status === "draft").length;
  const fundLabel = batch.fund_type === "administrative" ? "Administrative Fund" : "Capital Works Fund";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => router.push(`/subdivisions/${subdivisionId}/finance/levies`)}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold text-foreground">{batch.period_label}</h1>
              <Badge variant={batch.fund_type === "administrative" ? "info" : "neutral"}>
                {fundLabel}
              </Badge>
              <Badge variant={batch.status === "sent" ? "success" : batch.status === "partially_sent" ? "warning" : "neutral"}>
                {batch.status === "sent" ? "Sent" : batch.status === "partially_sent" ? "Partially sent" : "Draft"}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {formatDateLong(batch.period_start)} — {formatDateLong(batch.period_end)} · Due {formatDateLong(batch.due_date)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {draftCount > 0 && (
            <>
              <Button onClick={handleEmailAll} disabled={emailingAll} size="sm" className="cursor-pointer">
                <Mail className="mr-2 h-3.5 w-3.5" />
                {emailingAll ? "Emailing..." : `Send by email (${draftCount})`}
              </Button>
              <Button onClick={handleSendAll} disabled={sendingAll} size="sm" variant="outline" className="cursor-pointer">
                <CheckCircle2 className="mr-2 h-3.5 w-3.5" />
                {sendingAll ? "Marking..." : "Mark all as sent"}
              </Button>
            </>
          )}
          {draftCount === 0 && batch.levies.length > 0 && (
            <Button onClick={handleResendAll} disabled={resending} size="sm" variant="outline" className="cursor-pointer">
              <Mail className="mr-2 h-3.5 w-3.5" />
              {resending ? "Resending..." : "Resend all by email"}
            </Button>
          )}
          <Button onClick={handleDownloadAll} size="sm" variant="outline" className="cursor-pointer">
            <FolderDown className="mr-2 h-3.5 w-3.5" />
            Download all
          </Button>
          {batch.levies.some((l) => l.status !== "paid") && (
            <Button onClick={handleMarkPaid} disabled={markingPaid} size="sm" variant="outline" className="cursor-pointer">
              <DollarSign className="mr-2 h-3.5 w-3.5" />
              {markingPaid ? "Marking..." : "Mark all as paid"}
            </Button>
          )}
          {(batch.status === "sent" || batch.status === "partially_sent") && !batch.levies.some((l) => l.status === "paid") && (
            <Button onClick={handleRecall} disabled={recalling} size="sm" variant="outline" className="cursor-pointer">
              <Undo2 className="mr-2 h-3.5 w-3.5" />
              {recalling ? "Recalling..." : "Recall batch"}
            </Button>
          )}
          <Button onClick={() => { setRegenDate(undefined); setShowRegenerate(true); }} size="sm" variant="outline" className="cursor-pointer">
            <RefreshCw className="mr-2 h-3.5 w-3.5" />
            Regenerate
          </Button>
          {batch.status === "draft" && (
            <Button onClick={handleCancel} disabled={cancelling} size="sm" variant="ghost" className="cursor-pointer text-destructive hover:text-destructive">
              <Trash2 className="mr-2 h-3.5 w-3.5" />
              {cancelling ? "Cancelling..." : "Cancel batch"}
            </Button>
          )}
        </div>
      </div>

      {/* Regenerate dialog */}
      <Dialog open={showRegenerate} onOpenChange={setShowRegenerate}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Regenerate levy batch</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Set a new due date. All levies will be regenerated with updated PDFs and reverted to draft status.
          </p>
          <div className="space-y-1.5">
            <Label>New due date</Label>
            <Popover open={regenDateOpen} onOpenChange={setRegenDateOpen}>
              <PopoverTrigger className="flex h-9 w-full items-center gap-2 rounded-md border border-border bg-background px-3 text-sm cursor-pointer">
                <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" />
                {regenDate ? format(regenDate, "d MMMM yyyy") : "Select date"}
              </PopoverTrigger>
              <PopoverContent className="w-auto p-2" align="start">
                <Calendar mode="single" selected={regenDate} onSelect={(d) => { setRegenDate(d); setRegenDateOpen(false); }} />
              </PopoverContent>
            </Popover>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowRegenerate(false)} className="cursor-pointer">Cancel</Button>
            <Button onClick={handleRegenerate} disabled={regenerating || !regenDate} className="cursor-pointer">
              {regenerating ? "Regenerating..." : "Regenerate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Info note for drafts */}
      {draftCount > 0 && (
        <p className="text-xs text-muted-foreground bg-muted/50 rounded-md px-3 py-2">
          Lot owners will only see these levies in their dashboard after they are sent or marked as sent.
        </p>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Total amount</p>
            <p className="mt-1 text-xl font-bold tabular-nums">{formatCurrency(batch.total_amount)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Levies</p>
            <p className="mt-1 text-xl font-bold tabular-nums">{batch.levy_count}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Status</p>
            <p className="mt-1 text-xl font-bold">
              {draftCount === 0 ? "All sent" : `${draftCount} pending`}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Levy list */}
      <Card>
        <CardContent className="pt-5">
          <div className="rounded-lg border border-border">
            {batch.levies.map((levy) => (
              <div key={levy.id} className="border-t border-border/50 first:border-t-0">
                <button
                  type="button"
                  onClick={() => setOpenLevyId(openLevyId === levy.id ? null : levy.id)}
                  className="flex w-full items-center justify-between px-4 py-3 text-sm hover:bg-muted/30 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${openLevyId === levy.id ? "rotate-180" : ""}`} />
                    <div className="text-left">
                      <span className="font-medium text-foreground">
                        Lot {levy.lot_number}
                        {levy.unit_number ? ` (Unit ${levy.unit_number})` : ""}
                      </span>
                      <span className="ml-2 text-muted-foreground">
                        {levy.owner_display_name ?? "Unassigned"}
                      </span>
                      <span className="ml-2 text-xs text-muted-foreground">{levy.reference_number}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-semibold tabular-nums">{formatCurrency(levy.amount)}</span>
                    <Badge variant={levy.status === "issued" ? "success" : levy.status === "paid" ? "success" : "neutral"}>
                      {levy.status === "issued" ? "Sent" : levy.status}
                    </Badge>
                  </div>
                </button>

                {openLevyId === levy.id && (
                  <div className="px-4 pb-3 pl-11">
                    {/* Line items */}
                    <div className="rounded-md border border-border bg-card mb-3">
                      <table className="w-full text-sm">
                        <tbody>
                          {levy.items.map((item, i) => (
                            <tr key={i} className="border-t border-border/50 first:border-t-0">
                              <td className="px-3 py-2 text-foreground">
                                {item.description}
                                {item.is_adjustment && (
                                  <span className="ml-1 text-xs text-primary">(adjustment)</span>
                                )}
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums text-foreground w-[120px]">
                                {formatCurrency(item.amount)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      {levy.status === "draft" && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleMarkSent(levy.id)}
                          disabled={sendingIds.has(levy.id)}
                        >
                          <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                          {sendingIds.has(levy.id) ? "Sending..." : "Mark as sent"}
                        </Button>
                      )}
                      {levy.pdf_url && (
                        <a href={levy.pdf_url} target="_blank" rel="noopener noreferrer">
                          <Button variant="outline" size="sm">
                            <Download className="mr-1 h-3.5 w-3.5" />
                            Download PDF
                          </Button>
                        </a>
                      )}
                      {levy.owner_contact_email && (
                        <span className="text-xs text-muted-foreground ml-2">{levy.owner_contact_email}</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
