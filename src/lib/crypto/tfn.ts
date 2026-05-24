// TFN encryption helper.
//
// Per CLAUDE.md "TFN IS encrypted (different sensitivity profile)". The
// column on owners_corporations is `tfn_encrypted BYTEA`; the encrypted
// value is produced by Postgres's `pgcrypto` extension (already installed)
// via `pgp_sym_encrypt(plain, key)` and decrypted with `pgp_sym_decrypt`.
//
// The encryption key lives in the `TFN_ENCRYPTION_KEY` env var (32-byte
// base64). It MUST be set on Vercel before this code path runs in prod ,
// otherwise `setOcTfn` returns an error and the caller surfaces a generic
// "this feature is temporarily unavailable" message (per CLAUDE.md error
// rules; we log the real reason server-side).
//
// We dispatch through two RPC functions (`set_owner_corporation_tfn` /
// `get_owner_corporation_tfn`) defined in the same migration that creates
// the column. The plaintext + key never sit on the supabase-js builder; the
// RPC encapsulates the `pgp_sym_encrypt(...)` SQL expression so neither side
// has to splice raw SQL.

import { createServerClient } from "@/lib/supabase";

function readKey(): string | null {
  const k = process.env.TFN_ENCRYPTION_KEY;
  if (!k || k.trim().length === 0) return null;
  return k.trim();
}

/** Encrypt + persist `plain` onto `owners_corporations.tfn_encrypted` for the
 *  given OC id. Passing null / empty string clears the column. */
export async function setOcTfn(ocId: string, plain: string | null): Promise<{ error?: string }> {
  const key = readKey();
  if (!key) {
    console.error("TFN_ENCRYPTION_KEY env var is not set; refusing to persist TFN.");
    return { error: "Secure storage is temporarily unavailable" };
  }
  const supabase = createServerClient();
  if (!plain) {
    const { error } = await supabase
      .from("owners_corporations")
      .update({ tfn_encrypted: null })
      .eq("id", ocId);
    if (error) {
      console.error("setOcTfn (clear) error:", error);
      return { error: "Could not save the TFN" };
    }
    return {};
  }
  const { error } = await supabase.rpc("set_owner_corporation_tfn", {
    p_oc_id: ocId,
    p_plain: plain,
    p_key: key,
  });
  if (error) {
    console.error("setOcTfn (encrypt) error:", error);
    return { error: "Could not save the TFN" };
  }
  return {};
}

/** Fetch + decrypt the TFN for the given OC id. Returns null when no TFN is
 *  stored. Never include the error string in user-facing copy , log it and
 *  show a generic message instead (CLAUDE.md). */
export async function getOcTfn(ocId: string): Promise<{ tfn?: string | null; error?: string }> {
  const key = readKey();
  if (!key) {
    console.error("TFN_ENCRYPTION_KEY env var is not set; cannot decrypt TFN.");
    return { error: "Secure storage is temporarily unavailable" };
  }
  const supabase = createServerClient();
  const { data, error } = await supabase.rpc("get_owner_corporation_tfn", {
    p_oc_id: ocId,
    p_key: key,
  });
  if (error) {
    console.error("getOcTfn error:", error);
    return { error: "Could not read the TFN" };
  }
  return { tfn: (data as string | null) ?? null };
}
