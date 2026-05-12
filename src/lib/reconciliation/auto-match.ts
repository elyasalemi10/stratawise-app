// ============================================================================
// Legacy delegate — tryAutoMatchByReference
// ----------------------------------------------------------------------------
// PP4-A migrated all production callers (addManualBankTransaction,
// pollConnectionAsSystem) to call tryAutoMatch directly. This function
// remains as a thin delegate for any out-of-tree caller still using the
// pre-PP4-A signature. Behaviour is now multi-strategy via the orchestrator
// (reference + BPAY CRN), not reference-only.
//
// Flagged for removal in PRE_LAUNCH_CLEANUP once a grep confirms no
// remaining callers.
//
// No `"use server"` directive — pure helper.
// ============================================================================

import { createServerClient } from "@/lib/supabase";
import { tryAutoMatch } from "./orchestrator";

export interface AutoMatchArgs {
  bankTransactionId: string;
  ocId: string;
  description: string;
  amount: number;
  performedBy: string;
}

export interface AutoMatchResult {
  matched: boolean;
  reference: string | null;
  partial: boolean;
  allocatedAmount: number;
  warning: string | null;
}

/**
 * @deprecated Call tryAutoMatch from `@/lib/reconciliation/orchestrator`
 * directly. This delegate looks up the bank account from the bank
 * transaction (one extra round-trip vs. the orchestrator's direct
 * input shape), then forwards. Kept only for transitional compatibility.
 */
export async function tryAutoMatchByReference(
  args: AutoMatchArgs,
): Promise<AutoMatchResult> {
  const supabase = createServerClient();
  const { data: bt } = await supabase
    .from("bank_transactions")
    .select("bank_account_id, transaction_date")
    .eq("id", args.bankTransactionId)
    .maybeSingle();
  if (!bt) {
    return {
      matched: false,
      reference: null,
      partial: false,
      allocatedAmount: 0,
      warning: `bank_transaction ${args.bankTransactionId} not found`,
    };
  }

  const outcome = await tryAutoMatch({
    bankTransactionId: args.bankTransactionId,
    ocId: args.ocId,
    bankAccountId: bt.bank_account_id,
    description: args.description,
    amount: args.amount,
    transactionDate: bt.transaction_date,
    performedBy: args.performedBy,
  });

  return {
    matched: outcome.matched,
    reference: outcome.reference,
    partial: outcome.partial,
    allocatedAmount: outcome.allocatedAmount,
    warning: outcome.warning,
  };
}
