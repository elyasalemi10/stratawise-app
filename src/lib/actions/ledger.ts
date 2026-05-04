"use server";

import { requireCompanyRole, requireSubdivisionAccess } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";
import { revalidatePath } from "next/cache";
import {
  ledgerAdjustmentSchema,
  ledgerVoidSchema,
  lotStatementQuerySchema,
  type LedgerAdjustmentInput,
  type LedgerAuditEntry,
  type LedgerEntryCategory,
  type LedgerEntryDetail,
  type LedgerEntryStatus,
  type LedgerSourceLink,
  type LotLedgerEntry,
  type LotLedgerState,
  type LotStatement,
  type SubdivisionArrearsSummary,
} from "@/lib/validations/ledger";

// ─── getLotBalance ──────────────────────────────────────────────
// Reads the materialised lot_ledger_state row. If no row exists yet (e.g. a
// lot predating the trigger), we seed one by calling recompute so callers
// never get null.
export async function getLotBalance(lotId: string): Promise<LotLedgerState> {
  const supabase = createServerClient();

  const { data: lot } = await supabase
    .from("lots")
    .select("subdivision_id")
    .eq("id", lotId)
    .single();

  if (!lot) throw new Error(`Lot ${lotId} not found`);
  await requireSubdivisionAccess(lot.subdivision_id);

  const { data } = await supabase
    .from("lot_ledger_state")
    .select("*")
    .eq("lot_id", lotId)
    .single();

  if (data) return mapLedgerState(data);

  // Backfill: lot exists but no state row — recompute to seed it.
  await supabase.rpc("recompute_lot_ledger_state", { p_lot_id: lotId });
  const { data: seeded } = await supabase
    .from("lot_ledger_state")
    .select("*")
    .eq("lot_id", lotId)
    .single();

  if (!seeded) throw new Error(`Failed to seed lot_ledger_state for lot ${lotId}`);
  return mapLedgerState(seeded);
}

// ─── getLotLedgerEntries ────────────────────────────────────────
// Paginated entries for a lot. Defaults to active-only, sorted newest-first
// by entry_date then created_at for stable ordering when multiple entries
// share a date.
export async function getLotLedgerEntries(
  lotId: string,
  opts: {
    limit?: number;
    before?: string | null;
    status?: LedgerEntryStatus | null;
    category?: LedgerEntryCategory | null;
  } = {},
): Promise<LotLedgerEntry[]> {
  const supabase = createServerClient();

  const { data: lot } = await supabase
    .from("lots")
    .select("subdivision_id")
    .eq("id", lotId)
    .single();

  if (!lot) throw new Error(`Lot ${lotId} not found`);
  await requireSubdivisionAccess(lot.subdivision_id);

  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 500);
  // null = no status filter (return all); undefined = default to "active"
  const statusFilter = opts.status === undefined ? "active" : opts.status;

  // PP5-D-B: pre-fetch the parent entry's status via self-join on
  // duplicate_of. The dialog uses parent_status to render the
  // "voided parent" warning banner without an extra round-trip.
  let q = supabase
    .from("lot_ledger_entries")
    .select("*, parent:lot_ledger_entries!duplicate_of(status)")
    .eq("lot_id", lotId)
    .order("entry_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (statusFilter !== null) q = q.eq("status", statusFilter);

  if (opts.before) q = q.lt("entry_date", opts.before);
  if (opts.category) q = q.eq("category", opts.category);

  const { data, error } = await q;
  if (error) throw new Error(`Failed to load ledger entries: ${error.message}`);
  return (data ?? []).map(mapLedgerEntry);
}

// ─── recordAdjustment ──────────────────────────────────────────
// Zod-validated wrapper around rpc_ledger_adjustment.
export async function recordAdjustment(
  input: LedgerAdjustmentInput,
): Promise<{ entryId?: string; error?: string }> {
  const parsed = ledgerAdjustmentSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues.map((i) => i.message).join("; ") };
  }

  const profile = await requireCompanyRole();
  await requireSubdivisionAccess(parsed.data.subdivision_id);
  const supabase = createServerClient();

  const { data, error } = await supabase.rpc("rpc_ledger_adjustment", {
    p_subdivision_id: parsed.data.subdivision_id,
    p_lot_id: parsed.data.lot_id,
    p_fund_type: parsed.data.fund_type,
    p_entry_type: parsed.data.entry_type,
    p_category: parsed.data.category,
    p_amount: parsed.data.amount,
    p_entry_date: parsed.data.entry_date,
    p_description: parsed.data.description,
    p_created_by: profile.id,
  });

  if (error) return { error: error.message };

  // Ledger entry adjustments may affect any /levies, /budgets, /reconciliation
  // page in the subdivision; broad pattern invalidation is the simplest correct.
  revalidatePath("/subdivisions/[subdivisionCode]/levies", "page");
  revalidatePath("/subdivisions/[subdivisionCode]/reconciliation", "page");
  revalidatePath("/subdivisions/[subdivisionCode]/lots/[lotId]", "page");
  return { entryId: data as string };
}

