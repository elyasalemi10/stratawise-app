// ============================================================================
// Strategy 3 — known payer (canonical sender → lot mapping)
// ----------------------------------------------------------------------------
// PP4-A: stub. Full implementation lands in PP4-B alongside the
// canonicaliser, bank_payer_mappings server actions, and collision
// detection. Keeps the orchestrator's strategy registry stable.
// ============================================================================

import type { StrategyOutcome } from "../orchestrator";

export async function tryKnownPayerMatch(): Promise<StrategyOutcome> {
  return { matched: false, reason: "not_implemented_pp4a" };
}
