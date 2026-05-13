// ============================================================================
// Strategy 0 — DEFT Reference Number (Macquarie TXN)
// ----------------------------------------------------------------------------
// When Macquarie's TXN-file ingest sets `bank_transactions.deft_reference_number`,
// this strategy is the highest-confidence path: the DRN points to exactly one
// lot in the lot_drns time-bounded mapping table.
//
// Lookup rules:
//   1. Skip when ctx.deftReferenceNumber is null or empty (typical for
//      non-Macquarie OCs or for transactions without a DRN reference).
//   2. Find the lot_drns row where `drn = ctx.deftReferenceNumber` AND the
//      transaction date falls inside [active_from, active_to ?? +inf).
//      Multiple historical rows can carry the same DRN — historical
//      transactions stay linked to the DRN that was active when received.
//   3. Verify the resolved lot belongs to ctx.ocId (defence-in-depth — a
//      stale DRN from a previous management should NOT match a different
//      OC's lot).
//   4. Find the outstanding levy notice on that lot matching the fund. If
//      multiple are outstanding, prefer the oldest unpaid; split the credit
//      across notices is handled by the orchestrator's allocation pass.
//
// Confidence: basiq_auto (we trust Macquarie's tag). Method: auto_deft_drn.
// ============================================================================

import { createServerClient } from "@/lib/supabase";
import type {
  Allocation,
  AutoMatchContext,
  StrategyOutcome,
  FundType,
} from "../orchestrator";

export async function tryDeftDrnMatch(
  ctx: AutoMatchContext,
): Promise<StrategyOutcome> {
  const drn = (ctx.deftReferenceNumber ?? "").trim();
  if (!drn) return { matched: false, reason: "no_drn" };

  const supabase = createServerClient();

  // Date-aware lookup. Active_to is exclusive — a DRN reassigned today should
  // not match a transaction landing the same date if active_from > txn date.
  // We use `or` with `is.null` so the live row (active_to IS NULL) wins when
  // it's the active period.
  const { data: drnRows } = await supabase
    .from("lot_drns")
    .select("lot_id, drn, active_from, active_to")
    .eq("drn", drn)
    .lte("active_from", ctx.transactionDate);

  // Pick the row whose active window contains ctx.transactionDate. Manual
  // filter — Supabase REST can't express the (active_to IS NULL OR active_to
  // >= date) clause cleanly without an RPC.
  const matched = (drnRows ?? []).find((r) =>
    r.active_to == null || r.active_to >= ctx.transactionDate,
  );
  if (!matched) {
    return { matched: false, reason: "drn_not_mapped_for_date", metadata: { drn } };
  }

  // Belt-and-braces: verify the lot belongs to ctx.ocId.
  const { data: lot } = await supabase
    .from("lots")
    .select("id, oc_id")
    .eq("id", matched.lot_id)
    .maybeSingle();
  if (!lot || lot.oc_id !== ctx.ocId) {
    return {
      matched: false,
      reason: "drn_lot_other_oc",
      metadata: { drn, expected_oc: ctx.ocId, actual_oc: lot?.oc_id ?? null },
    };
  }

  // Find outstanding levy notices on this lot in the matching fund. Order by
  // due_date asc so the oldest unpaid gets the credit first.
  const { data: notices } = await supabase
    .from("levy_notices")
    .select("id, amount, fund_type, status, due_date, reference_number")
    .eq("lot_id", matched.lot_id)
    .eq("oc_id", ctx.ocId)
    .eq("fund_type", ctx.bankAccountFundType as FundType)
    .neq("status", "draft")
    .neq("status", "written_off")
    .order("due_date", { ascending: true });

  if (!notices || notices.length === 0) {
    // DRN matched but there's nothing outstanding to apply against. Treat
    // as a credit/over-payment — the orchestrator will surface it for
    // manual disposition.
    return {
      matched: false,
      reason: "drn_no_outstanding",
      metadata: { drn, lot_id: matched.lot_id },
    };
  }

  // Allocate across notices until the transaction amount is exhausted. We
  // rely on v_levy_notice_status downstream to compute remaining-outstanding
  // per notice, but at strategy time we'll over-allocate; orchestrator's
  // reconcile RPC handles the per-notice cap and refunds the surplus.
  let remaining = ctx.amount;
  const allocations: Allocation[] = [];
  for (const n of notices) {
    if (remaining <= 0) break;
    const slice = Math.min(remaining, Number(n.amount));
    if (slice > 0) {
      allocations.push({
        lot_id: matched.lot_id,
        fund_type: n.fund_type as FundType,
        amount: slice,
        levy_notice_id: n.id,
        reference: n.reference_number ?? null,
      });
      remaining -= slice;
    }
  }
  if (allocations.length === 0) {
    return { matched: false, reason: "drn_no_allocatable_notices", metadata: { drn } };
  }

  return {
    matched: true,
    strategy: "deft_drn",
    confidence: "exact_reference",
    method: "auto_deft_drn",
    allocations,
    review_required: false,
    metadata: { drn, lot_id: matched.lot_id, allocated_notices: allocations.length },
  };
}
