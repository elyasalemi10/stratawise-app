// ============================================================================
// subdivision-resolver — short_code → subdivision row
// ----------------------------------------------------------------------------
// Pages under /subdivisions/[subdivisionCode]/... receive the short_code as
// a route param. Server-side queries still operate on the UUID `id` for
// efficiency and FK consistency, so each page boundary calls this helper
// once to resolve the code, then passes `subdivision.id` (the UUID) to
// downstream server actions.
//
// Why not accept either UUID-shape or code-shape: per the C-1 plan-of-record,
// dual-acceptance creates a maintenance trap. This resolver is strict —
// short_code only.
// ============================================================================

import { createServerClient } from "@/lib/supabase";

export interface ResolvedSubdivision {
  id: string;
  short_code: string;
  name: string;
  management_company_id: string | null;
}

/**
 * Resolve a subdivision short code to its row. Returns null when no row
 * matches — callers typically `redirect("/dashboard")` in that case
 * (mirrors the prior pattern when getSubdivision returned null on bad UUID).
 */
export async function resolveSubdivisionFromCode(
  code: string | undefined,
): Promise<ResolvedSubdivision | null> {
  if (!code) return null;
  // Codes are uppercase A-Z + 2-9. Reject malformed input cheaply before
  // hitting the DB (avoids a wasted round-trip on URL probing).
  if (!/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/.test(code)) return null;

  const supabase = createServerClient();
  const { data } = await supabase
    .from("subdivisions")
    .select("id, short_code, name, management_company_id")
    .eq("short_code", code)
    .maybeSingle();
  return (data as ResolvedSubdivision | null) ?? null;
}

/**
 * Look up `short_code` for a subdivision by UUID. Used by server actions
 * (and email/reauth URL constructors) that operate on a UUID but need to
 * emit a code-shaped URL for the user.
 */
export async function getSubdivisionShortCode(
  subdivisionId: string,
): Promise<string | null> {
  const supabase = createServerClient();
  const { data } = await supabase
    .from("subdivisions")
    .select("short_code")
    .eq("id", subdivisionId)
    .maybeSingle();
  return (data?.short_code as string | null) ?? null;
}

/**
 * Build a code-shaped subdivision URL from a UUID. Returns
 * "/subdivisions/<short_code><subPath>". Returns null if the UUID doesn't
 * resolve (caller's responsibility to handle — most paths can throw or fall
 * back to "/dashboard").
 */
export async function buildSubdivisionUrl(
  subdivisionId: string,
  subPath = "",
): Promise<string | null> {
  const code = await getSubdivisionShortCode(subdivisionId);
  if (!code) return null;
  return `/subdivisions/${code}${subPath}`;
}
