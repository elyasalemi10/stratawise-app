"use server";

import type { SupabaseClient } from "@supabase/supabase-js";

export type LotOwnerStatus = "member" | "pending_invitation" | "unowned";

export interface LotOwnerInfo {
  lot_id: string;
  owner_status: LotOwnerStatus;
  owner_display_name: string | null;
  owner_contact_email: string | null;
  owner_contact_phone: string | null;
  profile_id: string | null;          // populated only when owner_status === "member"
  invitation_id: string | null;       // populated only when owner_status === "pending_invitation"
}

function formatName(first: string | null, last: string | null): string | null {
  const joined = [first, last].filter(Boolean).join(" ").trim();
  return joined.length > 0 ? joined : null;
}

function emptyOwner(lotId: string): LotOwnerInfo {
  return {
    lot_id: lotId,
    owner_status: "unowned",
    owner_display_name: null,
    owner_contact_email: null,
    owner_contact_phone: null,
    profile_id: null,
    invitation_id: null,
  };
}

/**
 * Resolve the current owner of each supplied lot, in one round-trip pair of
 * queries. Precedence: active subdivision_members row wins; otherwise the most
 * recent pending invitation; otherwise "unowned". Use this everywhere the UI
 * or a PDF previously read `lots.owner_*` columns.
 */
export async function getLotOwners(
  supabase: SupabaseClient,
  lotIds: string[],
): Promise<Map<string, LotOwnerInfo>> {
  const result = new Map<string, LotOwnerInfo>();
  if (lotIds.length === 0) return result;

  for (const id of lotIds) result.set(id, emptyOwner(id));

  const { data: members } = await supabase
    .from("subdivision_members")
    .select("lot_id, profile_id, profiles!inner(id, first_name, last_name, email, phone)")
    .in("lot_id", lotIds)
    .eq("role", "lot_owner")
    .is("left_at", null);

  for (const m of members ?? []) {
    if (!m.lot_id) continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const profile = (m as any).profiles;
    result.set(m.lot_id, {
      lot_id: m.lot_id,
      owner_status: "member",
      owner_display_name: formatName(profile?.first_name ?? null, profile?.last_name ?? null),
      owner_contact_email: profile?.email ?? null,
      owner_contact_phone: profile?.phone ?? null,
      profile_id: m.profile_id,
      invitation_id: null,
    });
  }

  const lotsStillUnowned = lotIds.filter((id) => result.get(id)?.owner_status === "unowned");
  if (lotsStillUnowned.length === 0) return result;

  const { data: invites } = await supabase
    .from("invitations")
    .select("id, lot_id, email, name, phone, created_at")
    .in("lot_id", lotsStillUnowned)
    .in("status", ["pending", "noted"])
    .order("created_at", { ascending: false });

  for (const inv of invites ?? []) {
    if (!inv.lot_id) continue;
    if (result.get(inv.lot_id)?.owner_status !== "unowned") continue;
    result.set(inv.lot_id, {
      lot_id: inv.lot_id,
      owner_status: "pending_invitation",
      owner_display_name: inv.name ?? null,
      owner_contact_email: inv.email ?? null,
      owner_contact_phone: inv.phone ?? null,
      profile_id: null,
      invitation_id: inv.id,
    });
  }

  return result;
}

/** Convenience: resolve a single lot's owner. */
export async function getLotOwner(
  supabase: SupabaseClient,
  lotId: string,
): Promise<LotOwnerInfo> {
  const map = await getLotOwners(supabase, [lotId]);
  return map.get(lotId) ?? emptyOwner(lotId);
}

/**
 * Count lots in a subdivision that have an active member row (the canonical
 * "assigned / has an owner" check, replacing the old denormalised column).
 */
export async function countLotsWithOwner(
  supabase: SupabaseClient,
  subdivisionId: string,
): Promise<number> {
  const { data } = await supabase
    .from("subdivision_members")
    .select("lot_id")
    .eq("subdivision_id", subdivisionId)
    .eq("role", "lot_owner")
    .is("left_at", null)
    .not("lot_id", "is", null);

  const unique = new Set<string>();
  for (const row of data ?? []) if (row.lot_id) unique.add(row.lot_id);
  return unique.size;
}
