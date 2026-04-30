"use server";

import { getCurrentProfile, requireSubdivisionAccess } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";
import { getLotOwners } from "@/lib/actions/lot-ownership";

// ─── Levy History ──────────────────────────────────────────

export async function getLevyHistory(subdivisionId: string, lotId?: string) {
  const profile = await getCurrentProfile();
  if (!profile) return [];
  await requireSubdivisionAccess(subdivisionId);

  const supabase = createServerClient();
  let query = supabase
    .from("levy_notices")
    .select("id, lot_id, reference_number, period_start, period_end, amount, amount_paid, status, due_date, issued_at, pdf_url, lots!inner(lot_number, unit_number)")
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
  const rows = data ?? [];
  const lotIds = rows.map((r) => r.lot_id).filter(Boolean) as string[];
  const owners = await getLotOwners(supabase, lotIds);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return rows.map((l: any) => ({
    id: l.id,
    lot_number: l.lots?.lot_number,
    unit_number: l.lots?.unit_number,
    owner_display_name: owners.get(l.lot_id)?.owner_display_name ?? null,
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
    .select("id, lot_number, unit_number, lot_entitlement, lot_liability")
    .eq("subdivision_id", subdivisionId)
    .order("lot_number");

  const lots = data ?? [];
  const owners = await getLotOwners(supabase, lots.map((l) => l.id));
  const isManager = profile.role !== "lot_owner";

  return lots.map((lot) => {
    const owner = owners.get(lot.id);
    return {
      lot_number: lot.lot_number,
      unit_number: lot.unit_number,
      owner_display_name: owner?.owner_display_name ?? null,
      owner_status: owner?.owner_status ?? "unowned",
      // Only managers see contact details
      owner_contact_email: isManager ? (owner?.owner_contact_email ?? null) : null,
      owner_contact_phone: isManager ? (owner?.owner_contact_phone ?? null) : null,
      lot_entitlement: lot.lot_entitlement,
      lot_liability: lot.lot_liability,
    };
  });
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

// ─── OC Certificate data ───────────────────────────────────

const BILLING_PERIODS: Record<string, number> = {
  monthly: 12,
  quarterly: 4,
  half_yearly: 2,
  annually: 1,
};

export async function getOCCertificateData(subdivisionId: string, lotId: string, applicantName: string, applicantEmail: string) {
  await requireSubdivisionAccess(subdivisionId);
  const supabase = createServerClient();

  const [
    { data: subdivision },
    { data: lot },
    { data: levies },
    { data: insurance },
  ] = await Promise.all([
    supabase.from("subdivisions").select("*, management_companies!inner(name, address, logo_url, registered_name, signature_url)").eq("id", subdivisionId).single(),
    supabase.from("lots").select("*").eq("id", lotId).single(),
    supabase.from("levy_notices").select("*").eq("lot_id", lotId).in("status", ["issued", "partially_paid", "paid", "overdue"]).order("due_date", { ascending: true }),
    supabase.from("insurance_policies").select("*").eq("subdivision_id", subdivisionId).eq("status", "active"),
  ]);

  if (!subdivision || !lot) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const company = (subdivision as any).management_companies;

  // Calculate unpaid total
  const unpaidTotal = (levies ?? []).reduce((sum, l) => sum + (Number(l.amount) - Number(l.amount_paid)), 0);

  // Insurance summary
  const fmtAU = (d: string | null | undefined) => {
    if (!d) return "";
    const dt = d.includes("T") ? new Date(d) : new Date(d + "T00:00:00");
    return dt.toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });
  };
  const insuranceSummary = (insurance ?? []).length > 0
    ? (insurance ?? []).map((p) => {
        const period = p.start_date && p.end_date ? ` (${fmtAU(p.start_date)} - ${fmtAU(p.end_date)})` : "";
        return `${p.provider}${p.policy_number ? ` (Policy #: ${p.policy_number})` : ""}${period}`;
      }).join(", ")
    : "n/a";

  // Current fees — prefer most recent issued levy, fall back to approved admin budget
  let currentFees = "n/a";
  const latestLevy = (levies ?? [])[0];
  if (latestLevy) {
    currentFees = `$${Number(latestLevy.amount).toFixed(2)}`;
  } else {
    const { data: budget } = await supabase
      .from("budgets")
      .select("total_amount")
      .eq("subdivision_id", subdivisionId)
      .eq("fund_type", "administrative")
      .eq("status", "approved")
      .order("approved_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();

    if (budget) {
      const { data: allLots } = await supabase
        .from("lots")
        .select("id, lot_entitlement, lot_liability")
        .eq("subdivision_id", subdivisionId);

      const periodsPerYear = BILLING_PERIODS[subdivision.billing_cycle ?? "quarterly"] ?? 4;
      const totalEntitlement = (allLots ?? []).reduce((sum, l) => {
        const ue = Number(l.lot_liability) > 0 ? Number(l.lot_liability) : (Number(l.lot_entitlement) > 0 ? Number(l.lot_entitlement) : 1);
        return sum + ue;
      }, 0);
      const lotUE = Number(lot.lot_liability) > 0 ? Number(lot.lot_liability) : (Number(lot.lot_entitlement) > 0 ? Number(lot.lot_entitlement) : 1);
      const proportion = totalEntitlement > 0 ? lotUE / totalEntitlement : 0;
      const lotPeriodTotal = Math.round((Number(budget.total_amount) / periodsPerYear) * proportion * 100) / 100;
      currentFees = `$${lotPeriodTotal.toFixed(2)}`;
    }
  }

  // Fees paid up to — find latest fully paid levy period
  const sortedByPeriod = [...(levies ?? [])].sort((a, b) => new Date(b.period_end).getTime() - new Date(a.period_end).getTime());
  const latestPaid = sortedByPeriod.find((l) => l.status === "paid" || Number(l.amount_paid) >= Number(l.amount));
  const feesPaidUpTo = latestPaid?.period_end ?? "n/a";

  return {
    planNumber: subdivision.plan_number,
    subdivisionAddress: subdivision.address,
    lotNumber: lot.lot_number,
    lotUnitNumber: lot.unit_number,
    applicantName,
    applicantEmail,
    applicationDate: new Date().toISOString().split("T")[0],
    certificateDate: new Date().toISOString().split("T")[0],
    currentFees,
    billingCycle: subdivision.billing_cycle ?? "quarterly",
    feesPaidUpTo: feesPaidUpTo ?? "n/a",
    unpaidFeesTotal: Math.max(0, unpaidTotal),
    levies: (levies ?? []).map((l) => ({
      fund: l.fund_type === "administrative" ? "Administrative Fund" : "Capital Works Fund",
      amount: Number(l.amount),
      period_start: l.period_start,
      period_end: l.period_end,
      due_date: l.due_date,
    })),
    repairsInfo: "n/a",
    insuranceCover: insuranceSummary,
    totalFundsHeld: "n/a",
    liabilities: "n/a",
    currentContracts: "n/a",
    serviceAgreements: "n/a",
    noticesOrders: "n/a",
    legalProceedings: "n/a",
    managerAppointed: subdivision.manager_appointed ?? true,
    administratorAppointed: subdivision.administrator_appointed ?? false,
    lastAgmDate: "",
    companyName: company?.name ?? "",
    registeredName: company?.registered_name ?? company?.name ?? "",
    companyAddress: company?.address ?? "",
    logoUrl: company?.logo_url ?? null,
    signatureUrl: company?.signature_url ?? null,
    commonSealText: subdivision.common_seal_text ?? "",
    inspectionAddress: subdivision.inspection_address ?? company?.address ?? "",
  };
}

// ─── Get lots for filter dropdown ──────────────────────────

export async function getSubdivisionLots(subdivisionId: string) {
  await requireSubdivisionAccess(subdivisionId);
  const supabase = createServerClient();

  const { data } = await supabase
    .from("lots")
    .select("id, lot_number, unit_number")
    .eq("subdivision_id", subdivisionId)
    .order("lot_number");

  const lots = data ?? [];
  const owners = await getLotOwners(supabase, lots.map((l) => l.id));
  return lots.map((l) => ({
    ...l,
    owner_display_name: owners.get(l.id)?.owner_display_name ?? null,
  }));
}
