"use server";

import { getCurrentProfile, requireSubdivisionAccess } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";

// ─── Levy History ──────────────────────────────────────────

export async function getLevyHistory(subdivisionId: string, lotId?: string) {
  const profile = await getCurrentProfile();
  if (!profile) return [];
  await requireSubdivisionAccess(subdivisionId);

  const supabase = createServerClient();
  let query = supabase
    .from("levy_notices")
    .select("id, lot_id, reference_number, period_start, period_end, amount, amount_paid, status, due_date, issued_at, pdf_url, lots!inner(lot_number, unit_number, owner_name)")
    .eq("subdivision_id", subdivisionId)
    .order("due_date", { ascending: false });

  // Lot owners can only see their own levies
  if (profile.role === "lot_owner") {
    const { data: memberships } = await supabase
      .from("subdivision_members")
      .select("lot_id")
      .eq("subdivision_id", subdivisionId)
      .eq("profile_id", profile.id)
      .is("left_at", null);
    const myLotIds = (memberships ?? []).map((m) => m.lot_id).filter(Boolean);
    if (myLotIds.length === 0) return [];
    query = query.in("lot_id", myLotIds).in("status", ["issued", "partially_paid", "paid", "overdue"]);
  } else if (lotId) {
    query = query.eq("lot_id", lotId);
  }

  const { data } = await query;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((l: any) => ({
    id: l.id,
    lot_number: l.lots?.lot_number,
    unit_number: l.lots?.unit_number,
    owner_name: l.lots?.owner_name,
    reference_number: l.reference_number,
    period_start: l.period_start,
    period_end: l.period_end,
    amount: Number(l.amount),
    amount_paid: Number(l.amount_paid),
    status: l.status,
    due_date: l.due_date,
    issued_at: l.issued_at,
    pdf_url: l.pdf_url,
  }));
}

// ─── Insurance Status ──────────────────────────────────────

export async function getInsuranceStatus(subdivisionId: string) {
  await requireSubdivisionAccess(subdivisionId);
  const supabase = createServerClient();

  const { data } = await supabase
    .from("insurance_policies")
    .select("*")
    .eq("subdivision_id", subdivisionId)
    .order("end_date", { ascending: false });

  return (data ?? []).map((p) => ({
    ...p,
    sum_insured: p.sum_insured ? Number(p.sum_insured) : null,
    premium: p.premium ? Number(p.premium) : null,
    is_expired: new Date(p.end_date) < new Date(),
    is_expiring_soon: !!(new Date(p.end_date) >= new Date() && new Date(p.end_date) < new Date(Date.now() + 30 * 86400000)),
  }));
}

// ─── Lot Owner Register ────────────────────────────────────

export async function getLotOwnerRegister(subdivisionId: string) {
  const profile = await getCurrentProfile();
  if (!profile) return [];
  await requireSubdivisionAccess(subdivisionId);

  const supabase = createServerClient();
  const { data } = await supabase
    .from("lots")
    .select("id, lot_number, unit_number, owner_name, owner_email, owner_phone, lot_entitlement, lot_liability, owner_occupied")
    .eq("subdivision_id", subdivisionId)
    .order("lot_number");

  const isManager = profile.role !== "lot_owner";

  return (data ?? []).map((lot) => ({
    lot_number: lot.lot_number,
    unit_number: lot.unit_number,
    owner_name: lot.owner_name,
    // Only managers see contact details
    owner_email: isManager ? lot.owner_email : null,
    owner_phone: isManager ? (lot.owner_phone ?? null) : null,
    lot_entitlement: lot.lot_entitlement,
    lot_liability: lot.lot_liability,
    owner_occupied: isManager ? lot.owner_occupied : null,
  }));
}

// ─── Communication Log ─────────────────────────────────────

export async function getCommunicationLog(subdivisionId: string) {
  await requireSubdivisionAccess(subdivisionId);
  const supabase = createServerClient();

  // Get notifications sent to this subdivision's lot owners
  const { data: notifications } = await supabase
    .from("notifications")
    .select("id, type, title, body, created_at")
    .eq("subdivision_id", subdivisionId)
    .order("created_at", { ascending: false })
    .limit(100);

  // Get invitations for this subdivision
  const { data: invitations } = await supabase
    .from("invitations")
    .select("id, email, name, role, status, created_at")
    .eq("subdivision_id", subdivisionId)
    .order("created_at", { ascending: false })
    .limit(50);

  const log = [
    ...(notifications ?? []).map((n) => ({
      id: n.id,
      type: n.type as string,
      description: n.title,
      detail: n.body,
      date: n.created_at,
      channel: "notification" as const,
    })),
    ...(invitations ?? []).map((inv) => ({
      id: inv.id,
      type: "invitation",
      description: `Invitation sent to ${inv.name ?? inv.email}`,
      detail: `Role: ${inv.role} · Status: ${inv.status}`,
      date: inv.created_at,
      channel: "email" as const,
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return log;
}

// ─── Audit Trail ───────────────────────────────────────────

export async function getAuditTrail(subdivisionId: string) {
  await requireSubdivisionAccess(subdivisionId);
  const supabase = createServerClient();

  const { data } = await supabase
    .from("audit_log")
    .select("id, action, entity_type, entity_id, before_state, after_state, created_at, profiles!inner(email, first_name, last_name)")
    .eq("subdivision_id", subdivisionId)
    .order("created_at", { ascending: false })
    .limit(100);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((entry: any) => ({
    id: entry.id,
    action: entry.action,
    entity_type: entry.entity_type,
    entity_id: entry.entity_id,
    before_state: entry.before_state,
    after_state: entry.after_state,
    date: entry.created_at,
    user_email: entry.profiles?.email,
    user_name: [entry.profiles?.first_name, entry.profiles?.last_name].filter(Boolean).join(" ") || entry.profiles?.email,
  }));
}

// ─── Get lots for filter dropdown ──────────────────────────

export async function getSubdivisionLots(subdivisionId: string) {
  await requireSubdivisionAccess(subdivisionId);
  const supabase = createServerClient();

  const { data } = await supabase
    .from("lots")
    .select("id, lot_number, unit_number, owner_name")
    .eq("subdivision_id", subdivisionId)
    .order("lot_number");

  return data ?? [];
}
