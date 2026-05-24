// ============================================================================
// Strategy 1 , StrataWise levy reference (LEV-{n})
// ----------------------------------------------------------------------------
// Extracts levy references from the bank-transaction description, looks
// them up against outstanding levy_notices in the bank account's fund,
// and FIFO-allocates the transaction amount across them in
// description-order.
//
// Behaviour (resolved spec):
//   - Flexible regex: "LEV-7", "LEV 7", "Levy 7", "7-LEV", "7 Levy", etc.
//   - Strip leading zeros at lookup ("LEV-007" → "LEV-7").
//   - Dedupe references, preserving description-order (first occurrence wins).
//   - Multi-reference FIFO: walk references in description-order; allocate
//     min(remaining_tx_amount, outstanding) to each notice; stop when the
//     transaction amount is exhausted or all references processed.
//   - Stale reference (notice fully paid): write
//     reconciliation.stale_reference_detected audit and SKIP the reference.
//     If every reference is stale or missing, return matched: false so
//     the orchestrator falls through to the next strategy.
//   - Per-bank-account fund scope: only notices whose fund_type matches
//     the bank account's fund are considered.
//   - Confidence: exact_reference. Match method: auto_reference.
// ============================================================================

import { createServerClient } from "@/lib/supabase";
import type {
  Allocation,
  AutoMatchContext,
  FundType,
  StrategyOutcome,
} from "../orchestrator";

const LEV_REF_REGEX = /\b(?:lev(?:y)?\s*[-]?\s*(\d+)|(\d+)\s*[-]?\s*lev(?:y)?)\b/gi;

export async function tryReferenceMatch(
  ctx: AutoMatchContext,
): Promise<StrategyOutcome> {
  // Extract references in description-order (FIFO), dedupe preserving order.
  const orderedRefs: string[] = [];
  const seen = new Set<string>();
  for (const m of ctx.description.matchAll(LEV_REF_REGEX)) {
    const raw = m[1] ?? m[2];
    const n = Number.parseInt(raw, 10);
    if (Number.isFinite(n) && n > 0) {
      const ref = `LEV-${n}`;
      if (!seen.has(ref)) {
        seen.add(ref);
        orderedRefs.push(ref);
      }
    }
  }

  if (orderedRefs.length === 0) {
    return { matched: false, reason: "no_reference" };
  }

  const supabase = createServerClient();

  // Look up notices in this oc + bank account fund.
  const { data: notices } = await supabase
    .from("levy_notices")
    .select("id, lot_id, oc_id, fund_type, amount, reference_number")
    .eq("oc_id", ctx.ocId)
    .eq("fund_type", ctx.bankAccountFundType)
    .in("reference_number", orderedRefs);

  if (!notices || notices.length === 0) {
    return {
      matched: false,
      reason: "no_notice_found",
      metadata: { references: orderedRefs },
    };
  }

  // Compute outstanding per notice (notice.amount − sum of active credits).
  const noticeIds = notices.map((n) => n.id);
  const { data: credits } = await supabase
    .from("lot_ledger_entries")
    .select("levy_notice_id, amount")
    .in("levy_notice_id", noticeIds)
    .eq("status", "active")
    .eq("entry_type", "credit");

  const paidByNotice = new Map<string, number>();
  for (const c of credits ?? []) {
    if (!c.levy_notice_id) continue;
    paidByNotice.set(
      c.levy_notice_id,
      (paidByNotice.get(c.levy_notice_id) ?? 0) + Number(c.amount),
    );
  }

  const noticeByRef = new Map(notices.map((n) => [n.reference_number, n]));

  const allocations: Allocation[] = [];
  const staleRefs: string[] = [];
  const missingRefs: string[] = [];
  let remaining = ctx.amount;

  for (const ref of orderedRefs) {
    if (remaining <= 0) break;
    const notice = noticeByRef.get(ref);
    if (!notice) {
      missingRefs.push(ref);
      continue;
    }

    const paid = paidByNotice.get(notice.id) ?? 0;
    const outstanding = round2(Number(notice.amount) - paid);
    if (outstanding <= 0) {
      staleRefs.push(ref);
      continue;
    }

    const allocAmount = Math.min(remaining, outstanding);
    allocations.push({
      lot_id: notice.lot_id,
      fund_type: notice.fund_type as FundType,
      amount: allocAmount,
      levy_notice_id: notice.id,
      reference: notice.reference_number,
    });
    remaining = round2(remaining - allocAmount);
  }

  // Diagnostic audits for stale references , one per stale ref.
  if (staleRefs.length > 0) {
    const rows = staleRefs.map((ref) => ({
      profile_id: ctx.performedBy,
      oc_id: ctx.ocId,
      action: "reconciliation.stale_reference_detected",
      entity_type: "bank_transaction" as const,
      entity_id: ctx.bankTransactionId,
      metadata: { reference: ref, strategy: "reference" },
    }));
    await supabase.from("audit_log").insert(rows);
  }

  if (allocations.length === 0) {
    return {
      matched: false,
      reason:
        staleRefs.length > 0
          ? "all_references_stale"
          : missingRefs.length > 0
            ? "no_outstanding_notices"
            : "no_allocation",
      metadata: {
        references: orderedRefs,
        stale_references: staleRefs,
        missing_references: missingRefs,
      },
    };
  }

  return {
    matched: true,
    strategy: "reference",
    confidence: "exact_reference",
    method: "auto_reference",
    allocations,
    review_required: false,
    metadata: {
      references_matched: allocations.map((a) => a.reference),
      stale_references: staleRefs,
      missing_references: missingRefs,
      multi_reference_fifo: allocations.length > 1,
    },
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
