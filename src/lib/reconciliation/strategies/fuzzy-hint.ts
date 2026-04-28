// ============================================================================
// Strategy 6 — fuzzy sender hint
// ----------------------------------------------------------------------------
// PP4-A: stub. Full implementation lands in PP4-C alongside the
// canonicaliser, similarity (Jaro-Winkler), and the fuzzy_hint_metadata
// JSONB column (already in the PP4-A schema delta). Strategy 6 NEVER
// auto-matches — it only surfaces a hint via metadata.hint_surfaced
// which the orchestrator persists onto bank_transactions.
// ============================================================================

import type { StrategyOutcome } from "../orchestrator";

export async function tryFuzzySenderMatch(): Promise<StrategyOutcome> {
  return { matched: false, reason: "not_implemented_pp4a" };
}
