"use server";

import { getCurrentProfile } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";

export interface SidebarSubdivision {
  id: string;
  name: string;
  plan_number: string;
  total_lots: number;
  status: string;
}

export async function getSidebarSubdivisions(): Promise<SidebarSubdivision[]> {
  const profile = await getCurrentProfile();
  if (!profile) return [];

  const supabase = createServerClient();

  if (profile.role === "super_admin" || profile.role === "strata_manager") {
    if (!profile.management_company_id) return [];
    const { data } = await supabase
      .from("subdivisions")
      .select("id, name, plan_number, total_lots, status")
      .eq("management_company_id", profile.management_company_id)
      .eq("status", "active")
      .order("name");
    return data ?? [];
  }

  // lot_owner — only subdivisions they're a member of
  const { data: memberships } = await supabase
    .from("subdivision_members")
    .select("subdivision_id")
    .eq("profile_id", profile.id)
    .is("left_at", null);

  if (!memberships || memberships.length === 0) return [];

  const ids = memberships.map((m) => m.subdivision_id);
  const { data } = await supabase
    .from("subdivisions")
    .select("id, name, plan_number, total_lots, status")
    .in("id", ids)
    .eq("status", "active")
    .order("name");

  return data ?? [];
}

export async function getSubdivision(subdivisionId: string) {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("subdivisions")
    .select("*")
    .eq("id", subdivisionId)
    .single();

  if (error || !data) return null;
  return data;
}

export async function getSubdivisionStats(subdivisionId: string) {
  const supabase = createServerClient();

  const [lotsResult, membersResult, leviesResult, paymentsResult] = await Promise.all([
    supabase
      .from("lots")
      .select("id", { count: "exact", head: true })
      .eq("subdivision_id", subdivisionId),
    supabase
      .from("subdivision_members")
      .select("id", { count: "exact", head: true })
      .eq("subdivision_id", subdivisionId)
      .is("left_at", null),
    supabase
      .from("levy_notices")
      .select("amount")
      .eq("subdivision_id", subdivisionId)
      .in("status", ["issued", "partially_paid", "overdue"]),
    supabase
      .from("payments")
      .select("amount")
      .eq("subdivision_id", subdivisionId),
  ]);

  const totalLevied = leviesResult.data?.reduce((sum, l) => sum + Number(l.amount), 0) ?? 0;
  const totalPaid = paymentsResult.data?.reduce((sum, p) => sum + Number(p.amount), 0) ?? 0;

  return {
    totalLots: lotsResult.count ?? 0,
    totalMembers: membersResult.count ?? 0,
    totalLevied,
    totalPaid,
    outstanding: totalLevied - totalPaid,
  };
}

export interface LotWithFinancials {
  id: string;
  lot_number: number;
  lot_entitlement: number;
  lot_liability: number;
  unit_number: string | null;
  owner_type: string | null;
  owner_name: string | null;
  owner_email: string | null;
  owner_phone: string | null;
  balance: number;
  financial_status: "up_to_date" | "unassigned" | "behind";
}

export async function getLotsWithFinancials(subdivisionId: string): Promise<LotWithFinancials[]> {
  const supabase = createServerClient();

  const { data: lots } = await supabase
    .from("lots")
    .select("*")
    .eq("subdivision_id", subdivisionId)
    .order("lot_number");

  if (!lots) return [];

  // Get levy and payment totals per lot
  const lotIds = lots.map((l) => l.id);

  const [leviesResult, paymentsResult] = await Promise.all([
    supabase
      .from("levy_notices")
      .select("lot_id, amount")
      .in("lot_id", lotIds)
      .in("status", ["issued", "partially_paid", "overdue"]),
    supabase
      .from("payments")
      .select("lot_id, amount")
      .in("lot_id", lotIds),
  ]);

  // Aggregate per lot
  const leviesByLot = new Map<string, number>();
  const paymentsByLot = new Map<string, number>();

  leviesResult.data?.forEach((l) => {
    leviesByLot.set(l.lot_id, (leviesByLot.get(l.lot_id) ?? 0) + Number(l.amount));
  });
  paymentsResult.data?.forEach((p) => {
    paymentsByLot.set(p.lot_id, (paymentsByLot.get(p.lot_id) ?? 0) + Number(p.amount));
  });

  return lots.map((lot) => {
    const totalLevied = leviesByLot.get(lot.id) ?? 0;
    const totalPaid = paymentsByLot.get(lot.id) ?? 0;
    const balance = totalLevied - totalPaid;
    const hasOwner = !!lot.owner_name;

    let financial_status: "up_to_date" | "unassigned" | "behind";
    if (!hasOwner) {
      financial_status = "unassigned";
    } else if (balance > 0) {
      financial_status = "behind";
    } else {
      financial_status = "up_to_date";
    }

    return {
      id: lot.id,
      lot_number: lot.lot_number,
      lot_entitlement: Number(lot.lot_entitlement),
      lot_liability: Number(lot.lot_liability),
      unit_number: lot.unit_number,
      owner_type: lot.owner_type,
      owner_name: lot.owner_name,
      owner_email: lot.owner_email,
      owner_phone: lot.owner_phone,
      balance,
      financial_status,
    };
  });
}

export async function getSubdivisionManageStats(subdivisionId: string) {
  const supabase = createServerClient();

  const [lotsResult, ownersResult, membersResult] = await Promise.all([
    supabase
      .from("lots")
      .select("id", { count: "exact", head: true })
      .eq("subdivision_id", subdivisionId),
    supabase
      .from("lots")
      .select("id", { count: "exact", head: true })
      .eq("subdivision_id", subdivisionId)
      .not("owner_name", "is", null)
      .neq("owner_name", ""),
    supabase
      .from("subdivision_members")
      .select("id", { count: "exact", head: true })
      .eq("subdivision_id", subdivisionId)
      .is("left_at", null),
  ]);

  return {
    totalLots: lotsResult.count ?? 0,
    ownersAssigned: ownersResult.count ?? 0,
    totalMembers: membersResult.count ?? 0,
  };
}

export async function getCompanySubdivisionSummary() {
  const profile = await getCurrentProfile();
  if (!profile?.management_company_id) return null;

  const supabase = createServerClient();

  const { data: subdivisions, count } = await supabase
    .from("subdivisions")
    .select("id, name, plan_number, address, total_lots, status, created_at", { count: "exact" })
    .eq("management_company_id", profile.management_company_id)
    .eq("status", "active")
    .order("name");

  const totalLots = subdivisions?.reduce((sum, s) => sum + (s.total_lots ?? 0), 0) ?? 0;

  return {
    subdivisions: subdivisions ?? [],
    totalSubdivisions: count ?? 0,
    totalLots,
  };
}
