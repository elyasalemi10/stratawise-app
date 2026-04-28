// ============================================================================
// Strategy 4 — keyword + amount
// ----------------------------------------------------------------------------
// PP4-A: stub. Full implementation lands in PP4-B with levy_batches.match_keywords
// already in the schema (PP4-A delta). Stub keeps the orchestrator registry
// stable.
// ============================================================================

import type { StrategyOutcome } from "../orchestrator";

export async function tryKeywordAmountMatch(): Promise<StrategyOutcome> {
  return { matched: false, reason: "not_implemented_pp4a" };
}
