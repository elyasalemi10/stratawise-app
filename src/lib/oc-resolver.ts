// ============================================================================
// oc-resolver , short_code → oc row
// ----------------------------------------------------------------------------
// Pages under /ocs/[ocCode]/... receive the short_code as
// a route param. Server-side queries still operate on the UUID `id` for
// efficiency and FK consistency, so each page boundary calls this helper
// once to resolve the code, then passes `oc.id` (the UUID) to
// downstream server actions.
//
// Why not accept either UUID-shape or code-shape: per the C-1 plan-of-record,
// dual-acceptance creates a maintenance trap. This resolver is strict ,
// short_code only.
// ============================================================================

import { createServerClient } from "@/lib/supabase";

export interface ResolvedOC {
  id: string;
  short_code: string;
  name: string;
  management_company_id: string | null;
}

/**
 * Resolve a oc short code to its row. Returns null when no row
 * matches , callers typically `redirect("/dashboard")` in that case
 * (mirrors the prior pattern when getOC returned null on bad UUID).
 */
export async function resolveOCFromCode(
  code: string | undefined,
): Promise<ResolvedOC | null> {
  if (!code) return null;
  // Codes are uppercase A-Z + 2-9. Reject malformed input cheaply before
  // hitting the DB (avoids a wasted round-trip on URL probing).
  if (!/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/.test(code)) return null;

  const supabase = createServerClient();
  const { data } = await supabase
    .from("owners_corporations")
    .select("id, short_code, name, management_company_id")
    .eq("short_code", code)
    .maybeSingle();
  return (data as ResolvedOC | null) ?? null;
}

/**
 * Look up `short_code` for a oc by UUID. Used by server actions
 * (and email/reauth URL constructors) that operate on a UUID but need to
 * emit a code-shaped URL for the user.
 */
export async function getOCShortCode(
  ocId: string,
): Promise<string | null> {
  const supabase = createServerClient();
  const { data } = await supabase
    .from("owners_corporations")
    .select("short_code")
    .eq("id", ocId)
    .maybeSingle();
  return (data?.short_code as string | null) ?? null;
}

/**
 * Build a code-shaped oc URL from a UUID. Returns
 * "/ocs/<short_code><subPath>". Returns null if the UUID doesn't
 * resolve (caller's responsibility to handle , most paths can throw or fall
 * back to "/dashboard").
 */
export async function buildOCUrl(
  ocId: string,
  subPath = "",
): Promise<string | null> {
  const code = await getOCShortCode(ocId);
  if (!code) return null;
  return `/ocs/${code}${subPath}`;
}
