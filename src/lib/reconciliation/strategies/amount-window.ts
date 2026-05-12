// ============================================================================
// Strategy 5 — amount window
// ----------------------------------------------------------------------------
// Looks up outstanding notices in this oc/fund whose amount equals
// tx.amount (within $0.01 tolerance) AND whose due_date sits within ±30
// days of the transaction date. If EXACTLY ONE candidate remains: match.
// Multiple candidates → no_match (Addition 1: NO priority preference at the
// strategy level — priority is a walker concern only).
//
// Confidence: amount_match. Method: auto_amount. review_required: TRUE
// (queue renders amber "review suggested" badge).
// ============================================================================

import { createServerClient } from "@/lib/supabase";
import type {
  AutoMatchContext,
  FundType,
  StrategyOutcome,
} from "../orchestrator";

const WINDOW_DAYS = 30;
const AMOUNT_TOLERANCE = 0.01;

export async function tryAmountWindowMatch(
  ctx: AutoMatchContext,
): Promise<StrategyOutcome> {
  const supabase = createServerClient();

  // Date window: tx.transactionDate ± 30 days.
  const txDate = new Date(ctx.transactionDate);
  const start = new Date(txDate);
  start.setUTCDate(start.getUTCDate() - WINDOW_DAYS);
  const end = new Date(txDate);
  end.setUTCDate(end.getUTCDate() + WINDOW_DAYS);
  const startIso = start.toISOString().slice(0, 10);
  const endIso = end.toISOString().slice(0, 10);

  const { data: notices } = await supabase
    .from("levy_notices")
    .select("id, lot_id, fund_type, amount, reference_number, due_date")
    .eq("oc_id", ctx.ocId)
    .eq("fund_type", ctx.bankAccountFundType)
    .gte("amount", ctx.amount - AMOUNT_TOLERANCE)
    .lte("amount", ctx.amount + AMOUNT_TOLERANCE)
    .gte("due_date", startIso)
    .lte("due_date", endIso);

  if (!notices || notices.length === 0) {
    return { matched: false, reason: "no_candidates" };
  }

  // Filter to outstanding only.
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

  const outstanding = notices.filter((n) => {
    const paid = paidByNotice.get(n.id) ?? 0;
    return Number(n.amount) - paid > AMOUNT_TOLERANCE;
  });

  if (outstanding.length === 0) {
    return { matched: false, reason: "no_outstanding_candidates" };
  }
  if (outstanding.length > 1) {
    // Addition 1: multiple candidates → skip strategy entirely. NO priority
    // preference here — priority is a walker concern, not a strategy concern.
    return {
      matched: false,
      reason: "multiple_candidates",
      metadata: { candidate_count: outstanding.length },
    };
  }

  const notice = outstanding[0];
  const paid = paidByNotice.get(notice.id) ?? 0;
  const outstandingAmount = round2(Number(notice.amount) - paid);
  const allocAmount = Math.min(ctx.amount, outstandingAmount);

  return {
    matched: true,
    strategy: "amount_window",
    confidence: "amount_match",
    method: "auto_amount",
    allocations: [
      {
        lot_id: notice.lot_id,
        fund_type: notice.fund_type as FundType,
        amount: allocAmount,
        levy_notice_id: notice.id,
        reference: notice.reference_number,
      },
    ],
    review_required: true,
    metadata: {
      due_date: notice.due_date,
      amount_diff: round2(Math.abs(Number(notice.amount) - ctx.amount)),
    },
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
