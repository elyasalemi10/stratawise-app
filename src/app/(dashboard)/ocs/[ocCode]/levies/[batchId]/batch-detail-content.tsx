"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, CheckCircle2, ChevronDown, Download, Mail, Trash2, FolderDown,
  DollarSign, Undo2, RefreshCw, AlertTriangle, Loader2, MoreHorizontal,
} from "lucide-react";
import { format } from "date-fns";
import { formatDateLong } from "@/lib/utils";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { LevyStatusBadge } from "@/components/shared/levy-status-badge";
import { DatePicker } from "@/components/shared/date-picker";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  markBatchSent,
  markLevySent,
  cancelBatch,
  recallBatch,
  resendBatchEmails,
  markBatchPaid,
  regenerateBatch,
  type LevyBatchDetail,
} from "@/lib/actions/levy";
import { useOCCode } from "@/lib/oc-context";
import { SendEmailsDialog } from "./send-emails-dialog";

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n);

export function BatchDetailContent({
  ocId,
  batch: initialBatch,
  reminderSentLevyIds = [],
  mailProviderLabel,
}: {
  ocId: string;
  batch: LevyBatchDetail;
  reminderSentLevyIds?: string[];
  mailProviderLabel: string;
}) {
  const ocCode = useOCCode();
  const router = useRouter();
  const [batch, setBatch] = useState(initialBatch);
  const reminderSentSet = new Set(reminderSentLevyIds);
  const [openLevyId, setOpenLevyId] = useState<string | null>(null);

  // Batch-level pending flags , each action keeps a spinner on its own button.
  const [sendingAll, setSendingAll] = useState(false);
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [resending, setResending] = useState(false);
  const [downloadingZip, startDownload] = useTransition();
  const [cancelling, setCancelling] = useState(false);
  const [recalling, setRecalling] = useState(false);
  const [markingPaid, setMarkingPaid] = useState(false);

  // Per-row pending state
  const [sendingIds, setSendingIds] = useState<Set<string>>(new Set());

  // Confirmation dialogs
  const [showMarkPaidConfirm, setShowMarkPaidConfirm] = useState(false);
  const [showRegenerate, setShowRegenerate] = useState(false);
  const [showRegenConfirm, setShowRegenConfirm] = useState(false);
  const [showRecallConfirm, setShowRecallConfirm] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [regenDate, setRegenDate] = useState<string>("");
  const [regenerating, setRegenerating] = useState(false);

  async function handleSendAll() {
    setSendingAll(true);
    const result = await markBatchSent(ocId, batch.id);
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

  async function handleMarkSent(levyId: string) {
    setSendingIds((prev) => new Set(prev).add(levyId));
    const result = await markLevySent(ocId, levyId);
    setSendingIds((prev) => {
      const next = new Set(prev);
      next.delete(levyId);
      return next;
    });
    if (result.success) {
      toast.success("Levy marked as sent");
      setBatch((prev) => {
        const updatedLevies = prev.levies.map((l) =>
          l.id === levyId ? { ...l, status: "issued" } : l,
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

  async function handleRegenerate() {
    if (!regenDate) { toast.error("Select a new due date"); return; }
    setRegenerating(true);
    const result = await regenerateBatch(ocId, batch.id, regenDate);
    setRegenerating(false);
    if (result.success) {
      toast.success("Batch regenerated with new due date");
      setShowRegenerate(false);
      setShowRegenConfirm(false);
      router.refresh();
    }
  }

  async function handleRecall() {
    setRecalling(true);
    const result = await recallBatch(ocId, batch.id);
    setRecalling(false);
    setShowRecallConfirm(false);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("Batch recalled, levies reverted to draft");
      setBatch((prev) => ({
        ...prev,
        status: "draft",
        levies: prev.levies.map((l) => ({ ...l, status: "draft" })),
      }));
    }
  }

  async function handleMarkPaid() {
    setMarkingPaid(true);
    const result = await markBatchPaid(ocId, batch.id);
    setMarkingPaid(false);
    setShowMarkPaidConfirm(false);
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
    const result = await resendBatchEmails(ocId, batch.id);
    setResending(false);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success(`${result.sentCount} levy emails resent`);
    }
  }

  async function handleCancel() {
    setCancelling(true);
    const result = await cancelBatch(ocId, batch.id);
    setCancelling(false);
    setShowCancelConfirm(false);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("Batch cancelled");
      router.push(`/ocs/${ocCode}/levies`);
    }
  }

  // Server-side zip , single GET, single download, no per-PDF popup.
  function handleDownloadAllZip() {
    startDownload(async () => {
      try {
        const res = await fetch(`/api/levy-batches/${batch.id}/zip`);
        if (!res.ok) {
          toast.error("Couldn't build the zip. Try again.");
          return;
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${batch.period_label.replace(/[^\w-]+/g, "-")}-${batch.financial_year}.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (err) {
        console.error("ZIP download failed", err);
        toast.error("Couldn't download the zip.");
      }
    });
  }

  const draftCount = batch.levies.filter((l) => l.status === "draft").length;
  const draftLeviesForDialog = batch.levies
    .filter((l) => l.status === "draft")
    .map((l) => ({
      id: l.id,
      lot_number: l.lot_number,
      unit_number: l.unit_number,
      owner_display_name: l.owner_display_name,
      owner_contact_email: l.owner_contact_email,
      reference_number: l.reference_number,
    }));
  const fundLabel = batch.fund_type === "administrative" ? "Administrative Fund" : "Capital Works Fund";
  const hasPaidLevies = batch.levies.some((l) => l.status === "paid");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => router.push(`/ocs/${ocCode}/levies`)}
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
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {draftCount > 0 && (
            <>
              <Button onClick={() => setEmailDialogOpen(true)} size="sm">
                <Mail className="size-3.5" />
                Send by email ({draftCount})
              </Button>
              <Button onClick={handleSendAll} disabled={sendingAll} size="sm" variant="outline">
                {sendingAll ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
                Mark all as sent
              </Button>
            </>
          )}
          {draftCount === 0 && batch.levies.length > 0 && (
            <Button onClick={handleResendAll} disabled={resending} size="sm" variant="outline">
              {resending ? <Loader2 className="size-3.5 animate-spin" /> : <Mail className="size-3.5" />}
              Resend all by email
            </Button>
          )}
          <Button onClick={handleDownloadAllZip} disabled={downloadingZip} size="sm" variant="outline">
            {downloadingZip ? <Loader2 className="size-3.5 animate-spin" /> : <FolderDown className="size-3.5" />}
            Download all (zip)
          </Button>
          {batch.status === "draft" && (
            <Button
              onClick={() => setShowCancelConfirm(true)}
              size="sm"
              variant="ghost"
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="size-3.5" />
              Cancel batch
            </Button>
          )}

          {/* Advanced actions , dropdown trigger uses default Base UI
              element with our styling, NOT the `render` slot. The render
              slot was causing Base UI error #31 in production. */}
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-border bg-card px-3 text-sm font-medium text-foreground hover:bg-muted cursor-pointer">
              <MoreHorizontal className="size-3.5" />
              Advanced
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Advanced actions
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => { setRegenDate(""); setShowRegenerate(true); }}
              >
                <RefreshCw className="size-3.5" />
                Regenerate
              </DropdownMenuItem>
              {(batch.status === "sent" || batch.status === "partially_sent") && !hasPaidLevies && (
                <DropdownMenuItem onSelect={() => setShowRecallConfirm(true)}>
                  <Undo2 className="size-3.5" />
                  Recall batch
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              {batch.levies.some((l) => l.status !== "paid") ? (
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive focus:bg-destructive/5"
                  onSelect={() => setShowMarkPaidConfirm(true)}
                >
                  <DollarSign className="size-3.5" />
                  Mark batch paid (legacy)
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem disabled className="text-muted-foreground">
                  <DollarSign className="size-3.5" />
                  Mark batch paid (legacy)
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Levy list. Each row's dropdown carries its own period + due-date
          info, line items table, and per-lot actions. The page-level
          summary cards are gone , total + counts moved to the bottom strip. */}
      <Card>
        <CardContent className="pt-5">
          <div className="overflow-hidden rounded-lg border border-border">
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
                      {/* DRN / Macquarie reference first, internal LEV ref
                          fades to muted secondary. */}
                      <span className="ml-2 font-mono text-xs">
                        {levy.drn ? (
                          <>
                            <span className="text-foreground">DRN {levy.drn}</span>
                            <span className="ml-1 text-muted-foreground/70">· {levy.reference_number}</span>
                          </>
                        ) : (
                          <span className="text-muted-foreground">{levy.reference_number}</span>
                        )}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-semibold tabular-nums">{formatCurrency(levy.amount)}</span>
                    <LevyStatusBadge
                      status={levy.status as "draft" | "issued" | "partially_paid" | "paid" | "overdue" | "written_off"}
                      dueDate={batch.due_date}
                      reminderSent={reminderSentSet.has(levy.id)}
                    />
                  </div>
                </button>

                {openLevyId === levy.id && (
                  <div className="px-4 pb-3 pl-11 space-y-3">
                    {/* Period + due date , per-row context */}
                    <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
                      <span>
                        Period: <span className="text-foreground">{formatDateLong(batch.period_start)} - {formatDateLong(batch.period_end)}</span>
                      </span>
                      <span>
                        Due: <span className="text-foreground">{formatDateLong(batch.due_date)}</span>
                      </span>
                      {levy.owner_contact_email && (
                        <span>
                          Email: <span className="text-foreground">{levy.owner_contact_email}</span>
                        </span>
                      )}
                    </div>

                    {/* Line items table , shared Table primitive */}
                    <div className="overflow-hidden rounded-md border border-border">
                      <Table variant="bordered" className="text-sm">
                        <TableHeader>
                          <TableRow>
                            <TableHead>Description</TableHead>
                            <TableHead className="w-32 text-right">Amount</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {levy.items.map((item, i) => (
                            <TableRow key={i}>
                              <TableCell className="text-foreground">
                                {item.description}
                                {item.is_adjustment && (
                                  <span className="ml-1 text-xs text-primary">(adjustment)</span>
                                )}
                              </TableCell>
                              <TableCell className="text-right tabular-nums text-foreground">
                                {formatCurrency(item.amount)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>

                    {/* Per-row actions */}
                    <div className="flex items-center gap-2">
                      {levy.status === "draft" && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleMarkSent(levy.id)}
                          disabled={sendingIds.has(levy.id)}
                        >
                          {sendingIds.has(levy.id)
                            ? <Loader2 className="size-3.5 animate-spin" />
                            : <CheckCircle2 className="size-3.5" />}
                          Mark as sent
                        </Button>
                      )}
                      {levy.pdf_url && (
                        <a href={levy.pdf_url} target="_blank" rel="noopener noreferrer">
                          <Button variant="outline" size="sm">
                            <Download className="size-3.5" />
                            Download PDF
                          </Button>
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Bottom summary strip , replaces the old three KPI cards. */}
      <div className="rounded-lg border border-border bg-card p-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Total batch amount</p>
            <p className="mt-1 text-xl font-bold tabular-nums">{formatCurrency(batch.total_amount)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Levies</p>
            <p className="mt-1 text-xl font-bold tabular-nums">{batch.levy_count}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Outstanding</p>
            <p className="mt-1 text-xl font-bold">
              {draftCount === 0 ? "All sent" : `${draftCount} pending`}
            </p>
          </div>
        </div>
      </div>

      {/* Send-by-email dialog */}
      <SendEmailsDialog
        ocId={ocId}
        batchId={batch.id}
        draftLevies={draftLeviesForDialog}
        mailProviderLabel={mailProviderLabel}
        open={emailDialogOpen}
        onOpenChange={setEmailDialogOpen}
        onSent={(sent) => {
          // Optimistically mark first N drafts as issued for instant feedback.
          setBatch((prev) => {
            let remaining = sent;
            return {
              ...prev,
              status: sent >= draftLeviesForDialog.length ? "sent" : "partially_sent",
              levies: prev.levies.map((l) => {
                if (l.status === "draft" && remaining > 0) {
                  remaining--;
                  return { ...l, status: "issued" };
                }
                return l;
              }),
            };
          });
        }}
      />

      {/* Regenerate dialog */}
      <Dialog open={showRegenerate} onOpenChange={setShowRegenerate}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Regenerate levy batch</DialogTitle>
            <DialogDescription>
              Set a new due date. All levy PDFs will be regenerated and the batch reverts to draft so it can be re-sent.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>New due date</Label>
            <DatePicker value={regenDate} onChange={setRegenDate} />
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setShowRegenerate(false)}>Cancel</Button>
            <Button
              onClick={() => setShowRegenConfirm(true)}
              disabled={!regenDate}
            >
              Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Regenerate confirmation */}
      <AlertDialog open={showRegenConfirm} onOpenChange={setShowRegenConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              Regenerate this batch?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will overwrite every levy PDF in the batch and revert all
              levies to draft. Owners who have already received an email will
              NOT be re-notified automatically , you&apos;ll need to send the
              new notices manually. This action can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRegenerate} disabled={regenerating}>
              {regenerating && <Loader2 className="size-4 animate-spin" />}
              Regenerate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Recall confirmation */}
      <AlertDialog open={showRecallConfirm} onOpenChange={setShowRecallConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              Recall this batch?
            </AlertDialogTitle>
            <AlertDialogDescription>
              All levies revert to draft and are hidden from lot owners. Emails already sent cannot be unsent.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRecall} disabled={recalling}>
              {recalling && <Loader2 className="size-4 animate-spin" />}
              Recall
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancel batch confirmation */}
      <AlertDialog open={showCancelConfirm} onOpenChange={setShowCancelConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              Cancel this batch?
            </AlertDialogTitle>
            <AlertDialogDescription>
              All levy notices in this batch will be deleted. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep batch</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancel}
              disabled={cancelling}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {cancelling && <Loader2 className="size-4 animate-spin" />}
              Cancel batch
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Mark batch paid confirmation */}
      <AlertDialog open={showMarkPaidConfirm} onOpenChange={setShowMarkPaidConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              Mark this batch as paid?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Legacy action. Prefer the reconciliation queue for new payments. Any ledger credits already covering these notices will trigger a coverage warning in the audit log.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={handleMarkPaid}
              disabled={markingPaid}
            >
              {markingPaid && <Loader2 className="size-4 animate-spin" />}
              Mark paid anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
