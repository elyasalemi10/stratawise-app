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
 * Resolve the current owner of each supplied lot.
 *
 * One query, one answer: the open lot_ownerships row. A lot with no
 * ownership but an outstanding invitation counts as awaiting an owner;
 * anything else is unowned.
 */
export async function getLotOwners(
  supabase: SupabaseClient,
  lotIds: string[],
): Promise<Map<string, LotOwnerInfo>> {
  const result = new Map<string, LotOwnerInfo>();
  if (lotIds.length === 0) return result;

  for (const id of lotIds) result.set(id, emptyOwner(id));

  // ─── Source of truth #1: the current ownership ───────────────────────
  //
  // One read. There used to be two, because contact details lived on the
  // denormalised lot_owners row while the portal link lived on owners, and
  // this function had to merge them field by field and decide which won.
  // Both now come from the same row, so there is nothing to reconcile.
  //
  // profile_id != null on the owner means they have accepted a portal
  // invite (= "member"); otherwise they are a captured owner awaiting one.
  const { data: currentOwners } = await supabase
    .from("v_lot_current_owners")
    .select("lot_id, name, email, phone, profile_id")
    .in("lot_id", lotIds);

  for (const o of currentOwners ?? []) {
    if (!o.lot_id) continue;
    result.set(o.lot_id, {
      lot_id: o.lot_id,
      owner_status: o.profile_id ? "member" : "pending_invitation",
      owner_display_name: o.name ?? null,
      owner_contact_email: o.email ?? null,
      owner_contact_phone: o.phone ?? null,
      profile_id: o.profile_id ?? null,
      invitation_id: null,
    });
  }

  // ─── Source of truth #2: a pending invitation ─────────────────────
  //
  // A lot with no ownership but an outstanding invite is not unowned; it is
  // waiting on someone. Showing "no owner" there would have the manager
  // chase a lot they have already actioned.
  const stillUnowned = lotIds.filter((id) => result.get(id)?.owner_status === "unowned");
  if (stillUnowned.length === 0) return result;

  const { data: invites } = await supabase
    .from("invitations")
    .select("id, lot_id, email, name, phone, created_at")
    .in("lot_id", stillUnowned)
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

/** How many lots in this OC currently have an owner. */
export async function countLotsWithOwner(
  supabase: SupabaseClient,
  ocId: string,
): Promise<number> {
  const { count } = await supabase
    .from("v_lot_current_owners")
    .select("lot_id", { count: "exact", head: true })
    .eq("oc_id", ocId);
  return count ?? 0;
}
