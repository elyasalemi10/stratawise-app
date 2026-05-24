// ============================================================================
// Levy-reference detection , shared primitives
// ----------------------------------------------------------------------------
// Single source of truth for the flexible /g-flagged levy regex AND the
// "exactly one unique reference, normalised to LEV-{n}" predicate. Used by:
//   - src/lib/reconciliation/auto-match.ts   (write-path matcher)
//   - src/lib/actions/reconciliation.ts      (queue + detail UI surfacing)
//   - src/lib/actions/bank-transactions.ts   (CSV import + queue)
//   - src/lib/basiq/parsers.ts               (Basiq description parser)
// PP4-A strategies should reuse these primitives rather than re-rolling
// the parsing logic.
//
// No `"use server"` directive , this is a pure helper, callable from any
// server-side context (server actions, cron tasks, webhook handlers,
// CLI verification scripts).
// ============================================================================

// Flexible levy-reference regex (from the Prompt 4 Strategy 1 spec).
// Accepts: "LEV-7", "LEV 7", "Levy 7", "Levy-7", "7-LEV", "7 Levy", "lev7",
// "07 LEV", etc. The digit is captured in group 1 (prefix form) or group 2
// (suffix form); callers should parseInt and normalise to "LEV-{n}".
export const LEV_REF_REGEX_GLOBAL = /\b(?:lev(?:y)?\s*[-]?\s*(\d+)|(\d+)\s*[-]?\s*lev(?:y)?)\b/gi;

// Returns the normalised "LEV-{n}" form when the description contains
// exactly one unique levy reference (across spelling variants , "LEV-7",
// "Levy 7", and "7 lev" all collapse to "LEV-7"). Returns null if zero or
// multiple distinct references are present, so callers default to "no
// auto-match" rather than guessing between ambiguous candidates.
export function detectSingleLevyReference(
  description: string | null | undefined,
): string | null {
  if (!description) return null;
  const unique = new Set<string>();
  for (const m of description.matchAll(LEV_REF_REGEX_GLOBAL)) {
    const raw = m[1] ?? m[2];
    const n = Number.parseInt(raw, 10);
    if (Number.isFinite(n) && n > 0) unique.add(`LEV-${n}`);
  }
  return unique.size === 1 ? [...unique][0] : null;
}
