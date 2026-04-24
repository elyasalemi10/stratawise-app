import { createServerClient } from "@/lib/supabase";

// ============================================================================
// MSM-LEV reference auto-match — framework-agnostic
// ----------------------------------------------------------------------------
// Shared by:
//   - addManualBankTransaction (src/lib/actions/reconciliation.ts) —
//     server action with auth; resolves performedBy from requireCompanyRole
//   - pollConnectionAsSystem (src/lib/basiq/jobs.ts) — cron / webhook path;
//     performedBy flows in from the connection's own created_by
//
// This module has NO `"use server"` directive on purpose. tryAutoMatchByReference
// was previously exported from src/lib/actions/reconciliation.ts (which IS
// "use server"), which made it reachable as a server action from any client
// component with a crafted import — a caller could pass an arbitrary
// `performedBy` UUID and bypass auth. By living outside the "use server"
// surface, this function is no longer a server action at all: only server-
// side callers (other server actions, cron tasks, webhook handlers) can
// reach it, and those already have a server-resolved performer.
//
// The function itself carries no auth guard — auth is the caller's job.
// That's consistent with the function being a pure application-layer helper
// that stitches together a single Basiq-reference match; it doesn't expose
// any capability the caller doesn't already have.
// ============================================================================

const REF_REGEX_GLOBAL = /\bMSM-LEV-\d{4}-\d{6}\b/gi;

export interface AutoMatchArgs {
  bankTransactionId: string;
  subdivisionId: string;
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

export async function tryAutoMatchByReference(
  args: AutoMatchArgs,
): Promise<AutoMatchResult> {
  const supabase = createServerClient();
  const refs = args.description.match(REF_REGEX_GLOBAL) ?? [];
  if (refs.length !== 1) {
    return {
      matched: false,
      reference: null,
      partial: false,
      allocatedAmount: 0,
      warning: null,
    };
  }
  const reference = refs[0].toUpperCase();

  const { data: notice } = await supabase
    .from("levy_notices")
    .select("id, lot_id, subdivision_id, fund_type, amount, reference_number")
    .eq("subdivision_id", args.subdivisionId)
    .eq("reference_number", reference)
    .single();
  if (!notice) {
    return {
      matched: false,
      reference,
      partial: false,
      allocatedAmount: 0,
      warning: null,
    };
  }

  // Outstanding = notice.amount − sum of active credits targeting this notice.
  const { data: credits } = await supabase
    .from("lot_ledger_entries")
    .select("amount, entry_type, status")
    .eq("levy_notice_id", notice.id)
    .eq("status", "active")
    .eq("entry_type", "credit");
  const paidSoFar = (credits ?? []).reduce(
    (s, c) => s + Number(c.amount),
    0,
  );
  const outstanding = round2(Number(notice.amount) - paidSoFar);
  if (outstanding <= 0) {
    return {
      matched: false,
      reference,
      partial: false,
      allocatedAmount: 0,
      warning: null,
    };
  }

  const allocated = Math.min(args.amount, outstanding);
  const partial = args.amount > outstanding;

  const { error: matchErr } = await supabase.rpc(
    "rpc_reconcile_bank_transaction",
    {
      p_bank_transaction_id: args.bankTransactionId,
      p_allocations: [
        {
          lot_id: notice.lot_id,
          fund_type: notice.fund_type,
          amount: allocated,
          levy_notice_id: notice.id,
          reference: notice.reference_number,
        },
      ],
      p_match_method: "auto_reference",
      p_match_confidence: "exact_reference",
      p_notes: `CSV/manual auto-match on reference ${reference}`,
      p_performed_by: args.performedBy,
    },
  );
  if (matchErr) {
    await supabase.from("audit_log").insert({
      profile_id: args.performedBy,
      subdivision_id: args.subdivisionId,
      action: "reconciliation.auto_match_failed",
      entity_type: "bank_transaction",
      entity_id: args.bankTransactionId,
      metadata: { reason: matchErr.message, reference },
    });
    return {
      matched: false,
      reference,
      partial: false,
      allocatedAmount: 0,
      warning: matchErr.message,
    };
  }

  if (partial) {
    await supabase
      .from("bank_transactions")
      .update({
        notes: `Auto-matched $${allocated.toFixed(2)} against ${reference}; $${(args.amount - allocated).toFixed(2)} remaining — review manually.`,
      })
      .eq("id", args.bankTransactionId);
  }

  return {
    matched: !partial,
    reference,
    partial,
    allocatedAmount: allocated,
    warning: partial
      ? `Amount exceeded outstanding — $${(args.amount - allocated).toFixed(2)} remains unmatched.`
      : null,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
