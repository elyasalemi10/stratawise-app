// ============================================================================
// Strategy 4 — keyword + amount
// ----------------------------------------------------------------------------
// Looks up batches in this subdivision with non-empty match_keywords; tests
// each keyword against the description (case-insensitive prefix-within-word
// match \bkeyword\w*\b — so "garden" matches "gardening" and "gardens" but
// not "regarden"); narrows to outstanding notices in those batches whose
// amount EXACTLY equals tx.amount and fund matches the bank account.
//
// Per Gap A: per-notice exact-amount match only. No multi-notice
// subset-sum combinations (deferred indefinitely — exponential cost).
//
// If exactly one outstanding candidate remains: match. Multiple → no_match.
// Confidence: amount_match. Method: auto_amount. review_required: TRUE
// (queue renders amber "review suggested" badge).
//
// Input keyword validation (min 4 chars, blocklist) is enforced at batch-
// creation time in src/lib/validations/levy.ts (Gap J). This strategy
// trusts the keywords already on levy_batches.match_keywords.
// ============================================================================

import { createServerClient } from "@/lib/supabase";
import type {
  AutoMatchContext,
  FundType,
  StrategyOutcome,
} from "../orchestrator";

const REGEX_META = /[.*+?^${}()|[\]\\]/g;

export async function tryKeywordAmountMatch(
  ctx: AutoMatchContext,
): Promise<StrategyOutcome> {
  const supabase = createServerClient();

  // Find batches in this subdivision with non-empty match_keywords.
  const { data: batches } = await supabase
    .from("levy_batches")
    .select("id, match_keywords")
    .eq("subdivision_id", ctx.subdivisionId);

  const candidateBatches = (batches ?? []).filter(
    (b) => Array.isArray(b.match_keywords) && b.match_keywords.length > 0,
  );
  if (candidateBatches.length === 0) {
    return { matched: false, reason: "no_keyword_batches" };
  }

  // Test each batch's keywords against the description.
  const descLower = ctx.description.toLowerCase();
  const hitBatchIds: string[] = [];
  const keywordsByBatch = new Map<string, string[]>();
  for (const batch of candidateBatches) {
    const hits = (batch.match_keywords as string[]).filter((kw) => {
      const escaped = kw.toLowerCase().replace(REGEX_META, "\\$&");
      return new RegExp(`\\b${escaped}\\w*\\b`).test(descLower);
    });
    if (hits.length > 0) {
      hitBatchIds.push(batch.id);
      keywordsByBatch.set(batch.id, hits);
    }
  }
  if (hitBatchIds.length === 0) {
    return { matched: false, reason: "no_keyword_hit" };
  }

  // Narrow to notices in hit batches with exact-amount match in this fund.
  const { data: notices } = await supabase
    .from("levy_notices")
    .select("id, lot_id, fund_type, amount, reference_number, batch_id")
    .in("batch_id", hitBatchIds)
    .eq("subdivision_id", ctx.subdivisionId)
    .eq("fund_type", ctx.bankAccountFundType)
    .eq("amount", ctx.amount);

  if (!notices || notices.length === 0) {
    return { matched: false, reason: "no_amount_match" };
  }

  // Filter to outstanding (sum credits per notice).
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
    return Number(n.amount) - paid > 0.005;
  });
  if (outstanding.length === 0) {
    return { matched: false, reason: "no_outstanding_notices" };
  }
  if (outstanding.length > 1) {
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
    strategy: "keyword_amount",
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
      batch_id: notice.batch_id,
      keyword_hits: keywordsByBatch.get(notice.batch_id) ?? [],
    },
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
