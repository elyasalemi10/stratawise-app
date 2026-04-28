// ============================================================================
// Auto-match orchestrator — multi-strategy pipeline
// ----------------------------------------------------------------------------
// Single entry point for the reconciliation auto-match pipeline. Replaces
// the single-path tryAutoMatchByReference (kept as a thin @deprecated
// delegate in src/lib/reconciliation/auto-match.ts during the PP4-A
// transition). Strategies are dispatched in fixed priority order; the
// orchestrator stops at the first match and writes ONE summary
// audit_log entry per invocation.
//
// Strategy order (PP4 spec §Architecture overview):
//   1. reference        — MSM levy reference (LEV-{n}) — full PP4-A
//   2. bpay_crn         — MSM BPAY CRN check-digit       — full PP4-A
//   3. known_payer      — canonical sender → lot mapping — stub PP4-A → full PP4-B
//   4. keyword_amount   — batch keyword + amount agree   — stub PP4-A → full PP4-B
//   5. amount_window    — single candidate by amount + date window — stub → PP4-B
//   6. fuzzy_hint       — Jaro-Winkler hint surface only — stub PP4-A → full PP4-C
//
// Audit volume (resolved earlier):
//   - One audit_log row per orchestrator invocation summarising every
//     strategy attempted, plus matched_via and hint_surfaced flags.
//   - Strategies may emit additional diagnostic audits on edge cases
//     (e.g. reconciliation.stale_reference_detected). The orchestrator
//     summary is independent of those.
//   - rpc_reconcile_bank_transaction writes its own reconciliation.matched
//     audit when the orchestrator commits a match — that is part of the
//     RPC contract, not the orchestrator's responsibility.
//
// No `"use server"` directive — pure helper. Callers (server actions,
// cron tasks, webhook handlers) already resolve performedBy from auth
// guards. Strategies receive a pre-augmented AutoMatchContext (with
// bankAccountFundType + bpayBillerCode pulled in here) so they don't
// each re-query bank_accounts.
// ============================================================================

import { createServerClient } from "@/lib/supabase";
import { tryReferenceMatch } from "./strategies/reference";
import { tryBpayCrnMatch } from "./strategies/bpay-crn";
import { tryKnownPayerMatch } from "./strategies/known-payer";
import { tryKeywordAmountMatch } from "./strategies/keyword-amount";
import { tryAmountWindowMatch } from "./strategies/amount-window";
import { tryFuzzySenderMatch } from "./strategies/fuzzy-hint";

// ─── Types ────────────────────────────────────────────────────────────────

export type FundType = "administrative" | "capital_works";

export type StrategyName =
  | "reference"
  | "bpay_crn"
  | "known_payer"
  | "keyword_amount"
  | "amount_window"
  | "fuzzy_hint";

export type MatchConfidence =
  | "exact_reference"
  | "amount_match"
  | "name_match"
  | "manual"
  | "auto_portal"
  | "basiq_auto"
  | "system_created";

export type MatchMethod =
  | "manual"
  | "auto_reference"
  | "auto_bpay_crn"
  | "auto_sender"
  | "auto_amount"
  | "system";

/** Minimal input from callers — orchestrator augments to AutoMatchContext. */
export interface AutoMatchInput {
  bankTransactionId: string;
  subdivisionId: string;
  bankAccountId: string;
  description: string;
  amount: number;
  transactionDate: string; // ISO YYYY-MM-DD
  performedBy: string;
}

/** Enriched ctx passed to strategies. Includes bank account derivatives. */
export interface AutoMatchContext extends AutoMatchInput {
  bankAccountFundType: FundType;
  bpayBillerCode: string | null;
}

export interface Allocation {
  lot_id: string;
  fund_type: FundType;
  amount: number;
  levy_notice_id?: string | null;
  reference?: string | null;
}

export type StrategyOutcome =
  | {
      matched: true;
      strategy: StrategyName;
      confidence: MatchConfidence;
      method: MatchMethod;
      allocations: Allocation[];
      review_required: boolean;
      metadata?: Record<string, unknown>;
    }
  | {
      matched: false;
      reason: string;
      metadata?: Record<string, unknown>;
    };

export interface AutoMatchOutcome {
  matched: boolean; // true iff full match (allocations cover the full tx amount)
  strategy: StrategyName | null;
  reference: string | null; // first matched reference, for backward-compat callers
  partial: boolean;
  allocatedAmount: number;
  warning: string | null;
}

interface StrategyAttempt {
  strategy: StrategyName;
  outcome: string; // "matched" or the failure reason
  details?: Record<string, unknown>;
}

// ─── Strategy registry ────────────────────────────────────────────────────

const STRATEGY_ORDER: ReadonlyArray<
  readonly [StrategyName, (ctx: AutoMatchContext) => Promise<StrategyOutcome>]
> = [
  ["reference", tryReferenceMatch],
  ["bpay_crn", tryBpayCrnMatch],
  ["known_payer", tryKnownPayerMatch],
  ["keyword_amount", tryKeywordAmountMatch],
  ["amount_window", tryAmountWindowMatch],
  ["fuzzy_hint", tryFuzzySenderMatch],
] as const;

// ─── Orchestrator entry point ─────────────────────────────────────────────

