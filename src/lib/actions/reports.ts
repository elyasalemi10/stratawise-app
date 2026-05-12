"use server";

import { getCurrentProfile, requireOCAccess } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";
import { getLotOwners } from "@/lib/actions/lot-ownership";

// ─── Levy History ──────────────────────────────────────────

export async function getLevyHistory(ocId: string, lotId?: string) {
  const profile = await getCurrentProfile();
  if (!profile) return [];
  await requireOCAccess(ocId);

  const supabase = createServerClient();
  let query = supabase
    .from("levy_notices")
    .select("id, lot_id, reference_number, period_start, period_end, amount, amount_paid, status, due_date, issued_at, pdf_url, lots!inner(lot_number, unit_number)")
    .eq("oc_id", ocId)
    .order("due_date", { ascending: false });

  // Lot owners can only see their own levies
  if (profile.role === "lot_owner") {
    const { data: memberships } = await supabase
      .from("oc_members")
      .select("lot_id")
      .eq("oc_id", ocId)
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

export async function getInsuranceStatus(ocId: string) {
  await requireOCAccess(ocId);
  const supabase = createServerClient();

  const { data } = await supabase
    .from("insurance_policies")
    .select("*")
    .eq("oc_id", ocId)
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

export async function getLotOwnerRegister(ocId: string) {
  const profile = await getCurrentProfile();
  if (!profile) return [];
  await requireOCAccess(ocId);

  const supabase = createServerClient();
  const { data } = await supabase
    .from("lots")
    .select("id, lot_number, unit_number, lot_entitlement, lot_liability")
    .eq("oc_id", ocId)
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

export async function getCommunicationLog(ocId: string) {
  await requireOCAccess(ocId);
  const supabase = createServerClient();

  // Get notifications sent to this oc's lot owners
  const { data: notifications } = await supabase
    .from("notifications")
    .select("id, type, title, body, created_at")
    .eq("oc_id", ocId)
    .order("created_at", { ascending: false })
    .limit(100);

  // Get invitations for this oc
  const { data: invitations } = await supabase
    .from("invitations")
    .select("id, email, name, role, status, created_at")
    .eq("oc_id", ocId)
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

export async function getAuditTrail(ocId: string) {
  await requireOCAccess(ocId);
  const supabase = createServerClient();

  const { data } = await supabase
    .from("audit_log")
    .select("id, action, entity_type, entity_id, before_state, after_state, created_at, profiles!inner(email, first_name, last_name)")
    .eq("oc_id", ocId)
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

export async function getOCCertificateData(ocId: string, lotId: string, applicantName: string, applicantEmail: string) {
  await requireOCAccess(ocId);
  const supabase = createServerClient();

  const [
    { data: oc },
    { data: lot },
    { data: levies },
    { data: insurance },
  ] = await Promise.all([
    supabase.from("owners_corporations").select("*, management_companies!inner(name, address, logo_url, registered_name, signature_url)").eq("id", ocId).single(),
    supabase.from("lots").select("*").eq("id", lotId).single(),
    supabase.from("levy_notices").select("*").eq("lot_id", lotId).in("status", ["issued", "partially_paid", "paid", "overdue"]).order("due_date", { ascending: true }),
    supabase.from("insurance_policies").select("*").eq("oc_id", ocId).eq("status", "active"),
  ]);

  if (!oc || !lot) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const company = (oc as any).management_companies;

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
      .eq("oc_id", ocId)
      .eq("fund_type", "administrative")
      .eq("status", "approved")
      .order("approved_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();

    if (budget) {
      const { data: allLots } = await supabase
        .from("lots")
        .select("id, lot_entitlement, lot_liability")
        .eq("oc_id", ocId);

      const periodsPerYear = BILLING_PERIODS[oc.billing_cycle ?? "quarterly"] ?? 4;
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
    planNumber: oc.plan_number,
    ocAddress: oc.address,
    lotNumber: lot.lot_number,
    lotUnitNumber: lot.unit_number,
    applicantName,
    applicantEmail,
    applicationDate: new Date().toISOString().split("T")[0],
    certificateDate: new Date().toISOString().split("T")[0],
    currentFees,
    billingCycle: oc.billing_cycle ?? "quarterly",
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
    managerAppointed: oc.manager_appointed ?? true,
    administratorAppointed: oc.administrator_appointed ?? false,
    lastAgmDate: "",
    companyName: company?.name ?? "",
    registeredName: company?.registered_name ?? company?.name ?? "",
    companyAddress: company?.address ?? "",
    logoUrl: company?.logo_url ?? null,
    signatureUrl: company?.signature_url ?? null,
    commonSealText: oc.common_seal_text ?? "",
    inspectionAddress: oc.inspection_address ?? company?.address ?? "",
  };
}

// ─── Get lots for filter dropdown ──────────────────────────

export async function getOCLots(ocId: string) {
  await requireOCAccess(ocId);
  const supabase = createServerClient();

  const { data } = await supabase
    .from("lots")
    .select("id, lot_number, unit_number")
    .eq("oc_id", ocId)
    .order("lot_number");

  const lots = data ?? [];
  const owners = await getLotOwners(supabase, lots.map((l) => l.id));
  return lots.map((l) => ({
    ...l,
    owner_display_name: owners.get(l.id)?.owner_display_name ?? null,
  }));
}

// ============================================================================
// PP7-B: new manager reports
// ----------------------------------------------------------------------------
// Three reports added in PP7-B that don't duplicate the existing 6:
//   - Outstanding arrears (per-lot aggregate; principal + interest + ageing)
//   - Owner statement (per-lot ledger over a date range)
//   - Trust account summary (per-bank-account inflows/outflows + reconciled)
// ============================================================================

// ─── Outstanding Arrears ───────────────────────────────────

export interface OutstandingArrearsRow {
  lot_id: string;
  lot_number: number;
  unit_number: string | null;
  owner_display_name: string | null;
  principal_outstanding: number;
  interest_outstanding: number;
  total_outstanding: number;
  oldest_due_date: string | null;
  days_overdue: number; // 0 when nothing overdue (i.e. earliest still future)
  bucket: "current" | "0_30" | "31_60" | "61_plus";
}

export async function getOutstandingArrearsReport(
  ocId: string,
  asOfDateIso?: string,
): Promise<OutstandingArrearsRow[]> {
  // Manager-only: requireOCAccess is sufficient (it gates on
  // role + company membership). Owner role doesn't reach here from the
  // UI (managerOnly: true on the report card).
  await requireOCAccess(ocId);
  const supabase = createServerClient();

  const asOf = asOfDateIso ?? new Date().toISOString().slice(0, 10);

  // Pull all unpaid levy_notices for the oc. Includes
  // penalty_interest sub-rows; we'll split them out per lot.
  const { data: noticesData } = await supabase
    .from("levy_notices")
    .select(
      "id, lot_id, amount, amount_paid, due_date, status, levy_type, linked_levy_id",
    )
    .eq("oc_id", ocId)
    .in("status", ["issued", "partially_paid", "overdue"]);

  const notices = (noticesData ?? []) as Array<{
    id: string;
    lot_id: string;
    amount: number | string;
    amount_paid: number | string;
    due_date: string;
    status: string;
    levy_type: string;
    linked_levy_id: string | null;
  }>;

  // Aggregate per-lot.
  type Agg = {
    principal: number;
    interest: number;
    oldestDue: string | null;
  };
  const perLot = new Map<string, Agg>();
  for (const n of notices) {
    const outstanding = Number(n.amount) - Number(n.amount_paid);
    if (outstanding <= 0) continue;
    const entry = perLot.get(n.lot_id) ?? {
      principal: 0,
      interest: 0,
      oldestDue: null,
    };
    if (n.levy_type === "penalty_interest") {
      entry.interest += outstanding;
    } else {
      entry.principal += outstanding;
    }
    // Track oldest due_date across principal notices only (interest's
    // due_date is its own accrual date; not meaningful for ageing).
    if (n.levy_type !== "penalty_interest") {
      if (!entry.oldestDue || n.due_date < entry.oldestDue) {
        entry.oldestDue = n.due_date;
      }
    }
    perLot.set(n.lot_id, entry);
  }

  const lotIds = Array.from(perLot.keys());
  if (lotIds.length === 0) return [];

  // Hydrate lot metadata + owners.
  const { data: lotsData } = await supabase
    .from("lots")
    .select("id, lot_number, unit_number")
    .in("id", lotIds)
    .order("lot_number");
  const lots = (lotsData ?? []) as Array<{
    id: string;
    lot_number: number;
    unit_number: string | null;
  }>;
  const owners = await getLotOwners(supabase, lotIds);

  const rows: OutstandingArrearsRow[] = lots.map((lot) => {
    const agg = perLot.get(lot.id)!;
    const total = round2(agg.principal + agg.interest);
    const daysOverdue = agg.oldestDue
      ? Math.max(0, daysBetweenIso(agg.oldestDue, asOf))
      : 0;
    const bucket: OutstandingArrearsRow["bucket"] =
      daysOverdue === 0
        ? "current"
        : daysOverdue <= 30
        ? "0_30"
        : daysOverdue <= 60
        ? "31_60"
        : "61_plus";
    return {
      lot_id: lot.id,
      lot_number: lot.lot_number,
      unit_number: lot.unit_number,
      owner_display_name: owners.get(lot.id)?.owner_display_name ?? null,
      principal_outstanding: round2(agg.principal),
      interest_outstanding: round2(agg.interest),
      total_outstanding: total,
      oldest_due_date: agg.oldestDue,
      days_overdue: daysOverdue,
      bucket,
    };
  });

  // Sort by total outstanding desc — managers want the biggest arrears first.
  rows.sort((a, b) => b.total_outstanding - a.total_outstanding);
  return rows;
}

// ─── Owner Statement (per-lot ledger over a date range) ────

export interface OwnerStatementEntry {
  entry_date: string;
  category: string;
  description: string | null;
  debit: number;     // 0 when entry is a credit
  credit: number;    // 0 when entry is a debit
  reference: string | null;
  balance_after: number;
}

export interface OwnerStatementReport {
  lot_id: string;
  lot_number: number;
  unit_number: string | null;
  owner_display_name: string | null;
  from_date: string;
  to_date: string;
  opening_balance: number;
  closing_balance: number;
  entries: OwnerStatementEntry[];
}

export async function getOwnerStatement(
  ocId: string,
  lotId: string,
  fromDateIso: string,
  toDateIso: string,
): Promise<OwnerStatementReport> {
  // Authz: owners can pull their own; managers can pull any. requireOCAccess
  // gates company membership; we add a per-lot check for lot_owner role.
  const profile = await getCurrentProfile();
  if (!profile) throw new Error("Not authenticated");
  await requireOCAccess(ocId);

  const supabase = createServerClient();

  if (profile.role === "lot_owner") {
    const { data: memberRow } = await supabase
      .from("oc_members")
      .select("id")
      .eq("oc_id", ocId)
      .eq("profile_id", profile.id)
      .eq("lot_id", lotId)
      .is("left_at", null)
      .maybeSingle();
    if (!memberRow) throw new Error("Forbidden");
  }

  // Hydrate lot + owner.
  const { data: lotRow } = await supabase
    .from("lots")
    .select("id, lot_number, unit_number")
    .eq("id", lotId)
    .single();
  if (!lotRow) throw new Error("Lot not found");
  const lot = lotRow as { id: string; lot_number: number; unit_number: string | null };
  const owners = await getLotOwners(supabase, [lot.id]);

  // Opening balance = sum of (credit − debit) across active entries with
  // entry_date < fromDate. (Voided entries cancel via their void_offset
  // counterpart; both stay active per the ledger model so the SUM still
  // nets to zero.)
  const { data: openingRows } = await supabase
    .from("lot_ledger_entries")
    .select("entry_type, amount")
    .eq("lot_id", lotId)
    .lt("entry_date", fromDateIso)
    .eq("status", "active");
  const opening = (openingRows ?? []).reduce((acc: number, r: { entry_type: string; amount: number | string }) => {
    const v = Number(r.amount);
    return r.entry_type === "credit" ? acc + v : acc - v;
  }, 0);

  // Window entries.
  const { data: windowRows } = await supabase
    .from("lot_ledger_entries")
    .select("id, entry_date, entry_type, category, amount, reference, description")
    .eq("lot_id", lotId)
    .gte("entry_date", fromDateIso)
    .lte("entry_date", toDateIso)
    .eq("status", "active")
    .order("entry_date", { ascending: true })
    .order("created_at", { ascending: true });

  let running = opening;
  const entries: OwnerStatementEntry[] = (windowRows ?? []).map((r: {
    entry_date: string;
    entry_type: string;
    category: string;
    amount: number | string;
    reference: string | null;
    description: string | null;
  }) => {
    const v = Number(r.amount);
    const debit = r.entry_type === "debit" ? v : 0;
    const credit = r.entry_type === "credit" ? v : 0;
    running = round2(running + (credit - debit));
    return {
      entry_date: r.entry_date,
      category: r.category,
      description: r.description,
      debit: round2(debit),
      credit: round2(credit),
      reference: r.reference,
      balance_after: running,
    };
  });

  return {
    lot_id: lot.id,
    lot_number: lot.lot_number,
    unit_number: lot.unit_number,
    owner_display_name: owners.get(lot.id)?.owner_display_name ?? null,
    from_date: fromDateIso,
    to_date: toDateIso,
    opening_balance: round2(opening),
    closing_balance: round2(running),
    entries,
  };
}

// ─── Trust Account Summary ─────────────────────────────────

export interface TrustAccountSummaryRow {
  bank_account_id: string;
  account_name: string;
  bsb: string;
  account_number: string;
  fund_type: string;
  bank_name: string | null;
  opening_balance: number;
  inflows: number;
  outflows: number;
  closing_balance: number;
  transaction_count: number;
  reconciled_count: number;
  unreconciled_count: number;
  last_sync_at: string | null;
}

export async function getTrustAccountSummary(
  ocId: string,
  fromDateIso: string,
  toDateIso: string,
): Promise<TrustAccountSummaryRow[]> {
  await requireOCAccess(ocId);
  const supabase = createServerClient();

  const { data: accountsData } = await supabase
    .from("bank_accounts")
    .select(
      "id, account_name, bsb, account_number, fund_type, bank_name, opening_balance, opening_balance_date, last_sync_at",
    )
    .eq("oc_id", ocId)
    .order("account_name");
  const accounts = (accountsData ?? []) as Array<{
    id: string;
    account_name: string;
    bsb: string;
    account_number: string;
    fund_type: string;
    bank_name: string | null;
    opening_balance: number | string;
    opening_balance_date: string | null;
    last_sync_at: string | null;
  }>;

  const rows: TrustAccountSummaryRow[] = [];
  for (const acc of accounts) {
    // Bank txns: opening (from opening_balance + everything before fromDate),
    // window (between fromDate and toDate inclusive).
    const { data: priorTxns } = await supabase
      .from("bank_transactions")
      .select("amount, match_status")
      .eq("bank_account_id", acc.id)
      .lt("transaction_date", fromDateIso);
    const { data: windowTxns } = await supabase
      .from("bank_transactions")
      .select("amount, match_status")
      .eq("bank_account_id", acc.id)
      .gte("transaction_date", fromDateIso)
      .lte("transaction_date", toDateIso);

    const opening = Number(acc.opening_balance ?? 0)
      + (priorTxns ?? []).reduce((s: number, t: { amount: number | string }) => s + Number(t.amount), 0);
    const win = (windowTxns ?? []) as Array<{ amount: number | string; match_status: string }>;
    let inflows = 0;
    let outflows = 0;
    let reconciled = 0;
    let unreconciled = 0;
    for (const t of win) {
      const v = Number(t.amount);
      if (v >= 0) inflows += v;
      else outflows += -v;
      if (t.match_status === "auto_matched" || t.match_status === "manually_matched") {
        reconciled += 1;
      } else if (t.match_status === "unmatched") {
        unreconciled += 1;
      }
    }
    const closing = opening + inflows - outflows;

    rows.push({
      bank_account_id: acc.id,
      account_name: acc.account_name,
      bsb: acc.bsb,
      account_number: acc.account_number,
      fund_type: acc.fund_type,
      bank_name: acc.bank_name,
      opening_balance: round2(opening),
      inflows: round2(inflows),
      outflows: round2(outflows),
      closing_balance: round2(closing),
      transaction_count: win.length,
      reconciled_count: reconciled,
      unreconciled_count: unreconciled,
      last_sync_at: acc.last_sync_at,
    });
  }
  return rows;
}

// ─── Internal helpers ─────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function daysBetweenIso(fromIso: string, toIso: string): number {
  const a = new Date(fromIso + "T00:00:00Z").getTime();
  const b = new Date(toIso + "T00:00:00Z").getTime();
  return Math.floor((b - a) / (1000 * 60 * 60 * 24));
}
