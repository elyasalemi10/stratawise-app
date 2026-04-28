// ============================================================================
// Strategy 5 — amount window
// ----------------------------------------------------------------------------
// PP4-A: stub. Full implementation lands in PP4-B (single-candidate by amount
// match within ±30-day due-date window, priority-aware tiebreak).
// ============================================================================

import type { StrategyOutcome } from "../orchestrator";

export async function tryAmountWindowMatch(): Promise<StrategyOutcome> {
  return { matched: false, reason: "not_implemented_pp4a" };
}
