// ============================================================================
// Ledger-side duplicate detection (PP5-B)
// ----------------------------------------------------------------------------
// Pure helpers (no "use server"). Two integration sites:
//   - orchestrator (tryAutoMatch) — after rpc_reconcile_bank_transaction
//   - reconcileTransaction (manual match) — after rpc_reconcile_bank_transaction
// Both invoke `detectAndMarkLedgerDuplicates` synchronously after a
// payment-category credit is committed. The helper iterates over the
// credit ids returned by the RPC, runs the detector per credit, and
// marks flagged rows via UPDATE + audit_log.
//
// Cash receipts are NOT integrated. rpc_record_cash_receipt creates
// credits with levy_notice_id=NULL (untargeted) — the linkage to a
// specific notice happens later via rpc_deposit_undeposited_funds. Since
// the eligibility predicate excludes untargeted credits, calling the
// helper from recordCashReceipt would be dead code. PRE_LAUNCH_CLEANUP
// records the option of revisiting once receipt-to-notice linkage lands.
//
// Detection key (structural; no description normalisation):
//   same lot_id + same levy_notice_id + same amount + both
//   entry_type='credit' + both category='payment' + entry_date within
//   ±7 days. Voided rows and already-suspected rows are excluded from
//   the candidate pool (chain prevention).
//
// Window rationale — ±7 days vs bank-side ±2 days:
//   - Bank-side ±2d reflects bank-settlement tightness (OSKO same-day,
//     T+1 typical, T+2 rare).
//   - Ledger-side ±7d reflects payment-cycle reality (an owner can pay
//     via card today and the bank-side OSKO entry can land days later;
//     two manually-recorded receipts can drift further).
//   - Known false-positive surface: instalment plans where an owner pays
//     $X today + $X in 5 days against the same notice. Manager has a
//     clean reject path via keepAsOverpayment.
//   - PRE_LAUNCH_CLEANUP: tighten to ±3d (or add an instalment-plan flag
//     on levy_notices) if production reveals noise.
//
// Eligibility predicate (which categories trigger detection):
//   ─── DETECTS ────────────────────────────────────────────────────────
//   - payment            (the only category in scope; the spec key)
//   ─── DOES NOT DETECT ────────────────────────────────────────────────
//   - levy / special_levy / interest    (debits — not payments)
//   - writeoff                           (credit, but not a real-money payment)
//   - adjustment_credit / adjustment_debit (manual adjustments, not duplicates)
//   - refund                             (debit; reverses a payment)
//   - void_offset                        (the void mechanism itself —
//                                         same lot/notice/amount as the
//                                         entry it voids; would generate
//                                         spurious flags without this
//                                         exclusion)
//
// Untargeted credits (levy_notice_id IS NULL) are out of scope by the
// detection key — see CONTEXT.md PP5 §Duplicates.
// ============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ledgerDuplicateMetadataSchema,
  type LedgerDuplicateMetadata,
} from "@/lib/validations/reconciliation";
import type { LedgerEntryCategory, LedgerEntryType } from "@/lib/validations/ledger";

// ─── Types ────────────────────────────────────────────────────────────────

const WINDOW_DAYS = 7;

export interface DetectLedgerDuplicateInput {
  id: string;
  lot_id: string;
  entry_type: LedgerEntryType;
  category: LedgerEntryCategory;
  amount: number;
  levy_notice_id: string | null;
  entry_date: string; // ISO YYYY-MM-DD
}

export type DetectLedgerDuplicateResult =
  | { flagged: false }
  | {
      flagged: true;
      duplicate_of: string;
      metadata: LedgerDuplicateMetadata;
    };

// ─── Detector ─────────────────────────────────────────────────────────────

/**
 * Returns flagged=true with the older entry's id and full metadata payload
 * on the first hash-equal candidate (older-first ordering); flagged=false
 * otherwise. Eligibility predicate filters out non-payment categories,
 * debits, and unlinked credits up front.
 */
export async function detectLedgerDuplicate(
  newEntry: DetectLedgerDuplicateInput,
  supabase: SupabaseClient,
): Promise<DetectLedgerDuplicateResult> {
  // Eligibility: only payment-category credits with a linked levy_notice_id.
  if (newEntry.entry_type !== "credit") return { flagged: false };
  if (newEntry.category !== "payment") return { flagged: false };
  if (!newEntry.levy_notice_id) return { flagged: false };

  const minDate = shiftDateIso(newEntry.entry_date, -WINDOW_DAYS);
  const maxDate = shiftDateIso(newEntry.entry_date, +WINDOW_DAYS);

  const { data: candidates, error } = await supabase
    .from("lot_ledger_entries")
    .select("id, category, entry_date, amount, status, duplicate_of")
    .eq("lot_id", newEntry.lot_id)
    .neq("id", newEntry.id)
    .eq("levy_notice_id", newEntry.levy_notice_id)
    .eq("entry_type", "credit")
    .eq("category", "payment")
    .eq("amount", newEntry.amount)
    .gte("entry_date", minDate)
    .lte("entry_date", maxDate)
    .is("duplicate_of", null) // chain prevention
    .eq("status", "active") // voided rows can't anchor
    .order("entry_date", { ascending: true })
    .order("id", { ascending: true });

  if (error || !candidates || candidates.length === 0) {
    return { flagged: false };
  }

  const c = candidates[0] as {
    id: string;
    category: LedgerEntryCategory;
    entry_date: string;
    amount: number | string;
  };

  const dayDelta = Math.abs(daysBetween(newEntry.entry_date, c.entry_date));

  const metadata: LedgerDuplicateMetadata = {
    matched_against: c.id,
    lot_id: newEntry.lot_id,
    levy_notice_id: newEntry.levy_notice_id,
    amount: Number(c.amount),
    day_delta: dayDelta,
    older_category: c.category,
    newer_category: newEntry.category,
  };

  ledgerDuplicateMetadataSchema.parse(metadata);

  return {
    flagged: true,
    duplicate_of: c.id,
    metadata,
  };
}

