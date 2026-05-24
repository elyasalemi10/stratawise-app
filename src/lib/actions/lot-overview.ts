import "server-only";
import { createServerClient } from "@/lib/supabase";

// Data fetches for the Overview + History tabs on the lot detail page
// (Items 12, 17). Kept here so the page.tsx route stays declarative.

export interface NextLevyDue {
  reference_number: string;
  due_date: string; // ISO YYYY-MM-DD
  amount: number;
  status: string;
}

export async function getNextLevyDue(lotId: string): Promise<NextLevyDue | null> {
  const supabase = createServerClient();
  const { data } = await supabase
    .from("levy_notices")
    .select("reference_number, due_date, amount, status")
    .eq("lot_id", lotId)
    .in("status", ["issued", "partially_paid", "overdue"])
    .order("due_date", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return {
    reference_number: data.reference_number,
    due_date: data.due_date,
    amount: Number(data.amount),
    status: data.status,
  };
}

// Returns true when any levy notice has ever been issued for the lot
// (regardless of paid / outstanding / cancelled state). The Overview tab
// uses this to distinguish "no levies issued yet" from "all levies paid"
// when there's nothing outstanding.
export async function hasAnyLevyEverBeenIssued(lotId: string): Promise<boolean> {
  const supabase = createServerClient();
  const { count } = await supabase
    .from("levy_notices")
    .select("id", { count: "exact", head: true })
    .eq("lot_id", lotId);
  return (count ?? 0) > 0;
}

export interface LotActivityEntry {
  id: string;
  created_at: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: Record<string, unknown> | null;
  before_state: Record<string, unknown> | null;
  after_state: Record<string, unknown> | null;
  actor_name: string | null;
}

// Returns recent audit-log entries scoped to a lot. Scope rules:
//   1. entity_id = lot_id (direct lot edits , entitlement, unit number, etc.)
//   2. entity_id IN (lot_owner row ids for this lot) , owner / tenant / consent
//      changes attached to the lot_owners record
//   3. metadata->>lot_id = lot_id , events that store lot_id in metadata
//      (levy notices, payments, communications)
//
// We pass the lot_owner ids in as a string list because audit_log has no
// FK pointing back to lots , without the explicit list, we'd need a subquery
// per request which is more expensive.
export async function getLotActivity(
  lotId: string,
  limit: number = 50,
): Promise<LotActivityEntry[]> {
  const supabase = createServerClient();

  const { data: lotOwnerRows } = await supabase
    .from("lot_owners")
    .select("id")
    .eq("lot_id", lotId);
  const ownerIds = (lotOwnerRows ?? []).map((r) => r.id as string);

  const idList = [lotId, ...ownerIds];

  // Primary query: entries with entity_id in our scope list. We also OR in the
  // metadata->>lot_id filter for events that store the lot reference there.
  const { data: scoped } = await supabase
    .from("audit_log")
    .select(
      "id, created_at, action, entity_type, entity_id, before_state, after_state, metadata, profile_id",
    )
    .or(`entity_id.in.(${idList.join(",")}),metadata->>lot_id.eq.${lotId}`)
    .order("created_at", { ascending: false })
    .limit(limit);

  const rows = scoped ?? [];

  // Hydrate actor names in a single follow-up query so the table doesn't show
  // bare UUIDs for the person who took each action.
  const actorIds = Array.from(
    new Set(rows.map((r) => r.profile_id).filter((v): v is string => !!v)),
  );
  let actorMap: Record<string, string> = {};
  if (actorIds.length > 0) {
    const { data: actors } = await supabase
      .from("profiles")
      .select("id, first_name, last_name, email")
      .in("id", actorIds);
    actorMap = Object.fromEntries(
      (actors ?? []).map((a) => [
        a.id,
        [a.first_name, a.last_name].filter(Boolean).join(" ") || a.email || "System",
      ]),
    );
  }

  return rows.map((r) => ({
    id: r.id as string,
    created_at: r.created_at as string,
    action: r.action as string,
    entity_type: r.entity_type as string,
    entity_id: (r.entity_id as string) ?? null,
    metadata: (r.metadata as Record<string, unknown> | null) ?? null,
    before_state: (r.before_state as Record<string, unknown> | null) ?? null,
    after_state: (r.after_state as Record<string, unknown> | null) ?? null,
    actor_name: r.profile_id ? actorMap[r.profile_id as string] ?? null : null,
  }));
}

export interface LotDrn {
  drn: string;
  primary_id: string | null;
  secondary_id: string | null;
  active_from: string;
  active_to: string | null;
}

export async function getActiveDrnsForLot(lotId: string): Promise<LotDrn[]> {
  const supabase = createServerClient();
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await supabase
    .from("lot_drns")
    .select("drn, primary_id, secondary_id, active_from, active_to")
    .eq("lot_id", lotId)
    .or(`active_to.is.null,active_to.gte.${today}`)
    .order("active_from", { ascending: false });
  return (data ?? []) as LotDrn[];
}

export interface PortalActivity {
  profile_id: string | null;
  last_active_at: string | null;
}

// Reads the most recent activity timestamp for the lot's portal account, if
// linked. Uses profile.updated_at as a proxy for last-active. The Overview
// card renders "Never" when this returns null.
export async function getPortalActivity(lotId: string): Promise<PortalActivity> {
  const supabase = createServerClient();
  // Find the most recent oc_members link → profile, then read profile.updated_at.
  const { data: member } = await supabase
    .from("oc_members")
    .select("profile_id, joined_at")
    .eq("lot_id", lotId)
    .is("left_at", null)
    .order("joined_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!member?.profile_id) return { profile_id: null, last_active_at: null };

  const { data: profile } = await supabase
    .from("profiles")
    .select("updated_at")
    .eq("id", member.profile_id)
    .maybeSingle();
  return {
    profile_id: member.profile_id as string,
    last_active_at: (profile?.updated_at as string) ?? null,
  };
}
