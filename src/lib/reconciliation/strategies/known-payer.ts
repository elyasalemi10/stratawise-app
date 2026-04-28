// ============================================================================
// Strategy 3 — known payer (canonical sender → lot mapping)
// ----------------------------------------------------------------------------
// Canonicalises the bank-transaction description; looks up the active
// mapping in bank_payer_mappings; allocates against the mapped lot's
// outstanding notices via priority + due_date FIFO (fund-scoped to bank
// account).
//
// Behaviour:
//   - canonicaliseSender returns null → reason: 'no_canonical_name'
//   - 0 active mappings for canonical → reason: 'no_mapping'
//   - ≥2 active mappings → reason: 'ambiguous_mapping' (defensive; the
//     partial UNIQUE active index should make this impossible)
//   - 1 active mapping but lot has no outstanding notices → 'no_outstanding_notices'
//   - All notices fully paid → 'all_notices_paid'
//   - Otherwise: FIFO allocate across the lot's outstanding notices in
//     (allocation_priority ASC, due_date ASC) order.
//
// Confidence: name_match. Method: auto_sender. review_required: false
// (an exact canonical match is high-confidence; amount-based and
// fuzzy-name strategies are the ones that surface the review badge).
//
// AUDIT METADATA (R1 mitigation): metadata includes raw_description,
// canonical_sender_name, mapping_id so audit-log queries can flag
// canonicaliser-induced misroutes for forensic review.
// ============================================================================

import { createServerClient } from "@/lib/supabase";
import type {
  Allocation,
  AutoMatchContext,
  FundType,
  StrategyOutcome,
} from "../orchestrator";
import { canonicaliseSender } from "../canonical";

export async function tryKnownPayerMatch(
  ctx: AutoMatchContext,
): Promise<StrategyOutcome> {
  const canonical = canonicaliseSender(ctx.description);
  if (!canonical) {
    return { matched: false, reason: "no_canonical_name" };
  }

  const supabase = createServerClient();

  const { data: mappings } = await supabase
    .from("bank_payer_mappings")
    .select("id, lot_id")
    .eq("subdivision_id", ctx.subdivisionId)
    .eq("canonical_sender_name", canonical)
    .eq("status", "active");

  if (!mappings || mappings.length === 0) {
    return {
      matched: false,
      reason: "no_mapping",
      metadata: { canonical_sender_name: canonical },
    };
  }
  if (mappings.length > 1) {
    return {
      matched: false,
      reason: "ambiguous_mapping",
      metadata: { canonical_sender_name: canonical, count: mappings.length },
    };
  }

  const mapping = mappings[0];
  const mappedLotId = mapping.lot_id;

  // Outstanding notices on the mapped lot, fund-scoped to the bank account.
  const { data: notices } = await supabase
    .from("levy_notices")
    .select("id, lot_id, fund_type, amount, reference_number, due_date")
    .eq("lot_id", mappedLotId)
    .eq("subdivision_id", ctx.subdivisionId)
    .eq("fund_type", ctx.bankAccountFundType);

  if (!notices || notices.length === 0) {
    return {
      matched: false,
      reason: "no_outstanding_notices",
      metadata: { canonical_sender_name: canonical, lot_id: mappedLotId },
    };
  }

  const noticeIds = notices.map((n) => n.id);

  // Sum of active credits per notice (paidByNotice).
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

  // Fetch debit allocation_priority per notice (lowest priority found wins
  // — matches walker semantics).
  const { data: debits } = await supabase
    .from("lot_ledger_entries")
    .select("levy_notice_id, allocation_priority")
    .in("levy_notice_id", noticeIds)
    .eq("status", "active")
    .eq("entry_type", "debit");
  const priorityByNotice = new Map<string, number>();
  for (const d of debits ?? []) {
    if (!d.levy_notice_id) continue;
    const cur = priorityByNotice.get(d.levy_notice_id);
    const p = (d.allocation_priority as number) ?? 2;
    if (cur === undefined || p < cur) priorityByNotice.set(d.levy_notice_id, p);
  }

  // Sort by (priority ASC, due_date ASC).
  const sorted = [...notices].sort((a, b) => {
    const pA = priorityByNotice.get(a.id) ?? 2;
    const pB = priorityByNotice.get(b.id) ?? 2;
    if (pA !== pB) return pA - pB;
    return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
  });

  // FIFO allocate.
  const allocations: Allocation[] = [];
  let remaining = ctx.amount;
  for (const notice of sorted) {
    if (remaining <= 0) break;
    const paid = paidByNotice.get(notice.id) ?? 0;
    const outstanding = round2(Number(notice.amount) - paid);
    if (outstanding <= 0) continue;
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

  if (allocations.length === 0) {
    return {
      matched: false,
      reason: "all_notices_paid",
      metadata: { canonical_sender_name: canonical, lot_id: mappedLotId },
    };
  }

  return {
    matched: true,
    strategy: "known_payer",
    confidence: "name_match",
    method: "auto_sender",
    allocations,
    review_required: false,
    metadata: {
      canonical_sender_name: canonical,
      lot_id: mappedLotId,
      mapping_id: mapping.id,
      // R1 mitigation: log raw description so audit-log queries can
      // find canonicaliser-induced misroutes (manual unmatch within N days
      // of a name_match auto-match).
      raw_description: ctx.description,
    },
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