// ─── voidLedgerEntry ───────────────────────────────────────────
// Wrapper around rpc_ledger_void. admin/manager only. Reason mandatory.
export async function voidLedgerEntry(
  entryId: string,
  reason: string,
): Promise<{ offsetId?: string; error?: string }> {
  const parsed = ledgerVoidSchema.safeParse({ entry_id: entryId, reason });
  if (!parsed.success) {
    return { error: parsed.error.issues.map((i) => i.message).join("; ") };
  }

  const profile = await requireCompanyRole(["admin", "manager"]);
  const supabase = createServerClient();

  const { data: entry } = await supabase
    .from("lot_ledger_entries")
    .select("subdivision_id")
    .eq("id", parsed.data.entry_id)
    .single();

  if (!entry) return { error: "Ledger entry not found" };
  await requireSubdivisionAccess(entry.subdivision_id);

  const { data, error } = await supabase.rpc("rpc_ledger_void", {
    p_entry_id: parsed.data.entry_id,
    p_reason: parsed.data.reason,
    p_voided_by: profile.id,
  });

  if (error) return { error: error.message };

  revalidatePath("/subdivisions/[subdivisionCode]/levies", "page");
  revalidatePath("/subdivisions/[subdivisionCode]/reconciliation", "page");
  revalidatePath("/subdivisions/[subdivisionCode]/lots/[lotId]", "page");
  return { offsetId: data as string };
}

// ─── getSubdivisionArrearsSummary ──────────────────────────────
// Queries lot_ledger_state only (never re-walks the ledger). Arrears = lots
// with total_balance < 0.
export async function getSubdivisionArrearsSummary(
  subdivisionId: string,
): Promise<SubdivisionArrearsSummary> {
  await requireSubdivisionAccess(subdivisionId);
  const supabase = createServerClient();

  const { data: states, error } = await supabase
    .from("lot_ledger_state")
    .select("admin_balance, capital_balance, total_balance, oldest_unpaid_date_admin, oldest_unpaid_date_capital")
    .eq("subdivision_id", subdivisionId);

  if (error) throw new Error(`Failed to load arrears summary: ${error.message}`);

  const rows = states ?? [];
  let arrearsCount = 0;
  let totalAdmin = 0;
  let totalCapital = 0;
  let oldest: string | null = null;

  for (const s of rows) {
    const total = Number(s.total_balance);
    const adminBal = Number(s.admin_balance);
    const capitalBal = Number(s.capital_balance);

    if (total < 0) arrearsCount += 1;
    if (adminBal < 0) totalAdmin += Math.abs(adminBal);
    if (capitalBal < 0) totalCapital += Math.abs(capitalBal);

    for (const d of [s.oldest_unpaid_date_admin, s.oldest_unpaid_date_capital]) {
      if (d && (!oldest || d < oldest)) oldest = d;
    }
  }

  return {
    subdivision_id: subdivisionId,
    lots_in_arrears: arrearsCount,
    lots_total: rows.length,
    total_arrears_admin: round2(totalAdmin),
    total_arrears_capital: round2(totalCapital),
    total_arrears: round2(totalAdmin + totalCapital),
    oldest_unpaid_date: oldest,
  };
}

