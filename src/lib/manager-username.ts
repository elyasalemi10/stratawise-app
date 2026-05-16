import "server-only";
import { createServerClient } from "@/lib/supabase";

// Manager email-username system (Item 15).
//
// Outbound manager email is sent from `<email_username>@<brand-domain>`. The brand
// domain comes from MANAGER_EMAIL_DOMAIN (or NEXT_PUBLIC_BRAND_DOMAIN). The username
// is auto-derived at first onboarding from first_name + last_name. Managers can
// rename in /settings, but only once per 30 days. Every rename writes the old
// username to profile_username_aliases so legacy inbound mail still resolves.

const USERNAME_RX = /^[a-z0-9][a-z0-9._-]{1,38}[a-z0-9]$/;
export const USERNAME_CHANGE_COOLDOWN_DAYS = 30;

export function isValidUsername(u: string): boolean {
  if (!u) return false;
  return USERNAME_RX.test(u);
}

function slugify(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip diacritics
    .replace(/[^a-z0-9]+/g, "")
    .replace(/^-+|-+$/g, "");
}

// Returns the ordered list of preferred candidates to try in order. We attempt:
//   1. firstname.lastname
//   2. f.lastname
//   3. firstname.l
//   4. firstname.lastname1, firstname.lastname2, ...
// The numeric suffix loop is bounded — caller stops at the first available match.
export function buildUsernameCandidates(firstName: string | null, lastName: string | null): string[] {
  const fn = slugify(firstName);
  const ln = slugify(lastName);
  const out: string[] = [];
  if (fn && ln) {
    out.push(`${fn}.${ln}`);
    out.push(`${fn[0]}.${ln}`);
    out.push(`${fn}.${ln[0]}`);
  } else if (fn) {
    out.push(fn);
  } else if (ln) {
    out.push(ln);
  }
  return out.filter((c) => isValidUsername(c));
}

// Checks profiles + profile_username_aliases (case-insensitive). Returns true if
// the username is free. Empty/invalid usernames return false.
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
  const fn = slugify(firstName);
  const ln = slugify(lastName);
  const base = fn && ln ? `${fn}.${ln}` : fn || ln;
  if (!base) return null;
  for (let i = 2; i <= 99; i++) {
    const candidate = `${base}${i}`;
    if (isValidUsername(candidate) && (await isUsernameAvailable(candidate))) return candidate;
  }
  return null;
}

// Cooldown check used by the /settings rename action.
export function daysSince(d: Date | string | null | undefined): number | null {
  if (!d) return null;
  const t = typeof d === "string" ? new Date(d).getTime() : d.getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((Date.now() - t) / (24 * 60 * 60 * 1000));
}

export function isWithinCooldown(lastChangedAt: Date | string | null | undefined): boolean {
  const days = daysSince(lastChangedAt);
  if (days === null) return false; // never changed → no cooldown
  return days < USERNAME_CHANGE_COOLDOWN_DAYS;
}

export function brandDomain(): string {
  return (
    process.env.MANAGER_EMAIL_DOMAIN ??
    process.env.NEXT_PUBLIC_BRAND_DOMAIN ??
    "stratawise.com.au"
  );
}

// Composes the public-facing address. Always lowercase. If username is missing
// (e.g. lot_owner profile, or a manager who hasn't onboarded yet), returns null
// so callers fall back to the legacy noreply address.
export function managerEmailAddress(username: string | null | undefined): string | null {
  if (!username || !isValidUsername(username)) return null;
  return `${username.toLowerCase()}@${brandDomain()}`;
}

// Standardised FROM header. brandName is the company display name (e.g.
// "StrataWise"), defaults to env.NEXT_PUBLIC_BRAND_NAME or "StrataWise".
export function managerEmailFrom(
  username: string | null | undefined,
  displayName: string | null | undefined,
): string | null {
  const addr = managerEmailAddress(username);
  if (!addr) return null;
  const brand =
    displayName?.trim() ||
    process.env.NEXT_PUBLIC_BRAND_NAME ||
    "StrataWise";
  return `${brand} <${addr}>`;
}
