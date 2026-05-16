import "server-only";
import { createServerClient } from "@/lib/supabase";
import {
  buildUsernameCandidates,
  isValidUsername,
  slugifyForUsername,
} from "@/lib/manager-username";

// Server-only DB helpers for the manager-username system (Item 15). Split out
// from src/lib/manager-username.ts so the pure helpers can be imported into
// client-bundle-reachable modules (notifications.ts → email.ts) without
// pulling "server-only" into the client graph.

// Checks profiles + profile_username_aliases (case-insensitive). Returns true
// if the username is free. Empty/invalid usernames return false.
export async function isUsernameAvailable(candidate: string): Promise<boolean> {
  if (!isValidUsername(candidate)) return false;
  const lower = candidate.toLowerCase();
  const supabase = createServerClient();

  const [{ data: profileHit }, { data: aliasHit }] = await Promise.all([
    supabase.from("profiles").select("id").ilike("email_username", lower).maybeSingle(),
    supabase
      .from("profile_username_aliases")
      .select("id")
      .ilike("username", lower)
      .is("retired_at", null)
      .maybeSingle(),
  ]);
  return !profileHit && !aliasHit;
}

// Finds the first available candidate from buildUsernameCandidates(), then if
// none are free, falls back to `${first.last}{N}` starting at 2.
export async function findAvailableUsername(
  firstName: string | null,
  lastName: string | null,
): Promise<string | null> {
  const candidates = buildUsernameCandidates(firstName, lastName);
  for (const c of candidates) {
    if (await isUsernameAvailable(c)) return c;
  }
  // Numeric fallback on the canonical "fn.ln" pattern.
  const fn = slugifyForUsername(firstName);
  const ln = slugifyForUsername(lastName);
  const base = fn && ln ? `${fn}.${ln}` : fn || ln;
  if (!base) return null;
  for (let i = 2; i <= 99; i++) {
    const candidate = `${base}${i}`;
    if (isValidUsername(candidate) && (await isUsernameAvailable(candidate))) return candidate;
  }
  return null;
}
