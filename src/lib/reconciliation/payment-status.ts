// ============================================================================
// computeLevyPaymentStatus — thin RPC caller wrapping _walk_per_notice_status
// ----------------------------------------------------------------------------
// Returns the snapshot-aware per-notice payment status for a lot at a given
// asOfDate (defaults to today). Wraps the SQL function so TS callers don't
// re-implement the walker — see database-schema.sql §_walk_per_notice_status
// for the canonical algorithm + snapshot semantics.
//
// Prompt 7 certificate rendering MUST call this rather than reading
// levy_notices.status directly. PRE_LAUNCH_CLEANUP records the rule.
//
// No `"use server"` directive — pure helper. Auth is the caller's job
// (server actions invoking this should already have called
// requireOCAccess on the lot's oc).
// ============================================================================

import { createServerClient } from "@/lib/supabase";

export type FundType = "administrative" | "capital_works";
export type LevyPaymentStatusValue = "paid" | "partially_paid" | "outstanding";

export interface LevyPaymentStatus {
  notice_id: string;
  reference_number: string;
  fund_type: FundType;
  due_date: string;
  amount: number;
  status: LevyPaymentStatusValue;
  paid_date: string | null;
  paid_amount: number;
  outstanding_amount: number;
}

interface WalkRow {
  notice_id: string;
  reference_number: string;
  fund_type: string;
  due_date: string;
  amount: string | number;
  status: string;
  paid_date: string | null;
  paid_amount: string | number;
  outstanding_amount: string | number;
}

/**
 * Per-notice payment status for a lot at p_as_of_date (defaults to today).
 * Wraps the _walk_per_notice_status SQL function. Throws on RPC error.
 */
export async function computeLevyPaymentStatus(
  lotId: string,
  asOfDate?: string,
): Promise<LevyPaymentStatus[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase.rpc("_walk_per_notice_status", {
    p_lot_id: lotId,
    p_as_of_date: asOfDate ?? todayIsoDate(),
  });
  if (error) {
    throw new Error(`computeLevyPaymentStatus: ${error.message}`);
  }
  return ((data ?? []) as WalkRow[]).map((row) => ({
    notice_id: row.notice_id,
    reference_number: row.reference_number,
    fund_type: row.fund_type as FundType,
    due_date: row.due_date,
    amount: Number(row.amount),
    status: row.status as LevyPaymentStatusValue,
    paid_date: row.paid_date,
    paid_amount: Number(row.paid_amount),
    outstanding_amount: Number(row.outstanding_amount),
  }));
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}