// ─── getLotStatement ───────────────────────────────────────────
// Data for a statement PDF (rendering is Prompt 7). Opening = sum of active
// entries strictly before fromDate. Entries are active entries with
// entry_date between [fromDate, toDate] inclusive.
export async function getLotStatement(
  lotId: string,
  fromDate: string,
  toDate: string,
): Promise<LotStatement> {
  const parsed = lotStatementQuerySchema.safeParse({ lot_id: lotId, fromDate, toDate });
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join("; "));
  }

  const supabase = createServerClient();

  const { data: lot } = await supabase
    .from("lots")
    .select("subdivision_id")
    .eq("id", parsed.data.lot_id)
    .single();

  if (!lot) throw new Error(`Lot ${parsed.data.lot_id} not found`);
  await requireSubdivisionAccess(lot.subdivision_id);

  const [openingRes, rangeRes] = await Promise.all([
    supabase
      .from("lot_ledger_entries")
      .select("fund_type, entry_type, amount")
      .eq("lot_id", parsed.data.lot_id)
      .eq("status", "active")
      .lt("entry_date", parsed.data.fromDate),
    supabase
      .from("lot_ledger_entries")
      .select("*")
      .eq("lot_id", parsed.data.lot_id)
      .eq("status", "active")
      .gte("entry_date", parsed.data.fromDate)
      .lte("entry_date", parsed.data.toDate)
      .order("entry_date", { ascending: true })
      .order("created_at", { ascending: true }),
  ]);

  if (openingRes.error) throw new Error(openingRes.error.message);
  if (rangeRes.error) throw new Error(rangeRes.error.message);

  let openAdmin = 0;
  let openCapital = 0;
  for (const r of openingRes.data ?? []) {
    const delta = r.entry_type === "credit" ? Number(r.amount) : -Number(r.amount);
    if (r.fund_type === "administrative") openAdmin += delta;
    else openCapital += delta;
  }

  const entries = (rangeRes.data ?? []).map(mapLedgerEntry);

  let closeAdmin = openAdmin;
  let closeCapital = openCapital;
  for (const e of entries) {
    const delta = e.entry_type === "credit" ? e.amount : -e.amount;
    if (e.fund_type === "administrative") closeAdmin += delta;
    else closeCapital += delta;
  }

  return {
    lot_id: parsed.data.lot_id,
    subdivision_id: lot.subdivision_id,
    fromDate: parsed.data.fromDate,
    toDate: parsed.data.toDate,
    opening_balance_admin: round2(openAdmin),
    opening_balance_capital: round2(openCapital),
    opening_balance_total: round2(openAdmin + openCapital),
    entries,
    closing_balance_admin: round2(closeAdmin),
    closing_balance_capital: round2(closeCapital),
    closing_balance_total: round2(closeAdmin + closeCapital),
  };
}

