// ============================================================================
// Levy validation schemas
// ----------------------------------------------------------------------------
// Currently scopes only the match_keywords schema for Strategy 4 (Gap J).
// match_keywords is set on levy_batches at batch-creation time. The
// Strategy 4 (keyword + amount) consumer trusts whatever lands here.
//
// VALIDATION RULES (per Prompt 4 spec):
//   - Each keyword: minimum 4 characters, maximum 30.
//   - Lowercased + trimmed for storage (case-insensitive matching at use).
//   - Blocklist: payment, transfer, credit, debit, levy, deposit. These
//     are too generic to be meaningful match anchors and would produce
//     high false-positive rates.
//   - Maximum 10 keywords per batch (cardinality cap).
//   - Empty array allowed (no keyword matching for this batch).
//
// PP4-B leaves match_keywords unenforced at the database level (TEXT[]
// with default empty array). Production write paths (when UI lands in
// PP4-D) MUST validate via this schema before insert; verification
// fixtures populate the array directly with already-conforming values.
// ============================================================================

import { z } from "zod";

const KEYWORD_BLOCKLIST = new Set([
  "payment",
  "transfer",
  "credit",
  "debit",
  "levy",
  "deposit",
]);

const MIN_KEYWORD_LENGTH = 4;
const MAX_KEYWORD_LENGTH = 30;
const MAX_KEYWORDS_PER_BATCH = 10;

// Per-item schema. Exported for chip-by-chip inline validation in
// `KeywordChipInput`. Trims + lowercases; storage form is canonical.
export const keywordSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(
    MIN_KEYWORD_LENGTH,
    `Each keyword must be at least ${MIN_KEYWORD_LENGTH} characters`,
  )
  .max(
    MAX_KEYWORD_LENGTH,
    `Each keyword must be at most ${MAX_KEYWORD_LENGTH} characters`,
  )
  .refine((kw) => !KEYWORD_BLOCKLIST.has(kw), {
    message:
      "Keyword too generic , common words like 'payment', 'transfer', 'levy' are blocked",
  });

export const MAX_KEYWORDS = MAX_KEYWORDS_PER_BATCH;

export const matchKeywordsSchema = z
  .array(keywordSchema)
  .max(
    MAX_KEYWORDS_PER_BATCH,
    `At most ${MAX_KEYWORDS_PER_BATCH} keywords per batch`,
  )
  .default([]);

export type MatchKeywords = z.infer<typeof matchKeywordsSchema>;