export async function tryAutoMatch(
  input: AutoMatchInput,
): Promise<AutoMatchOutcome> {
  const supabase = createServerClient();

  // Augment ctx from bank_accounts (fund + biller code).
  const { data: bankAccount } = await supabase
    .from("bank_accounts")
    .select("fund_type, bpay_biller_code")
    .eq("id", input.bankAccountId)
    .single();

  if (!bankAccount) {
    return failureOutcome(`bank_account ${input.bankAccountId} not found`);
  }

  const ctx: AutoMatchContext = {
    ...input,
    bankAccountFundType: bankAccount.fund_type as FundType,
    bpayBillerCode: bankAccount.bpay_biller_code ?? null,
  };

  // Run strategies in order; stop at first match. fuzzy_hint never matches
  // but may surface a hint — handled via the metadata flag.
  const strategiesTried: StrategyAttempt[] = [];
  let matchedOutcome:
    | (StrategyOutcome & { matched: true; strategy: StrategyName })
    | null = null;
  let hintSurfaced = false;
  let fuzzyHintMetadata: Record<string, unknown> | null = null;

  for (const [name, fn] of STRATEGY_ORDER) {
    const outcome = await fn(ctx);
    if (outcome.matched) {
      strategiesTried.push({
        strategy: name,
        outcome: "matched",
        details: outcome.metadata,
      });
      matchedOutcome = { ...outcome, strategy: name };
      break;
    }
    strategiesTried.push({
      strategy: name,
      outcome: outcome.reason,
      details: outcome.metadata,
    });
    if (
      name === "fuzzy_hint" &&
      outcome.metadata &&
      outcome.metadata.hint_surfaced === true
    ) {
      hintSurfaced = true;
      fuzzyHintMetadata = outcome.metadata;
    }
  }

  // Apply match if any.
  let allocatedAmount = 0;
  let partial = false;
  let warning: string | null = null;
  let firstReference: string | null = null;

  if (matchedOutcome) {
    const allocSum = round2(
      matchedOutcome.allocations.reduce((s, a) => s + a.amount, 0),
    );

    const { error: matchErr } = await supabase.rpc(
      "rpc_reconcile_bank_transaction",
      {
        p_bank_transaction_id: ctx.bankTransactionId,
        p_allocations: matchedOutcome.allocations,
        p_match_method: matchedOutcome.method,
        p_match_confidence: matchedOutcome.confidence,
        p_notes: `Auto-matched via ${matchedOutcome.strategy}`,
        p_performed_by: ctx.performedBy,
      },
    );

    if (matchErr) {
      // Match failed inside the RPC. Audit the failure (separate from the
      // orchestrator summary below) so the cause is visible.
      await supabase.from("audit_log").insert({
        profile_id: ctx.performedBy,
        subdivision_id: ctx.subdivisionId,
        action: "reconciliation.auto_match_failed",
        entity_type: "bank_transaction",
        entity_id: ctx.bankTransactionId,
        metadata: {
          strategy: matchedOutcome.strategy,
          error: matchErr.message,
        },
      });
      // Still write the orchestrator summary so the audit trail is consistent.
      await writeOrchestratorAudit(
        supabase,
        ctx,
        strategiesTried,
        null,
        hintSurfaced,
      );
      return {
        matched: false,
        strategy: null,
        reference: null,
        partial: false,
        allocatedAmount: 0,
        warning: matchErr.message,
      };
    }

    // Optional review_required flag on the match rows.
    if (matchedOutcome.review_required) {
      await supabase
        .from("reconciliation_matches")
        .update({ review_required: true })
        .eq("bank_transaction_id", ctx.bankTransactionId);
    }

    allocatedAmount = allocSum;
    partial = allocSum < ctx.amount;
    firstReference = matchedOutcome.allocations[0]?.reference ?? null;

    if (partial) {
      const remaining = round2(ctx.amount - allocSum);
      warning = `Auto-matched $${allocSum.toFixed(2)} via ${matchedOutcome.strategy}; $${remaining.toFixed(2)} remaining — review manually.`;
      // TODO(pre-launch): If notes is non-null, append rather than overwrite.
      // Currently safe because notes is system-written-only in PP4-A.
      await supabase
        .from("bank_transactions")
        .update({ notes: warning })
        .eq("id", ctx.bankTransactionId);
    }
  }

  // Persist fuzzy hint on the bank_transaction so the queue UI can surface it.
  if (hintSurfaced && fuzzyHintMetadata) {
    await supabase
      .from("bank_transactions")
      .update({ fuzzy_hint_metadata: fuzzyHintMetadata })
      .eq("id", ctx.bankTransactionId);
  }

  // Single orchestrator-level audit summarising every attempt.
  await writeOrchestratorAudit(
    supabase,
    ctx,
    strategiesTried,
    matchedOutcome ? matchedOutcome.strategy : null,
    hintSurfaced,
  );

  return {
    matched: matchedOutcome !== null && !partial,
    strategy: matchedOutcome ? matchedOutcome.strategy : null,
    reference: firstReference,
    partial,
    allocatedAmount,
    warning,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────

async function writeOrchestratorAudit(
  supabase: ReturnType<typeof createServerClient>,
  ctx: AutoMatchContext,
  strategiesTried: StrategyAttempt[],
  matchedVia: StrategyName | null,
  hintSurfaced: boolean,
): Promise<void> {
  await supabase.from("audit_log").insert({
    profile_id: ctx.performedBy,
    subdivision_id: ctx.subdivisionId,
    action: "reconciliation.auto_match_attempted",
    entity_type: "bank_transaction",
    entity_id: ctx.bankTransactionId,
    metadata: {
      strategies_tried: strategiesTried,
      matched_via: matchedVia,
      hint_surfaced: hintSurfaced,
    },
  });
}

function failureOutcome(reason: string): AutoMatchOutcome {
  return {
    matched: false,
    strategy: null,
    reference: null,
    partial: false,
    allocatedAmount: 0,
    warning: reason,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
