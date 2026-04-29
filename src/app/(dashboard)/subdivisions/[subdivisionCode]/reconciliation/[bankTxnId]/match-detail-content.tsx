"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { BankTransactionDetail } from "@/lib/validations/reconciliation";
import {
  createMappingDirectAction,
  previewVoidBankTransaction,
  voidBankTransaction,
  type MappingCollisionPayload,
  type ProposalFlagPayload,
} from "@/lib/actions/reconciliation";
import { MatchExcludeDialog } from "@/components/shared/match-exclude-dialog";
import { UnmatchDialog } from "@/components/shared/unmatch-dialog";
import { VoidCascadeConfirmDialog } from "@/components/shared/void-cascade-confirm-dialog";
import { CollisionResolutionDialog } from "@/components/reconciliation/collision-resolution-dialog";
import { useDismissalFlag } from "@/hooks/use-dismissal-flag";
import type { VoidCascadePreview } from "@/lib/validations/reconciliation";
import { TransactionCard } from "./transaction-card";
import { ExistingMatchesSection } from "./existing-matches-section";
import { ClearPendingReceiptsCard } from "./clear-pending-receipts-card";
import { AllocateSummary } from "./allocate-summary";
import { AllocateForm } from "./allocate-form";
import { useSubdivisionCode } from "@/lib/subdivision-context";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

interface Props {
  subdivisionId: string;
  transaction: BankTransactionDetail;
  prefillLotId?: string | null;
}

