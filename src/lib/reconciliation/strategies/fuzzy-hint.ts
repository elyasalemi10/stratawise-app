// ============================================================================
// Strategy 6 — fuzzy sender hint
// ----------------------------------------------------------------------------
// NEVER auto-matches. Computes Jaro-Winkler similarity between the
// canonicalised sender name and every active bank_payer_mapping in the
// subdivision; when max similarity ≥ 0.75, returns
// metadata.hint_surfaced = true with { lot_id, canonical_name, similarity,
// raw_canonical }. The orchestrator persists this onto
// bank_transactions.fuzzy_hint_metadata so the queue UI can render
// "Possibly Jane Brown (Lot 7)?" on the unmatched row.
//
// The strategy returns matched: false in ALL paths (per spec: auto-match
// requires exact canonical equality, not similarity). Strategy 6 only
// surfaces information.
// ============================================================================

import { createServerClient } from "@/lib/supabase";
import type { AutoMatchContext, StrategyOutcome } from "../orchestrator";
import { canonicaliseSender } from "../canonical";
import { jaroWinkler } from "../similarity";

const SIMILARITY_THRESHOLD = 0.75;

export async function tryFuzzySenderMatch(
  ctx: AutoMatchContext,
): Promise<StrategyOutcome> {
  const canonical = canonicaliseSender(ctx.description);
  if (!canonical) {
    return { matched: false, reason: "no_canonical_name" };
  }

  const supabase = createServerClient();
  const { data: mappings } = await supabase
    .from("bank_payer_mappings")
    .select("id, lot_id, canonical_sender_name")
    .eq("subdivision_id", ctx.subdivisionId)
    .eq("status", "active");

  if (!mappings || mappings.length === 0) {
    return { matched: false, reason: "no_active_mappings" };
  }

  let bestSim = 0;
  let bestMapping: (typeof mappings)[number] | null = null;
  for (const m of mappings) {
    // Skip exact-equality mappings — those would have been caught by
    // Strategy 3 already (or are now). A Strategy 6 hint suggesting an
    // exact-match mapping is no value-add.
    if (m.canonical_sender_name === canonical) continue;
    const sim = jaroWinkler(canonical, m.canonical_sender_name);
    if (sim > bestSim) {
      bestSim = sim;
      bestMapping = m;
    }
  }

  if (!bestMapping || bestSim < SIMILARITY_THRESHOLD) {
    return {
      matched: false,
      reason: "below_threshold",
      metadata: { max_similarity: bestSim },
    };
  }

  // Surface a hint via metadata.hint_surfaced. The orchestrator persists
  // this metadata onto bank_transactions.fuzzy_hint_metadata.
  return {
    matched: false,
    reason: "hint_surfaced",
    metadata: {
      hint_surfaced: true,
      lot_id: bestMapping.lot_id,
      canonical_name: bestMapping.canonical_sender_name,
      similarity: round4(bestSim),
      raw_canonical: canonical,
    },
  };
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
