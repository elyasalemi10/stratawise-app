"use server";

import { getCurrentProfile } from "@/lib/auth";
import { getCompanyOCSummary } from "@/lib/actions/oc";
import { createServerClient } from "@/lib/supabase";

// One aggregate fetch, called from the client through useCachedData.
//
// The auth check lives HERE as well as in page.tsx: page.tsx only runs on the
// initial shell request, so once the client owns every subsequent refresh a
// check left only up there would be skipped.
//
// The two roles see completely different dashboards, so this returns a
// discriminated union and the content component switches on `kind`. Only the
// queries for the role that asked are issued.

export interface PastMembershipRow {
  lot_id: string | null;
  oc_id: string;
  joined_at: string;
  left_at: string | null;
}

export interface PastLotRow {
  id: string;
  lot_number: number;
  unit_number: string | null;
}

export interface PastSubRow {
  id: string;
  name: string;
  address: string;
  plan_number: string;
}

export interface OwnerDashboardData {
  kind: "owner";
  subs: { id: string; short_code: string; name: string; address: string; plan_number: string }[];
  lots: {
    id: string; oc_id: string; lot_number: number; unit_number: string | null;
    lot_entitlement: number | null;
    /** Owes-positive, carried in at onboarding. Part of what the owner owes,
     *  and it used to be missing from every figure on this page while the
     *  manager's view of the same lot included it. */
    opening_balance: number | null;
  }[];
  levies: { lot_id: string; amount: number; status: string; due_date: string }[];
  payments: { lot_id: string; amount: number }[];
  hasActiveMemberships: boolean;
  pastMemberships: PastMembershipRow[];
  pastLots: PastLotRow[];
  pastSubs: PastSubRow[];
}

export interface ManagerDashboardData {
  kind: "manager";
  firstName: string | null;
  totalOCs: number;
  totalLots: number;
  ocs: NonNullable<Awaited<ReturnType<typeof getCompanyOCSummary>>>["ocs"];
}

export type DashboardPageData = OwnerDashboardData | ManagerDashboardData;

export async function getDashboardPageData(): Promise<DashboardPageData> {
  const profile = await getCurrentProfile();
  if (!profile) throw new Error("Not authenticated.");

  if (profile.role !== "lot_owner") {
    const summary = await getCompanyOCSummary();
    return {
      kind: "manager",
      firstName: profile.first_name ?? null,
      totalOCs: summary?.totalOCs ?? 0,
      totalLots: summary?.totalLots ?? 0,
      ocs: summary?.ocs ?? [],
    };
  }

  const supabase = createServerClient();

  const [activeMembershipsResult, pastMembershipsResult] = await Promise.all([
    supabase
      .from("oc_members")
      .select("oc_id, lot_id")
      .eq("profile_id", profile.id)
      .is("left_at", null),
    supabase
      .from("oc_members")
      .select("lot_id, oc_id, joined_at, left_at")
      .eq("profile_id", profile.id)
      .not("left_at", "is", null)
      .order("left_at", { ascending: false }),
  ]);

  const memberships = activeMembershipsResult.data ?? [];
  const pastMemberships = (pastMembershipsResult.data ?? []) as PastMembershipRow[];

  const pastLotIds = pastMemberships.map((m) => m.lot_id).filter(Boolean) as string[];
  const pastSubIds = pastMemberships.map((m) => m.oc_id);
  const subIds = memberships.map((m) => m.oc_id);
  const lotIds = memberships.map((m) => m.lot_id).filter(Boolean) as string[];

  const none = { data: [] as never[] };

  // Past-tenure lookups and current-tenure lookups used to run as two
  // sequential Promise.all blocks. They do not depend on each other, so they
  // go out together: one round trip instead of two.
  const [pastLotsResult, pastSubsResult, subsResult, lotsResult, leviesResult, paymentsResult] =
    await Promise.all([
      pastLotIds.length
        ? supabase.from("lots").select("id, lot_number, unit_number").in("id", pastLotIds)
        : Promise.resolve(none),
      pastSubIds.length
        ? supabase.from("owners_corporations").select("id, name, address, plan_number").in("id", pastSubIds)
        : Promise.resolve(none),
      subIds.length
        ? supabase.from("owners_corporations").select("id, short_code, name, address, plan_number").in("id", subIds)
        : Promise.resolve(none),
      lotIds.length
        ? supabase.from("lots").select("id, oc_id, lot_number, unit_number, lot_entitlement, opening_balance").in("id", lotIds)
        : Promise.resolve(none),
      lotIds.length
        ? supabase
            .from("levy_notices")
            .select("lot_id, amount, status, due_date")
            .in("lot_id", lotIds)
            .in("status", ["issued", "partially_paid", "overdue"])
        : Promise.resolve(none),
      lotIds.length
        ? supabase.from("payments").select("lot_id, amount").in("lot_id", lotIds)
        : Promise.resolve(none),
    ]);

  return {
    kind: "owner",
    hasActiveMemberships: memberships.length > 0,
    subs: (subsResult.data ?? []) as OwnerDashboardData["subs"],
    lots: (lotsResult.data ?? []) as OwnerDashboardData["lots"],
    levies: (leviesResult.data ?? []) as OwnerDashboardData["levies"],
    payments: (paymentsResult.data ?? []) as OwnerDashboardData["payments"],
    pastMemberships,
    pastLots: (pastLotsResult.data ?? []) as PastLotRow[],
    pastSubs: (pastSubsResult.data ?? []) as PastSubRow[],
  };
}
