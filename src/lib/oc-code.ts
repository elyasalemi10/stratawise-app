// ============================================================================
// oc-code — generator + INSERT-with-retry helper
// ----------------------------------------------------------------------------
// OCs are addressed in URLs by an 8-character short code drawn from
// a Crockford-32-style alphabet that drops visually-confusable characters
// (0/O, 1/I). Codes are written into `ocs.short_code` (UNIQUE
// NOT NULL — see database-schema.sql). The DB schema delta seeded existing
// rows server-side; this helper handles new inserts.
//
// Race semantics: collision is astronomically unlikely (32^8 ≈ 1.1 × 10^12
// combinations vs. <100k expected ocs), but we still retry on
// 23505 unique-violation rather than presume — same discipline as the
// auth fix (insertProfileWithRaceRecover).
// ============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 32 chars
const CODE_LENGTH = 8;
const MAX_INSERT_RETRIES = 5;

export function generateOCCode(): string {
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return out;
}

/**
 * Insert a row into `ocs` with a randomly generated `short_code`,
 * retrying on UNIQUE-constraint violation (Postgres 23505).
 *
 * Pass the caller's existing supabase client + the row payload (without
 * `short_code`). On success returns `{ id, short_code }`. On exhaustion of
 * retries, returns `{ error }`.
 */
export async function insertOCWithCode(
  supabase: SupabaseClient,
  payload: Record<string, unknown>,
): Promise<{
  success?: { id: string; short_code: string };
  error?: string;
}> {
  for (let attempt = 1; attempt <= MAX_INSERT_RETRIES; attempt++) {
    const code = generateOCCode();
    const { data, error } = await supabase
      .from("owners_corporations")
      .insert({ ...payload, short_code: code })
      .select("id, short_code")
      .single();

    if (!error && data) {
      return { success: { id: data.id, short_code: data.short_code } };
    }
    if (error && error.code === "23505") {
      // Unique violation: either short_code collided (re-roll and retry) or
      // a different unique index tripped (e.g. plan_number) — only retry
      // for the short_code constraint.
      if (
        typeof error.message === "string" &&
        error.message.includes("idx_ocs_short_code")
      ) {
        // Collision on the short_code — regenerate and retry.
        continue;
      }
      // Different unique violation — surface verbatim.
      return { error: error.message };
    }
    if (error) {
      return { error: error.message };
    }
  }
  return {
    error: `Failed to allocate a unique oc code after ${MAX_INSERT_RETRIES} attempts`,
  };
}