// ─── Mappers ───────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapLedgerState(r: any): LotLedgerState {
  return {
    lot_id: r.lot_id,
    subdivision_id: r.subdivision_id,
    admin_balance: Number(r.admin_balance),
    capital_balance: Number(r.capital_balance),
    total_balance: Number(r.total_balance),
    oldest_unpaid_date_admin: r.oldest_unpaid_date_admin,
    oldest_unpaid_date_capital: r.oldest_unpaid_date_capital,
    last_entry_at: r.last_entry_at,
    updated_at: r.updated_at,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapLedgerEntry(r: any): LotLedgerEntry {
  // PP5-D-B: parent self-join may come back as either a single object
  // (single FK relation) or an array (PostgREST's default for embedded
  // resources). Handle both shapes defensively.
  const parentRaw = r.parent;
  const parentRow = Array.isArray(parentRaw) ? parentRaw[0] : parentRaw;
  const parentStatus: LedgerEntryStatus | null = parentRow?.status ?? null;
  return {
    id: r.id,
    subdivision_id: r.subdivision_id,
    lot_id: r.lot_id,
    fund_type: r.fund_type,
    entry_type: r.entry_type,
    category: r.category,
    amount: Number(r.amount),
    entry_date: r.entry_date,
    description: r.description,
    reference: r.reference,
    levy_notice_id: r.levy_notice_id,
    status: r.status,
    voided_at: r.voided_at,
    voided_by: r.voided_by,
    void_reason: r.void_reason,
    voided_by_entry_id: r.voided_by_entry_id,
    voids_entry_id: r.voids_entry_id,
    created_at: r.created_at,
    created_by: r.created_by,
    duplicate_of: r.duplicate_of ?? null,
    duplicate_status: r.duplicate_status ?? null,
    duplicate_metadata:
      (r.duplicate_metadata as Record<string, unknown> | null) ?? null,
    parent_status: parentStatus,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ─── getLedgerPaymentSourceLinks ───────────────────────────────
// Returns a map of entry_id → source link for payment credit entries in a lot.
// Used in the ledger tab to populate specific routing in void tooltips.
export async function getLedgerPaymentSourceLinks(
  lotId: string,
): Promise<Record<string, LedgerSourceLink>> {
  const supabase = createServerClient();

  const { data: lot } = await supabase
    .from("lots")
    .select("subdivision_id")
    .eq("id", lotId)
    .single();
  if (!lot) throw new Error(`Lot ${lotId} not found`);
  await requireSubdivisionAccess(lot.subdivision_id);

  // Step 1: get payment credit entry IDs for this lot
  const { data: paymentEntries } = await supabase
    .from("lot_ledger_entries")
    .select("id")
    .eq("lot_id", lotId)
    .eq("category", "payment")
    .eq("entry_type", "credit");

  const entryIds = (paymentEntries ?? []).map((e) => e.id);
  if (entryIds.length === 0) return {};

  // Step 2: query both source tables in parallel
  const [matchesRes, receiptsRes] = await Promise.all([
    supabase
      .from("reconciliation_matches")
      .select("ledger_entry_id, bank_transaction_id")
      .in("ledger_entry_id", entryIds),
    supabase
      .from("undeposited_funds_entries")
      .select("linked_ledger_credit_id, id, bank_account_id, receipt_number")
      .in("linked_ledger_credit_id", entryIds),
  ]);

  const result: Record<string, LedgerSourceLink> = {};

  for (const m of matchesRes.data ?? []) {
    result[m.ledger_entry_id] = {
      ...result[m.ledger_entry_id],
      bankTxnId: m.bank_transaction_id,
    };
  }
  for (const r of receiptsRes.data ?? []) {
    result[r.linked_ledger_credit_id] = {
      ...result[r.linked_ledger_credit_id],
      receiptId: r.id,
      receiptNumber: r.receipt_number,
      bankAccountId: r.bank_account_id,
    };
  }
  return result;
}

// ─── getLedgerEntryDetail ──────────────────────────────────────
// Full metadata for the drawer: entry + audit trail + source chain.
export async function getLedgerEntryDetail(
  entryId: string,
): Promise<LedgerEntryDetail> {
  const supabase = createServerClient();

  // PP5-D-B: pre-fetch parent.status via self-join — surfaces in the
  // drawer's duplicate review banner without an extra round-trip.
  const { data: entry, error: entryErr } = await supabase
    .from("lot_ledger_entries")
    .select("*, parent:lot_ledger_entries!duplicate_of(status)")
    .eq("id", entryId)
    .single();
  if (entryErr || !entry) throw new Error("Ledger entry not found");
  await requireSubdivisionAccess(entry.subdivision_id);

  const mappedEntry = mapLedgerEntry(entry);

  // Audit trail, source chain, and related entry — all in parallel
  const relatedEntryId =
    mappedEntry.category === "void_offset"
      ? mappedEntry.voids_entry_id
      : mappedEntry.voided_by_entry_id;

  const [auditRes, relatedRes, sourceRes] = await Promise.all([
    supabase
      .from("audit_log")
      .select("id, action, profile_id, before_state, after_state, metadata, created_at")
      .eq("entity_id", entryId)
      .order("created_at", { ascending: false })
      .limit(100),

    relatedEntryId
      ? supabase
          .from("lot_ledger_entries")
          .select("*")
          .eq("id", relatedEntryId)
          .single()
      : Promise.resolve({ data: null }),

    buildSourceLink(supabase, mappedEntry),
  ]);

  // Join profiles to resolve names for each audit entry
  const profileIds = [...new Set((auditRes.data ?? []).map((r) => r.profile_id).filter(Boolean))];
  const profileNameMap: Record<string, string> = {};
  if (profileIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, first_name, last_name")
      .in("id", profileIds);
    for (const p of profiles ?? []) {
      const name = [p.first_name, p.last_name].filter(Boolean).join(" ");
      profileNameMap[p.id] = name || `Manager ${p.id.slice(0, 8)}`;
    }
  }

  const auditTrail: LedgerAuditEntry[] = (auditRes.data ?? []).map((r) => ({
    id: r.id,
    action: r.action,
    profile_id: r.profile_id,
    performed_by_name: profileNameMap[r.profile_id] ?? null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    before_state: r.before_state as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    after_state: r.after_state as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    metadata: r.metadata as any,
    created_at: r.created_at,
  }));

  const relatedEntry =
    relatedRes.data ? mapLedgerEntry(relatedRes.data) : null;

  return { entry: mappedEntry, auditTrail, sourceLink: sourceRes, relatedEntry };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function buildSourceLink(supabase: any, entry: LotLedgerEntry): Promise<LedgerSourceLink> {
  const link: LedgerSourceLink = {};

  if (
    (entry.category === "levy" || entry.category === "special_levy") &&
    entry.levy_notice_id
  ) {
    const { data: notice } = await supabase
      .from("levy_notices")
      .select("id, reference_number, batch_id")
      .eq("id", entry.levy_notice_id)
      .single();
    if (notice) {
      link.levyBatchId = notice.batch_id;
      link.levyReference = notice.reference_number;
    }
  } else if (entry.category === "payment" && entry.entry_type === "credit") {
    const [matchRes, receiptRes] = await Promise.all([
      supabase
        .from("reconciliation_matches")
        .select("bank_transaction_id")
        .eq("ledger_entry_id", entry.id)
        .limit(1)
        .maybeSingle(),
      supabase
        .from("undeposited_funds_entries")
        .select("id, receipt_number, bank_account_id")
        .eq("linked_ledger_credit_id", entry.id)
        .limit(1)
        .maybeSingle(),
    ]);
    if (matchRes.data) link.bankTxnId = matchRes.data.bank_transaction_id;
    if (receiptRes.data) {
      link.receiptId = receiptRes.data.id;
      link.receiptNumber = receiptRes.data.receipt_number;
      link.bankAccountId = receiptRes.data.bank_account_id;
    }
  }

  return link;
}