export function MatchDetailContent({
  subdivisionId,
  transaction,
  prefillLotId,
}: Props) {
  const subdivisionCode = useSubdivisionCode();
  const [isFullyMatched, setIsFullyMatched] = useState(
    transaction.remaining === 0
  );
  const [excludeDialogOpen, setExcludeDialogOpen] = useState(false);
  const [voidDialogOpen, setVoidDialogOpen] = useState(false);
  const [unmatchDialogOpen, setUnmatchDialogOpen] = useState(false);
  const [voidPreview, setVoidPreview] = useState<VoidCascadePreview | null>(null);
  const [unmatchPrefillId, setUnmatchPrefillId] = useState<string | null>(null);
  const [isLoadingVoidPreview, setIsLoadingVoidPreview] = useState(false);
  const [isSubmittingVoid, setIsSubmittingVoid] = useState(false);

  // PP4-D collision dialog + repeat-manual toast state.
  const [collisionPayload, setCollisionPayload] =
    useState<MappingCollisionPayload | null>(null);
  const [pendingProposal, setPendingProposal] =
    useState<ProposalFlagPayload | null>(null);

  const proposalDismissalKey = pendingProposal
    ? `${subdivisionId}:${pendingProposal.canonical_sender_name}:${pendingProposal.lot_id}`
    : "";
  const { dismissed: proposalDismissed, dismiss: dismissProposal } =
    useDismissalFlag(proposalDismissalKey, THIRTY_DAYS_MS);

  // Repeat-manual proposal toast — fires once per (subdivision, canonical, lot)
  // tuple per 30-day window. Backed by useDismissalFlag (localStorage).
  useEffect(() => {
    if (!pendingProposal || proposalDismissed) return;
    const proposal = pendingProposal;
    toast(
      `Create payer mapping for ${proposal.canonical_sender_name} → ${proposal.lot_label}?`,
      {
        duration: 12000,
        action: {
          label: "Create",
          onClick: () => {
            void (async () => {
              const result = await createMappingDirectAction({
                subdivision_id: subdivisionId,
                canonical_sender_name: proposal.canonical_sender_name,
                lot_id: proposal.lot_id,
              });
              if (result.error) {
                toast.error(result.error);
                return;
              }
              if (result.success?.mappingCollision) {
                // A competitor exists — route to the collision dialog.
                setCollisionPayload(result.success.mappingCollision);
                return;
              }
              toast.success("Mapping created");
            })();
          },
        },
        cancel: {
          label: "Not now",
          onClick: () => dismissProposal(),
        },
      },
    );
    // Clear the proposal so we don't re-fire on every render.
    setPendingProposal(null);
  }, [pendingProposal, proposalDismissed, subdivisionId, dismissProposal]);

  const clearCardApplicable =
    transaction.undeposited_candidates &&
    transaction.undeposited_candidates.length > 0;

  const totalUndepositedFunds =
    transaction.undeposited_candidates?.reduce((sum, u) => sum + u.amount, 0) ?? 0;

  const undepositedMatchesExactly = totalUndepositedFunds === transaction.remaining;
  const undepositedPartialMatch =
    clearCardApplicable && totalUndepositedFunds < transaction.remaining && totalUndepositedFunds > 0;

  const showClearCard = undepositedMatchesExactly || undepositedPartialMatch;
  const showAllocateForm = !undepositedMatchesExactly;

  const base = `/subdivisions/${subdivisionCode}/reconciliation`;

  const handleOpenVoidDialog = async () => {
    setIsLoadingVoidPreview(true);
    try {
      const preview = await previewVoidBankTransaction(subdivisionId, transaction.id);
      setVoidPreview(preview);
      setVoidDialogOpen(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load void preview";
      toast.error(message);
    } finally {
      setIsLoadingVoidPreview(false);
    }
  };

  const handleConfirmVoid = async (reason: string) => {
    setIsSubmittingVoid(true);
    try {
      await voidBankTransaction({
        subdivision_id: subdivisionId,
        bank_transaction_id: transaction.id,
        reason,
      });
      toast.success("Transaction voided successfully");
      setVoidDialogOpen(false);
      // Redirect back to queue
      window.location.href = `${base}?status=all`;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to void transaction";
      toast.error(message);
    } finally {
      setIsSubmittingVoid(false);
    }
  };

  const handleUnlink = (matchId: string) => {
    setUnmatchPrefillId(matchId);
    setUnmatchDialogOpen(true);
  };

  return (
    <div className="px-6 py-6">
      {/* Header with back link and action buttons */}
      <div className="flex items-center justify-between gap-2 mb-6">
        <div className="flex items-center gap-2">
          <Link href={base}>
            <Button variant="ghost" size="sm" className="h-8 px-2">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <span className="text-sm text-muted-foreground">
            Back to reconciliation
          </span>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setExcludeDialogOpen(true)}
            className="h-8"
          >
            Exclude
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleOpenVoidDialog}
            disabled={isLoadingVoidPreview}
            className="h-8 text-destructive"
          >
            <Trash2 className="mr-1 h-4 w-4" />
            Void
          </Button>
        </div>
      </div>

      {/* Main layout: left (40%) | right (60%) on desktop, stacked on mobile */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.5fr] gap-6">
        {/* LEFT PANEL */}
        <div className="space-y-6">
          <TransactionCard transaction={transaction} showAllocateForm={showAllocateForm} />

          {transaction.matches.length > 0 && (
            <ExistingMatchesSection
              matches={transaction.matches}
              bankTxnId={transaction.id}
              subdivisionId={subdivisionId}
              onUnlink={handleUnlink}
            />
          )}
        </div>

        {/* RIGHT PANEL */}
        <div className="space-y-6">
          {isFullyMatched && (
            <Card className="shadow-none border-[1.5px] border-green-500/30 bg-green-50">
              <CardContent className="p-4 flex items-center gap-3">
                <Check className="h-5 w-5 text-green-600" />
                <div className="flex-1">
                  <div className="text-sm font-medium text-green-900">
                    This transaction is fully matched
                  </div>
                  <div className="text-xs text-green-700 mt-0.5">
                    All funds have been reconciled to ledger entries.
                  </div>
                </div>
                <Link href={`${base}?status=all`}>
                  <Button variant="outline" size="sm" className="text-xs">
                    Back to queue
                  </Button>
                </Link>
              </CardContent>
            </Card>
          )}

          {showClearCard && (
            <ClearPendingReceiptsCard
              bankTxnId={transaction.id}
              subdivisionId={subdivisionId}
              undepositedEntries={transaction.undeposited_candidates || []}
              totalAmount={totalUndepositedFunds}
              onSuccess={() => {
                if (undepositedMatchesExactly) {
                  setIsFullyMatched(true);
                  toast.success(
                    `Cleared ${transaction.undeposited_candidates?.length ?? 0} pending receipt(s)`
                  );
                } else {
                  toast.success(`Cleared $${totalUndepositedFunds.toFixed(2)} in pending receipts`);
                }
              }}
            />
          )}

          {showAllocateForm && (
            <>
              <AllocateSummary
                bankTxnTotal={transaction.amount}
                alreadyMatched={transaction.matched_total}
                remainingBeforeForm={transaction.remaining}
              />
              <AllocateForm
                bankTxnId={transaction.id}
                subdivisionId={subdivisionId}
                bankAccountFundType={transaction.bank_account_fund_type}
                transactionAmount={transaction.amount}
                alreadyMatched={transaction.matched_total}
                detectedReference={transaction.detected_reference}
                prefillLotId={prefillLotId ?? null}
                onSuccess={(result) => {
                  const newRemaining = transaction.remaining - result.allocated;
                  if (newRemaining === 0) {
                    setIsFullyMatched(true);
                    toast.success("Matched $" + result.allocated.toFixed(2) + " to " + transaction.matches.length + 1 + " lot(s).");
                  } else {
                    toast.success("Matched $" + result.allocated.toFixed(2) + " to lot(s).");
                  }
                  // PP4-D: branch on the reconcile response.
                  if (result.mappingCollision) {
                    setCollisionPayload(result.mappingCollision);
                  } else if (result.proposalFlag) {
                    setPendingProposal(result.proposalFlag);
                  }
                }}
              />
            </>
          )}
        </div>
      </div>

      {/* Dialogs */}
      <MatchExcludeDialog
        open={excludeDialogOpen}
        onOpenChange={setExcludeDialogOpen}
        bankTxnId={transaction.id}
        subdivisionId={subdivisionId}
        onSuccess={() => {
          window.location.href = base;
        }}
      />

      <UnmatchDialog
        open={unmatchDialogOpen}
        onOpenChange={setUnmatchDialogOpen}
        bankTxnId={transaction.id}
        subdivisionId={subdivisionId}
        matches={transaction.matches}
        prefillMatchId={unmatchPrefillId}
        onSuccess={() => {
          setUnmatchPrefillId(null);
          window.location.reload();
        }}
      />

      <VoidCascadeConfirmDialog
        open={voidDialogOpen}
        onOpenChange={setVoidDialogOpen}
        cascadePreview={voidPreview}
        isSubmitting={isSubmittingVoid}
        onConfirm={handleConfirmVoid}
      />

      <CollisionResolutionDialog
        open={collisionPayload !== null}
        onOpenChange={(open) => {
          if (!open) setCollisionPayload(null);
        }}
        payload={collisionPayload}
        flow="reconcile_remember_payer"
        subdivisionId={subdivisionId}
        bankTransactionId={transaction.id}
      />
    </div>
  );
}