// ─── Marker ───────────────────────────────────────────────────────────────

/**
 * UPDATE + audit_log. Caller responsibility: do NOT call any further
 * mutating logic on a marked row before the manager reviews.
 */
export async function markLedgerDuplicate(args: {
  lot_ledger_entry_id: string;
  oc_id: string;
  duplicate_of: string;
  metadata: LedgerDuplicateMetadata;
  performedBy: string;
  supabase: SupabaseClient;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { lot_ledger_entry_id, oc_id, duplicate_of, metadata, performedBy, supabase } = args;

  const { error: updErr } = await supabase
    .from("lot_ledger_entries")
    .update({
      duplicate_of,
      duplicate_status: "suspected",
      duplicate_metadata: metadata,
    })
    .eq("id", lot_ledger_entry_id);
  if (updErr) return { ok: false, error: updErr.message };

  const { error: auditErr } = await supabase.from("audit_log").insert({
    profile_id: performedBy,
    oc_id,
    action: "lot_ledger_entry.duplicate_detected",
    entity_type: "lot_ledger_entry",
    entity_id: lot_ledger_entry_id,
    after_state: { duplicate_of, duplicate_status: "suspected" },
    metadata,
  });
  if (auditErr) return { ok: false, error: auditErr.message };

  return { ok: true };
}

// ─── Centralised integration helper ───────────────────────────────────────

/**
 * Used by the three integration sites (orchestrator post-RPC,
 * reconcileTransaction post-RPC, recordCashReceipt post-RPC). Iterates
 * over fresh credit ids, fetches the columns the detector needs, and
 * runs detect + mark per credit. Aggregates results.
 *
 * Marker failures don't roll back the credit (it's already committed by
 * the RPC) — the row stays unmarked + unflagged, and the failure is
 * logged via console.error with full forensics context for Sentry.
 */
export async function detectAndMarkLedgerDuplicates(args: {
  creditIds: string[];
  ocId: string;
  performedBy: string;
  supabase: SupabaseClient;
}): Promise<{ flagged: number; mark_failures: number }> {
  const { creditIds, ocId, performedBy, supabase } = args;
  if (creditIds.length === 0) return { flagged: 0, mark_failures: 0 };

  const { data: rows, error } = await supabase
    .from("lot_ledger_entries")
    .select("id, lot_id, entry_type, category, amount, levy_notice_id, entry_date")
    .in("id", creditIds);
  if (error || !rows) return { flagged: 0, mark_failures: 0 };

  let flagged = 0;
  let markFailures = 0;

  for (const row of rows as Array<{
    id: string;
    lot_id: string;
    entry_type: LedgerEntryType;
    category: LedgerEntryCategory;
    amount: number | string;
    levy_notice_id: string | null;
    entry_date: string;
  }>) {
    const detection = await detectLedgerDuplicate(
      {
        id: row.id,
        lot_id: row.lot_id,
        entry_type: row.entry_type,
        category: row.category,
        amount: Number(row.amount),
        levy_notice_id: row.levy_notice_id,
        entry_date: row.entry_date,
      },
      supabase,
    );
    if (!detection.flagged) continue;

    const marked = await markLedgerDuplicate({
      lot_ledger_entry_id: row.id,
      oc_id: ocId,
      duplicate_of: detection.duplicate_of,
      metadata: detection.metadata,
      performedBy,
      supabase,
    });
    if (marked.ok) {
      flagged += 1;
    } else {
      markFailures += 1;
      // PP5-B ratification: row stays unflagged on mark failure; log full
      // forensics context for Sentry. The credit itself is committed and
      // active — we don't roll it back.
      console.error(`[ledger-duplicate-detection] markLedgerDuplicate failed`, {
        ledger_entry_id: row.id,
        oc_id: ocId,
        duplicate_of: detection.duplicate_of,
        error: marked.error,
      });
    }
  }

  return { flagged, mark_failures: markFailures };
}

// ─── Date arithmetic helpers (UTC, day-resolution) ────────────────────────

function shiftDateIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(a: string, b: string): number {
  const da = new Date(`${a}T00:00:00Z`).getTime();
  const db = new Date(`${b}T00:00:00Z`).getTime();
  return Math.round((da - db) / (24 * 60 * 60 * 1000));
}
