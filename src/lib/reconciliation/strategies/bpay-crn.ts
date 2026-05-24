// ============================================================================
// Strategy 2 , BPAY CRN
// ----------------------------------------------------------------------------
// Extracts the BPAY Customer Reference Number from the description, validates
// the MOD10V01 check digit, and looks up the matching levy_notice on this
// oc via levy_notices.bpay_crn (composite UNIQUE on
// (oc_id, bpay_crn) WHERE bpay_crn IS NOT NULL).
//
// Behaviour (resolved spec):
//   - Skip if bank_account.bpay_biller_code IS NULL (BPAY not enabled).
//   - Regex tolerates "BPAY 12345678", "BPAY: 12345678", "BPAY-12345678",
//     etc. , up to 10 non-digit characters between "BPAY" and the digits.
//   - Validate the captured CRN with bpay-crn.ts. Invalid check digit →
//     fall through with reason 'invalid_check_digit'.
//   - Fund scope: notice.fund_type must equal bank account's fund.
//   - Stale CRN (notice fully paid): fall through with reason 'stale_crn'.
//     No diagnostic audit (the orchestrator's summary captures this).
//   - Confidence: basiq_auto. Match method: auto_bpay_crn.
//
// Allocation is single-row: BPAY CRNs map 1:1 to a levy notice. If the
// transaction amount exceeds outstanding, allocate min(amount, outstanding)
// , the orchestrator handles the partial-match notes update.
// ============================================================================

import { createServerClient } from "@/lib/supabase";
import type {
  AutoMatchContext,
  FundType,
  StrategyOutcome,
} from "../orchestrator";
import { validateCrn } from "../bpay-crn";

const BPAY_CRN_REGEX = /\bBPAY[^\d]{0,10}(\d{4,20})\b/i;

export async function tryBpayCrnMatch(
  ctx: AutoMatchContext,
): Promise<StrategyOutcome> {
  if (!ctx.bpayBillerCode) {
    return { matched: false, reason: "no_biller_code" };
  }

  const m = ctx.description.match(BPAY_CRN_REGEX);
  if (!m || !m[1]) {
    return { matched: false, reason: "no_crn_found" };
  }
  const crn = m[1];

  if (!validateCrn(crn)) {
    return {
      matched: false,
      reason: "invalid_check_digit",
      metadata: { crn },
    };
  }

  const supabase = createServerClient();

  const { data: notice } = await supabase
    .from("levy_notices")
    .select("id, lot_id, oc_id, fund_type, amount, reference_number, bpay_crn")
    .eq("oc_id", ctx.ocId)
    .eq("bpay_crn", crn)
    .maybeSingle();

  if (!notice) {
    return { matched: false, reason: "crn_not_found", metadata: { crn } };
  }

  if (notice.fund_type !== ctx.bankAccountFundType) {
    return {
      matched: false,
      reason: "fund_mismatch",
      metadata: {
        crn,
        notice_fund: notice.fund_type,
        bank_fund: ctx.bankAccountFundType,
      },
    };
  }

  // Compute outstanding (notice.amount − sum of active credits).
  const { data: credits } = await supabase
    .from("lot_ledger_entries")
    .select("amount")
    .eq("levy_notice_id", notice.id)
    .eq("status", "active")
    .eq("entry_type", "credit");
  const paid = (credits ?? []).reduce((s, c) => s + Number(c.amount), 0);
  const outstanding = round2(Number(notice.amount) - paid);

  if (outstanding <= 0) {
    return { matched: false, reason: "stale_crn", metadata: { crn } };
  }

  const allocAmount = Math.min(ctx.amount, outstanding);

  return {
    matched: true,
    strategy: "bpay_crn",
    confidence: "basiq_auto",
    method: "auto_bpay_crn",
    allocations: [
      {
        lot_id: notice.lot_id,
        fund_type: notice.fund_type as FundType,
        amount: allocAmount,
        levy_notice_id: notice.id,
        reference: notice.reference_number,
      },
    ],
    review_required: false,
    metadata: { crn },
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
