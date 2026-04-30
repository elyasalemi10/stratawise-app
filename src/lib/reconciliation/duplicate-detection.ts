// ============================================================================
// Bank-side duplicate detection (PP5-A)
// ----------------------------------------------------------------------------
// Pure helpers (no "use server"). Callers — CSV import, manual entry, Basiq
// poller — invoke `detectDuplicate` synchronously after inserting a new
// bank_transactions row. If flagged, callers invoke `markDuplicate` to
// write the duplicate_of / duplicate_status / duplicate_metadata fields and
// then SKIP the orchestrator. The orchestrator self-defends (reads
// duplicate_status before running strategies) but the explicit caller-side
// skip avoids the wasted round-trip and surfaces clearly in audit/UI.
//
// Detection key: hash equality on the normalised description, equal amount,
// same bank_account, within +/-2 days. Voided / excluded / already-suspected
// rows are ineligible parents (see candidate-pool predicates below).
//
// Scope: per bank_account_id. Cross-account (admin x capital_works) and
// cross-subdivision matches are intentionally out of scope — see
// CONTEXT.md PP5 §Duplicates.
//
// Empty-after-normalise descriptions: two amount-equal rows on the same day
// with descriptions that normalise to "" will both hash to the same value
// and flag. Documented behaviour — recovery path is fast (manager rejects).
// ============================================================================

import { createHash } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  duplicateMetadataSchema,
  type DuplicateMetadata,
  type TransactionSource,
} from "@/lib/validations/reconciliation";

// ─── Pure helpers ─────────────────────────────────────────────────────────

/**
 * Normalises a transaction description for duplicate-detection comparison.
 *
 * Pipeline (exact spec from PP5-0 user resolution):
 *   1. Uppercase
 *   2. Strip MSM reference tokens (LEV-/RCP-/PAY-/MSM-{PREFIX}-{YYYY}-{NNNN})
 *   3. Strip non-word chars (replace with space)
 *   4. Collapse whitespace, trim
 *
 * Reference tokens are stripped because two sources (Basiq vs CSV vs manual)
 * may format them differently ("LEV-12" vs "Ref:LEV-12" vs "lev12"). The
 * normaliser collapses these so the hash is source-agnostic.
 */
export function normaliseDescription(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/\bLEV-?\s*\d+\b/g, "")
    .replace(/\bRCP-?\s*\d+\b/g, "")
    .replace(/\bPAY-?\s*\d+\b/g, "")
    .replace(/\bMSM-[A-Z]+-\d+-\d+\b/g, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * SHA-256 of the input, truncated to the first 16 hex chars (64 bits).
 * Detection-by-equality across the small candidate pool of one bank_account
 * over a +/-2-day window — collision risk negligible. See PP5 §Duplicates
 * in CONTEXT.md for the ratification.
 */
export function hashDescription(normalised: string): string {
  return createHash("sha256").update(normalised).digest("hex").slice(0, 16);
}

// ─── Detector ─────────────────────────────────────────────────────────────

export interface DetectDuplicateInput {
  id: string;
  bank_account_id: string;
  transaction_date: string; // ISO YYYY-MM-DD
  amount: number;
  description: string | null;
  source: TransactionSource;
}

export type DetectDuplicateResult =
  | { flagged: false }
  | {
      flagged: true;
      duplicate_of: string;
      metadata: DuplicateMetadata;
    };

/**
 * Looks for an older bank_transactions row in the same account that
 * hash-matches `newRow` on normalised description, amount, and a +/-2-day
 * date window. Voided, excluded, and already-suspected rows are excluded
 * from the candidate pool (chain prevention per Q6).
 *
 * Returns flagged=true with the older row's id and full metadata payload
 * on the first hash match (older-first ordering); flagged=false otherwise.
 */
export async function detectDuplicate(
  newRow: DetectDuplicateInput,
  supabase: SupabaseClient,
): Promise<DetectDuplicateResult> {
  const newNorm = normaliseDescription(newRow.description ?? "");
  const newHash = hashDescription(newNorm);

  const minDate = shiftDateIso(newRow.transaction_date, -2);
  const maxDate = shiftDateIso(newRow.transaction_date, +2);

  const { data: candidates, error } = await supabase
    .from("bank_transactions")
    .select(
      "id, source, transaction_date, amount, description, duplicate_of, match_status, is_voided",
    )
    .eq("bank_account_id", newRow.bank_account_id)
    .neq("id", newRow.id)
    .gte("transaction_date", minDate)
    .lte("transaction_date", maxDate)
    .eq("amount", newRow.amount)
    .is("duplicate_of", null) // chain prevention
    .neq("match_status", "excluded") // excluded rows can't anchor
    .eq("is_voided", false) // voided rows can't anchor; lets PG use idx_bank_transactions_active
    .order("transaction_date", { ascending: true })
    .order("id", { ascending: true });

  if (error || !candidates || candidates.length === 0) {
    return { flagged: false };
  }

  for (const c of candidates as Array<{
    id: string;
    source: TransactionSource;
    transaction_date: string;
    amount: number | string;
    description: string | null;
  }>) {
    const candidateNorm = normaliseDescription(c.description ?? "");
    const candidateHash = hashDescription(candidateNorm);
    if (candidateHash !== newHash) continue;

    const dayDelta = Math.abs(daysBetween(newRow.transaction_date, c.transaction_date));

    const metadata: DuplicateMetadata = {
      matched_against: c.id,
      older_source: c.source,
      newer_source: newRow.source,
      day_delta: dayDelta,
      amount: Number(c.amount),
      normalised_description: newNorm,
      description_hash: newHash,
    };

    // Validate before returning so callers always receive a known shape.
    duplicateMetadataSchema.parse(metadata);

    return {
      flagged: true,
      duplicate_of: c.id,
      metadata,
    };
  }

  return { flagged: false };
}

// ─── Marker (caller-invoked after a successful detection) ─────────────────

/**
 * Applies a flagged detection result to the database: updates the new row
 * with duplicate_of / duplicate_status='suspected' / duplicate_metadata,
 * and writes a `bank_transaction.duplicate_detected` audit_log entry.
 *
 * Caller responsibility: do NOT call tryAutoMatch on a row after
 * markDuplicate succeeds. The orchestrator also self-defends but skipping
 * caller-side avoids the wasted round-trip.
 */
export async function markDuplicate(args: {
  bank_transaction_id: string;
  subdivision_id: string;
  duplicate_of: string;
  metadata: DuplicateMetadata;
  performedBy: string;
  supabase: SupabaseClient;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { bank_transaction_id, subdivision_id, duplicate_of, metadata, performedBy, supabase } = args;

  const { error: updErr } = await supabase
    .from("bank_transactions")
    .update({
      duplicate_of,
      duplicate_status: "suspected",
      duplicate_metadata: metadata,
    })
    .eq("id", bank_transaction_id);
  if (updErr) return { ok: false, error: updErr.message };

  const { error: auditErr } = await supabase.from("audit_log").insert({
    profile_id: performedBy,
    subdivision_id,
    action: "bank_transaction.duplicate_detected",
    entity_type: "bank_transaction",
    entity_id: bank_transaction_id,
    after_state: {
      duplicate_of,
      duplicate_status: "suspected",
    },
    metadata,
  });
  if (auditErr) return { ok: false, error: auditErr.message };

  return { ok: true };
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
