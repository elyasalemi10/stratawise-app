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
 * queries. Precedence: active oc_members row wins; otherwise the most
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

  // ─── Source of truth #0 (manager-maintained contact): lot_owners ─────
  // The lot_owners table is the manually-maintained contact record that
  // managers edit from the lot detail page. When a manager removes /
  // updates an email here, the change SHOULD propagate to outgoing
  // levies immediately , so we read this table FIRST and prefer its
  // email/name/phone over the older entity-model rows. The historical
  // `lot_ownerships → owners` data still feeds the portal-user link
  // (member vs pending), but the contact details follow lot_owners.
  const { data: contacts } = await supabase
    .from("lot_owners")
    .select("lot_id, name, email, phone, ownership_since")
    .in("lot_id", lotIds)
    .order("ownership_since", { ascending: false, nullsFirst: false });

  const contactByLot = new Map<string, { name: string | null; email: string | null; phone: string | null }>();
  for (const c of contacts ?? []) {
    if (!c.lot_id) continue;
    // First-seen wins because the order is most-recent ownership first.
    // Older / removed contact rows for the same lot are ignored.
    if (!contactByLot.has(c.lot_id)) {
      contactByLot.set(c.lot_id, {
        name: c.name ?? null,
        email: c.email ?? null,
        phone: c.phone ?? null,
      });
    }
  }

  // ─── Source of truth #1: lot_ownerships + owners (new entity model) ──
  //
  // For OCs created post-entity-migration, every captured owner has an
  // active lot_ownership pointing at an owner row. profile_id != null on
  // the owner row means they've accepted a portal invite (= "member").
  const { data: ownerships } = await supabase
    .from("lot_ownerships")
    .select("lot_id, owners!inner(id, name, email, phone, profile_id)")
    .in("lot_id", lotIds)
    .is("end_date", null);

  for (const lo of ownerships ?? []) {
    if (!lo.lot_id) continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const owner = (lo as any).owners;
    if (!owner) continue;
    // Prefer the manager-maintained lot_owners contact email/name/phone
    // when present; fall back to the entity-model owner's fields.
    const contact = contactByLot.get(lo.lot_id);
    result.set(lo.lot_id, {
      lot_id: lo.lot_id,
      owner_status: owner.profile_id ? "member" : "pending_invitation",
      owner_display_name: contact?.name ?? owner.name ?? null,
      owner_contact_email: contact?.email ?? owner.email ?? null,
      owner_contact_phone: contact?.phone ?? owner.phone ?? null,
      profile_id: owner.profile_id ?? null,
      invitation_id: null,
    });
  }

  // For OCs that have no lot_ownerships rows yet (purely wizard-created,
  // never migrated), the lot_owners contact alone is sufficient. Seed
  // those lots from the contact map now , the legacy fallbacks below
  // only fire when nothing else resolved.
  for (const [lotId, contact] of contactByLot.entries()) {
    if (result.get(lotId)?.owner_status === "unowned" && contact.email) {
      result.set(lotId, {
        lot_id: lotId,
        owner_status: "pending_invitation",
        owner_display_name: contact.name,
        owner_contact_email: contact.email,
        owner_contact_phone: contact.phone,
        profile_id: null,
        invitation_id: null,
      });
    }
  }

  // ─── Source of truth #2: legacy oc_members (pre-entity-migration OCs) ─
  //
  // Dual-read fallback. Only fill lots that didn't resolve from the new
  // tables. Once every reader is migrated AND legacy data is backfilled
  // we drop this block.
  const lotsStillUnowned = lotIds.filter((id) => result.get(id)?.owner_status === "unowned");
  if (lotsStillUnowned.length > 0) {
    const { data: members } = await supabase
      .from("oc_members")
      .select("lot_id, profile_id, profiles!inner(id, first_name, last_name, email, phone)")
      .in("lot_id", lotsStillUnowned)
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
  }

  // ─── Source of truth #3: invitations (pre-entity-migration OCs) ──
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

/**
 * Count lots in a oc that have an active member row (the canonical
 * "assigned / has an owner" check, replacing the old denormalised column).
 */
export async function countLotsWithOwner(
  supabase: SupabaseClient,
  ocId: string,
): Promise<number> {
  const { data } = await supabase
    .from("oc_members")
    .select("lot_id")
    .eq("oc_id", ocId)
    .eq("role", "lot_owner")
    .is("left_at", null)
    .not("lot_id", "is", null);

  const unique = new Set<string>();
  for (const row of data ?? []) if (row.lot_id) unique.add(row.lot_id);
  return unique.size;
}
