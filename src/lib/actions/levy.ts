"use server";

import { requireCompanyRole, requireSubdivisionAccess } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";
import { revalidatePath } from "next/cache";
import { generateAndUploadLevyPDF, generateLevyPDFBuffer } from "@/lib/levy-pdf";
import { sendLevyEmail } from "@/lib/email";
import { formatDateLong } from "@/lib/utils";
import { notifySubdivisionLotOwners } from "@/lib/actions/notifications";
import { getLotOwners } from "@/lib/actions/lot-ownership";
import type { LevyNoticeProps } from "@/lib/pdf/types";

// ─── Types ─────────────────────────────────────────────────

export interface LevyPreviewLot {
  lot_id: string;
  lot_number: number;
  unit_number: string | null;
  owner_display_name: string | null;
  owner_contact_email: string | null;
  lot_entitlement: number;
  total_entitlement: number;
  proportion: number; // lot UE / total UE
  base_amount: number;
  items: { description: string; amount: number; budget_item_id: string | null }[];
}

export interface LevyPreviewData {
  budget_id: string;
  financial_year: string;
  fund_type: "administrative" | "capital_works";
  period_label: string;
  period_start: string;
  period_end: string;
  due_date: string;
  period_amount: number; // budget total / periods
  total_entitlement: number;
  lots: LevyPreviewLot[];
  billing_cycle: string;
}

export interface LevyBatchSummary {
  id: string;
  financial_year: string;
  fund_type: "administrative" | "capital_works";
  period_label: string;
  period_start: string;
  period_end: string;
  due_date: string;
  total_amount: number;
  levy_count: number;
  status: "draft" | "ledger_written" | "sent" | "partially_sent";
  created_at: string;
}

export interface LevyBatchDetail extends LevyBatchSummary {
  levies: {
    id: string;
    lot_id: string;
    lot_number: number;
    unit_number: string | null;
    owner_display_name: string | null;
    owner_contact_email: string | null;
    reference_number: string;
    amount: number;
    status: string;
    pdf_url: string | null;
    items: { description: string; amount: number; is_adjustment: boolean }[];
  }[];
}

// ─── Helpers ───────────────────────────────────────────────

const BILLING_PERIODS: Record<string, number> = {
  monthly: 12,
  quarterly: 4,
  half_yearly: 2,
  annually: 1,
};

function getPeriodsForCycle(cycle: string) {
  return BILLING_PERIODS[cycle] ?? 4;
}

function getPeriodDates(
  fyStartMonth: number,
  fyStartYear: number,
  periodIndex: number,
  periodsPerYear: number,
): { start: string; end: string; label: string } {
  const monthsPerPeriod = 12 / periodsPerYear;
  const startMonth = ((fyStartMonth - 1) + periodIndex * monthsPerPeriod) % 12;
  const startYear = fyStartYear + Math.floor(((fyStartMonth - 1) + periodIndex * monthsPerPeriod) / 12);

  const endPeriodMonth = ((fyStartMonth - 1) + (periodIndex + 1) * monthsPerPeriod) % 12;
  const endYear = fyStartYear + Math.floor(((fyStartMonth - 1) + (periodIndex + 1) * monthsPerPeriod) / 12);

  const start = new Date(startYear, startMonth, 1);
  const end = new Date(endYear, endPeriodMonth, 0); // last day of previous month

  const formatDate = (d: Date) => d.toISOString().split("T")[0];

  // Label
  let label: string;
  if (periodsPerYear === 4) {
    label = `Q${periodIndex + 1}`;
  } else if (periodsPerYear === 2) {
    label = `H${periodIndex + 1}`;
  } else if (periodsPerYear === 1) {
    label = "Annual";
  } else {
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    label = monthNames[startMonth];
  }

  return { start: formatDate(start), end: formatDate(end), label };
}

function calculateDueDate(periodStart: string): string {
  // Due 28 days after period start
  const d = new Date(periodStart);
  d.setDate(d.getDate() + 28);
  return d.toISOString().split("T")[0];
}

// ─── Rollback helper for createLevyBatch atomicity ──────────
// If rpc_levy_batch_debit fails after we've inserted batch + notices + items,
// this helper undoes the JS-side writes. Returns flags describing whether
// anything was left behind so the caller can escalate to a critical audit.
type RollbackReport = {
  clean: boolean;
  batchRemains: boolean;
  orphanedNoticeIds: string[];
  itemsDeleteFailed: boolean;
};

async function rollbackBatchInsert(
  supabase: ReturnType<typeof createServerClient>,
  batchId: string,
  levyIds: string[],
): Promise<RollbackReport> {
  let itemsDeleteFailed = false;
  const orphanedNoticeIds: string[] = [];
  let batchRemains = false;

  if (levyIds.length > 0) {
    const { error: itemsErr } = await supabase
      .from("levy_notice_items")
      .delete()
      .in("levy_notice_id", levyIds);
    if (itemsErr) itemsDeleteFailed = true;

    const { data: remaining, error: noticesErr } = await supabase
      .from("levy_notices")
      .delete()
      .in("id", levyIds)
      .select("id");
    if (noticesErr) {
      orphanedNoticeIds.push(...levyIds);
    } else {
      const deletedIds = new Set((remaining ?? []).map((r) => r.id));
      const failedIds = levyIds.filter((id) => !deletedIds.has(id));
      orphanedNoticeIds.push(...failedIds);
    }
  }

  const { error: batchErr } = await supabase.from("levy_batches").delete().eq("id", batchId);
  if (batchErr) batchRemains = true;

  return {
    clean: !batchRemains && orphanedNoticeIds.length === 0 && !itemsDeleteFailed,
    batchRemains,
    orphanedNoticeIds,
    itemsDeleteFailed,
  };
}

// ─── Get next period to generate ───────────────────────────

export async function getNextPeriod(subdivisionId: string, budgetId: string) {
  await requireSubdivisionAccess(subdivisionId);
  const supabase = createServerClient();

  // Get budget + subdivision info
  const [{ data: budget }, { data: subdivision }] = await Promise.all([
    supabase.from("budgets").select("*").eq("id", budgetId).single(),
    supabase.from("subdivisions").select("financial_year_start_month, billing_cycle").eq("id", subdivisionId).single(),
  ]);

  if (!budget || !subdivision) return null;

  const periodsPerYear = getPeriodsForCycle(subdivision.billing_cycle);
  const fyParts = budget.financial_year.split("-");
  const fyStartYear = parseInt(fyParts[0]);
  const fyStartMonth = subdivision.financial_year_start_month ?? 7;

  // Check which periods already have batches
  const { data: existingBatches } = await supabase
    .from("levy_batches")
    .select("period_start")
    .eq("budget_id", budgetId);

  const existingPeriodStarts = new Set((existingBatches ?? []).map((b) => b.period_start));

  // Find first period that hasn't been generated
  for (let i = 0; i < periodsPerYear; i++) {
    const period = getPeriodDates(fyStartMonth, fyStartYear, i, periodsPerYear);
    if (!existingPeriodStarts.has(period.start)) {
      return {
        periodIndex: i,
        ...period,
        label: `${period.label} ${budget.financial_year}`,
        due_date: calculateDueDate(period.start),
        billing_cycle: subdivision.billing_cycle,
        periods_per_year: periodsPerYear,
      };
    }
  }

  return null; // All periods generated
}

// ─── Get available periods for a budget ────────────────────

export interface AvailablePeriod {
  periodIndex: number;
  label: string;
  start: string;
  end: string;
  due_date: string;
  already_generated: boolean;
}

export async function getAvailablePeriods(subdivisionId: string, budgetId: string): Promise<AvailablePeriod[]> {
  await requireSubdivisionAccess(subdivisionId);
  const supabase = createServerClient();

  const [{ data: budget }, { data: subdivision }] = await Promise.all([
    supabase.from("budgets").select("*").eq("id", budgetId).single(),
    supabase.from("subdivisions").select("financial_year_start_month, billing_cycle").eq("id", subdivisionId).single(),
  ]);

  if (!budget || !subdivision) return [];

  const periodsPerYear = getPeriodsForCycle(subdivision.billing_cycle);
  const fyParts = budget.financial_year.split("-");
  const fyStartYear = parseInt(fyParts[0]);
  const fyStartMonth = subdivision.financial_year_start_month ?? 7;

  const { data: existingBatches } = await supabase
    .from("levy_batches")
    .select("period_start")
    .eq("budget_id", budgetId);

  const existingPeriodStarts = new Set((existingBatches ?? []).map((b) => b.period_start));

  const periods: AvailablePeriod[] = [];
  for (let i = 0; i < periodsPerYear; i++) {
    const period = getPeriodDates(fyStartMonth, fyStartYear, i, periodsPerYear);
    periods.push({
      periodIndex: i,
      label: `${period.label} ${budget.financial_year}`,
      start: period.start,
      end: period.end,
      due_date: calculateDueDate(period.start),
      already_generated: existingPeriodStarts.has(period.start),
    });
  }

  return periods;
}

// ─── Generate levy preview ─────────────────────────────────

export async function generateLevyPreview(
  subdivisionId: string,
  budgetId: string,
  periodIndex?: number,
): Promise<{ data?: LevyPreviewData; error?: string }> {
  await requireSubdivisionAccess(subdivisionId);
  const supabase = createServerClient();

  // Get budget with items
  const { data: budget } = await supabase
    .from("budgets")
    .select("*")
    .eq("id", budgetId)
    .eq("status", "approved")
    .single();

  if (!budget) return { error: "Budget not found or not approved" };

  const { data: budgetItems } = await supabase
    .from("budget_items")
    .select("id, description, amount, category_id, budget_categories!inner(name)")
    .eq("budget_id", budgetId)
    .order("sort_order");

  // Get subdivision settings
  const { data: subdivision } = await supabase
    .from("subdivisions")
    .select("financial_year_start_month, billing_cycle")
    .eq("id", subdivisionId)
    .single();

  if (!subdivision) return { error: "Subdivision not found" };

  // Get period — either specific index or auto-detect next
  let nextPeriod;
  if (periodIndex !== undefined) {
    const periodsPerYear = getPeriodsForCycle(subdivision.billing_cycle);
    const fyParts = budget.financial_year.split("-");
    const fyStartYear = parseInt(fyParts[0]);
    const fyStartMonth = subdivision.financial_year_start_month ?? 7;
    const period = getPeriodDates(fyStartMonth, fyStartYear, periodIndex, periodsPerYear);
    nextPeriod = {
      periodIndex,
      ...period,
      label: `${period.label} ${budget.financial_year}`,
      due_date: calculateDueDate(period.start),
      billing_cycle: subdivision.billing_cycle,
      periods_per_year: periodsPerYear,
    };
  } else {
    nextPeriod = await getNextPeriod(subdivisionId, budgetId);
    if (!nextPeriod) return { error: "All periods for this financial year have been generated" };
  }

  // Get lots
  const { data: lots } = await supabase
    .from("lots")
    .select("id, lot_number, unit_number, lot_entitlement, lot_liability")
    .eq("subdivision_id", subdivisionId)
    .order("lot_number");

  if (!lots || lots.length === 0) return { error: "No lots found in this subdivision" };

  const owners = await getLotOwners(supabase, lots.map((l) => l.id));

  const periodsPerYear = getPeriodsForCycle(subdivision.billing_cycle);
  const periodAmount = Number(budget.total_amount) / periodsPerYear;

  // Calculate total entitlement (use lot_liability if available, else lot_entitlement)
  const totalEntitlement = lots.reduce((sum, lot) => {
    const ue = lot.lot_liability > 0 ? lot.lot_liability : (lot.lot_entitlement > 0 ? lot.lot_entitlement : 1);
    return sum + ue;
  }, 0);

  // Build per-lot preview
  const previewLots: LevyPreviewLot[] = lots.map((lot) => {
    const lotUE = lot.lot_liability > 0 ? lot.lot_liability : (lot.lot_entitlement > 0 ? lot.lot_entitlement : 1);
    const proportion = lotUE / totalEntitlement;
    const lotPeriodTotal = Math.round(periodAmount * proportion * 100) / 100;

    // Split into line items proportional to budget items
    const items = (budgetItems ?? [])
      .filter((bi) => Number(bi.amount) > 0)
      .map((bi) => {
        const itemPeriodAmount = Number(bi.amount) / periodsPerYear;
        const lotItemAmount = Math.round(itemPeriodAmount * proportion * 100) / 100;
        return {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          description: bi.description || (bi as any).budget_categories?.name || "Budget item",
          amount: lotItemAmount,
          budget_item_id: bi.id,
        };
      });

    const owner = owners.get(lot.id);
    return {
      lot_id: lot.id,
      lot_number: lot.lot_number,
      unit_number: lot.unit_number,
      owner_display_name: owner?.owner_display_name ?? null,
      owner_contact_email: owner?.owner_contact_email ?? null,
      lot_entitlement: lotUE,
      total_entitlement: totalEntitlement,
      proportion,
      base_amount: lotPeriodTotal,
      items,
    };
  });

  return {
    data: {
      budget_id: budgetId,
      financial_year: budget.financial_year,
      fund_type: budget.fund_type,
      period_label: nextPeriod.label,
      period_start: nextPeriod.start,
      period_end: nextPeriod.end,
      due_date: nextPeriod.due_date,
      period_amount: periodAmount,
      total_entitlement: totalEntitlement,
      lots: previewLots,
      billing_cycle: subdivision.billing_cycle,
    },
  };
}

// ─── Create levy batch (generate levies) ───────────────────
//
// Atomicity approach (Prompt 1 — Option B orchestration):
//   1. Insert levy_batches row (status='draft').
//   2. Per lot: allocate reference number, insert levy_notices, insert
//      levy_notice_items.
//   3. Defensive parity check — if the loop produced fewer notices than lots
//      we were given, bail out with a CRITICAL audit entry. The batch row
//      is left in place (notices too) so an operator can inspect.
//   4. Call rpc_levy_batch_debit — FOR UPDATE lock on the batch row is
//      non-negotiable; writes one ledger debit per notice atomically;
//      flips batch status draft → ledger_written.
//      On failure, rollbackBatchInsert undoes the JS writes. If the
//      rollback itself is unclean, write a CRITICAL audit entry naming
//      the orphans and surface a loud error to the caller.
//   5. Generate PDFs in parallel and stamp pdf_url.
//
// Not using a single monolithic RPC because PDF generation + R2 uploads
// live in JS and would require base64-shuttling through SQL.
export async function createLevyBatch(
  subdivisionId: string,
  data: {
    budget_id: string;
    financial_year: string;
    fund_type: "administrative" | "capital_works";
    period_label: string;
    period_start: string;
    period_end: string;
    due_date: string;
    lots: {
      lot_id: string;
      amount: number;
      items: { description: string; amount: number; budget_item_id: string | null; is_adjustment: boolean }[];
    }[];
  },
): Promise<{ batchId?: string; error?: string }> {
  const profile = await requireCompanyRole();
  await requireSubdivisionAccess(subdivisionId);
  const supabase = createServerClient();

  const totalAmount = data.lots.reduce((sum, lot) => sum + lot.amount, 0);

  // Create batch
  const { data: batch, error: batchError } = await supabase
    .from("levy_batches")
    .insert({
      subdivision_id: subdivisionId,
      budget_id: data.budget_id,
      financial_year: data.financial_year,
      fund_type: data.fund_type,
      period_start: data.period_start,
      period_end: data.period_end,
      period_label: data.period_label,
      due_date: data.due_date,
      total_amount: totalAmount,
      levy_count: data.lots.length,
      status: "draft",
      generated_by: profile.id,
    })
    .select("id")
    .single();

  if (batchError) return { error: batchError.message };

  // Fetch subdivision + management company for PDF generation
  const { data: subdivision } = await supabase
    .from("subdivisions")
    .select("name, address, abn, plan_number, bank_bsb, bank_account_number, bank_account_name, management_company_id")
    .eq("id", subdivisionId)
    .single();

  let managementCompany = { name: "", logo_url: null as string | null };
  if (subdivision?.management_company_id) {
    const { data: mc } = await supabase
      .from("management_companies")
      .select("name, logo_url")
      .eq("id", subdivision.management_company_id)
      .single();
    if (mc) managementCompany = mc;
  }

  // Fetch lot details for PDF
  const lotIds = data.lots.map((l) => l.lot_id);
  const { data: lotsData } = await supabase
    .from("lots")
    .select("id, lot_number, unit_number")
    .in("id", lotIds);
  const lotMap = new Map((lotsData ?? []).map((l) => [l.id, l]));
  const ownerMap = await getLotOwners(supabase, lotIds);

  // Build payment instructions (EFT from subdivision, no BPAY if not configured)
  const hasEft = subdivision?.bank_bsb && subdivision?.bank_account_number;

  // Step 1: Create all levy notices in DB (sequential for reference numbers)
  const createdLevies: { id: string; lotId: string; refNum: string; items: typeof data.lots[0]["items"] }[] = [];

  for (const lot of data.lots) {
    const { data: refNum } = await supabase.rpc("next_reference_number", { prefix: "LEV" });
    if (!refNum) continue;

    const { data: levy, error: levyError } = await supabase
      .from("levy_notices")
      .insert({
        subdivision_id: subdivisionId,
        lot_id: lot.lot_id,
        budget_id: data.budget_id,
        batch_id: batch.id,
        reference_number: refNum,
        fund_type: data.fund_type,
        levy_type: "regular",
        period_start: data.period_start,
        period_end: data.period_end,
        amount: lot.amount,
        due_date: data.due_date,
        status: "draft",
      })
      .select("id")
      .single();

    if (levyError) { console.error("Failed to create levy:", levyError); continue; }

    const itemInserts = lot.items
      .filter((item) => item.amount !== 0)
      .map((item, i) => ({
        levy_notice_id: levy.id,
        description: item.description,
        amount: item.amount,
        is_adjustment: item.is_adjustment,
        budget_item_id: item.budget_item_id,
        sort_order: i,
      }));

    if (itemInserts.length > 0) {
      await supabase.from("levy_notice_items").insert(itemInserts);
    }

    createdLevies.push({ id: levy.id, lotId: lot.lot_id, refNum, items: lot.items });
  }

  // Defensive: every input lot must have produced a notice. If not, some
  // step silently failed — surface loudly before we write ledger debits.
  if (createdLevies.length !== data.lots.length) {
    await supabase.from("audit_log").insert({
      profile_id: profile.id,
      subdivision_id: subdivisionId,
      action: "levy_batch.notice_insert.partial",
      entity_type: "levy_batch",
      entity_id: batch.id,
      metadata: {
        severity: "critical",
        expected_lot_count: data.lots.length,
        actual_notice_count: createdLevies.length,
        message:
          "Per-lot notice insert loop produced fewer notices than lots supplied. Ledger debits not written. Batch left in draft for manual inspection.",
      },
    });
    return {
      error:
        `Levy batch partially inserted (${createdLevies.length}/${data.lots.length} notices). ` +
        `Ledger debits not written. Batch id ${batch.id} left in draft for manual review.`,
    };
  }

  // Step 1.5: Atomically write one ledger debit per notice.
  const { error: debitError } = await supabase.rpc("rpc_levy_batch_debit", {
    p_batch_id: batch.id,
    p_created_by: profile.id,
  });

  if (debitError) {
    const rollback = await rollbackBatchInsert(
      supabase,
      batch.id,
      createdLevies.map((l) => l.id),
    );
    if (!rollback.clean) {
      await supabase.from("audit_log").insert({
        profile_id: profile.id,
        subdivision_id: subdivisionId,
        action: "levy_batch.rollback.failed",
        entity_type: "levy_batch",
        entity_id: batch.id,
        metadata: {
          severity: "critical",
          debit_error: debitError.message,
          orphaned_batch_id: rollback.batchRemains ? batch.id : null,
          orphaned_notice_ids: rollback.orphanedNoticeIds,
          items_delete_failed: rollback.itemsDeleteFailed,
        },
      });
      return {
        error:
          `Ledger debit generation failed AND rollback left orphaned records. ` +
          `Contact support with batch id ${batch.id}. Reason: ${debitError.message}`,
      };
    }
    return { error: `Ledger debit generation failed: ${debitError.message}` };
  }

  // Step 2: Generate all PDFs in parallel and upload to R2
  const pdfPromises = createdLevies.map(async (levy) => {
    try {
      const lotInfo = lotMap.get(levy.lotId);
      const ownerInfo = ownerMap.get(levy.lotId);
      const pdfProps: LevyNoticeProps = {
        managementCompany,
        subdivision: {
          name: subdivision?.name ?? "",
          address: subdivision?.address ?? "",
          abn: subdivision?.abn ?? null,
          plan_number: subdivision?.plan_number ?? "",
        },
        documentTitle: "Levy Notice",
        referenceNumber: levy.refNum,
        date: new Date(),
        lotOwner: {
          name: ownerInfo?.owner_display_name ?? "Lot Owner",
          lot_number: `${lotInfo?.lot_number ?? ""}${lotInfo?.unit_number ? ` Unit ${lotInfo.unit_number}` : ""}`,
          address: subdivision?.address ?? "",
        },
        levyPeriod: { start: formatDateLong(data.period_start), end: formatDateLong(data.period_end) },
        lineItems: levy.items
          .filter((item) => item.amount !== 0)
          .map((item) => ({ description: item.description, amount: item.amount })),
        totalDue: levy.items.reduce((s, i) => s + i.amount, 0),
        dueDate: formatDateLong(data.due_date),
        paymentInstructions: {
          bpay: null,
          eft: hasEft ? {
            bsb: subdivision!.bank_bsb!,
            account_number: subdivision!.bank_account_number!,
            account_name: subdivision!.bank_account_name ?? subdivision!.name ?? "",
            reference: levy.refNum,
          } : { bsb: "", account_number: "", account_name: "", reference: levy.refNum },
        },
      };

      const pdfUrl = await generateAndUploadLevyPDF(pdfProps, subdivisionId, levy.refNum);
      await supabase.from("levy_notices").update({ pdf_url: pdfUrl }).eq("id", levy.id);
    } catch (err) {
      console.error("PDF generation failed for", levy.refNum, err);
    }
  });

  await Promise.all(pdfPromises);

  // Audit log
  await supabase.from("audit_log").insert({
    profile_id: profile.id,
    subdivision_id: subdivisionId,
    action: "create",
    entity_type: "levy_batch",
    entity_id: batch.id,
    after_state: {
      period_label: data.period_label,
      total_amount: totalAmount,
      levy_count: data.lots.length,
    },
  });

  revalidatePath(`/subdivisions/${subdivisionId}/finance`);

  return { batchId: batch.id };
}

// ─── Get levy batches for subdivision ──────────────────────

export async function getLevyBatches(subdivisionId: string): Promise<LevyBatchSummary[]> {
  await requireSubdivisionAccess(subdivisionId);
  const supabase = createServerClient();

  const { data } = await supabase
    .from("levy_batches")
    .select("*")
    .eq("subdivision_id", subdivisionId)
    .order("created_at", { ascending: false });

  return (data ?? []).map((b) => ({
    id: b.id,
    financial_year: b.financial_year,
    fund_type: b.fund_type,
    period_label: b.period_label,
    period_start: b.period_start,
    period_end: b.period_end,
    due_date: b.due_date,
    total_amount: Number(b.total_amount),
    levy_count: b.levy_count,
    status: b.status,
    created_at: b.created_at,
  }));
}

// ─── Get single batch with levy details ────────────────────

export async function getLevyBatchDetail(subdivisionId: string, batchId: string): Promise<LevyBatchDetail | null> {
  await requireSubdivisionAccess(subdivisionId);
  const supabase = createServerClient();

  const { data: batch } = await supabase
    .from("levy_batches")
    .select("*")
    .eq("id", batchId)
    .eq("subdivision_id", subdivisionId)
    .single();

  if (!batch) return null;

  const { data: levies } = await supabase
    .from("levy_notices")
    .select("id, lot_id, reference_number, amount, status, pdf_url, lots!inner(lot_number, unit_number)")
    .eq("batch_id", batchId)
    .order("lots(lot_number)");

  const levyIds = (levies ?? []).map((l) => l.id);
  const lotIds = (levies ?? []).map((l) => l.lot_id).filter(Boolean) as string[];
  const [{ data: allItems }, owners] = await Promise.all([
    levyIds.length > 0
      ? supabase.from("levy_notice_items").select("*").in("levy_notice_id", levyIds).order("sort_order")
      : Promise.resolve({ data: [] }),
    getLotOwners(supabase, lotIds),
  ]);

  return {
    id: batch.id,
    financial_year: batch.financial_year,
    fund_type: batch.fund_type,
    period_label: batch.period_label,
    period_start: batch.period_start,
    period_end: batch.period_end,
    due_date: batch.due_date,
    total_amount: Number(batch.total_amount),
    levy_count: batch.levy_count,
    status: batch.status,
    created_at: batch.created_at,
    levies: (levies ?? []).map((l) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const lot = (l as any).lots;
      const owner = owners.get(l.lot_id);
      return {
        id: l.id,
        lot_id: l.lot_id,
        lot_number: lot?.lot_number ?? 0,
        unit_number: lot?.unit_number ?? null,
        owner_display_name: owner?.owner_display_name ?? null,
        owner_contact_email: owner?.owner_contact_email ?? null,
        reference_number: l.reference_number,
        amount: Number(l.amount),
        status: l.status,
        pdf_url: l.pdf_url,
        items: (allItems ?? [])
          .filter((item) => item.levy_notice_id === l.id)
          .map((item) => ({
            description: item.description,
            amount: Number(item.amount),
            is_adjustment: item.is_adjustment,
          })),
      };
    }),
  };
}

// ─── Mark batch as sent ────────────────────────────────────

export async function markBatchSent(subdivisionId: string, batchId: string) {
  const profile = await requireCompanyRole();
  await requireSubdivisionAccess(subdivisionId);
  const supabase = createServerClient();

  // Update all draft levies to issued
  await supabase
    .from("levy_notices")
    .update({ status: "issued", issued_at: new Date().toISOString() })
    .eq("batch_id", batchId)
    .eq("status", "draft");

  // Update batch status
  await supabase
    .from("levy_batches")
    .update({ status: "sent", sent_at: new Date().toISOString() })
    .eq("id", batchId);

  await supabase.from("audit_log").insert({
    profile_id: profile.id,
    subdivision_id: subdivisionId,
    action: "send",
    entity_type: "levy_batch",
    entity_id: batchId,
  });

  revalidatePath(`/subdivisions/${subdivisionId}/finance`);

  return { success: true };
}

// ─── Mark individual levy as sent ──────────────────────────

export async function markLevySent(subdivisionId: string, levyId: string) {
  await requireCompanyRole();
  await requireSubdivisionAccess(subdivisionId);
  const supabase = createServerClient();

  await supabase
    .from("levy_notices")
    .update({ status: "issued", issued_at: new Date().toISOString() })
    .eq("id", levyId);

  // Check if all levies in batch are now issued
  const { data: levy } = await supabase
    .from("levy_notices")
    .select("batch_id")
    .eq("id", levyId)
    .single();

  if (levy?.batch_id) {
    const { data: remaining } = await supabase
      .from("levy_notices")
      .select("id")
      .eq("batch_id", levy.batch_id)
      .eq("status", "draft");

    if (!remaining || remaining.length === 0) {
      await supabase
        .from("levy_batches")
        .update({ status: "sent", sent_at: new Date().toISOString() })
        .eq("id", levy.batch_id);
    } else {
      await supabase
        .from("levy_batches")
        .update({ status: "partially_sent" })
        .eq("id", levy.batch_id);
    }
  }

  revalidatePath(`/subdivisions/${subdivisionId}/finance`);
  return { success: true };
}

// ─── Cancel batch ──────────────────────────────────────────

export async function cancelBatch(subdivisionId: string, batchId: string) {
  const profile = await requireCompanyRole();
  await requireSubdivisionAccess(subdivisionId);
  const supabase = createServerClient();

  // Only allow cancelling draft batches (not sent ones)
  const { data: batch } = await supabase
    .from("levy_batches")
    .select("status")
    .eq("id", batchId)
    .eq("subdivision_id", subdivisionId)
    .single();

  if (!batch) return { error: "Batch not found" };
  if (batch.status === "ledger_written" || batch.status === "sent" || batch.status === "partially_sent") {
    return {
      error:
        "Cannot cancel a batch once ledger debits have been written. " +
        "Use the void flow (per-notice) to reverse individual levies.",
    };
  }

  // Delete levy notice items first
  const { data: levies } = await supabase
    .from("levy_notices")
    .select("id")
    .eq("batch_id", batchId);

  const levyIds = (levies ?? []).map((l) => l.id);
  if (levyIds.length > 0) {
    await supabase.from("levy_notice_items").delete().in("levy_notice_id", levyIds);
  }

  // Delete levy notices
  await supabase.from("levy_notices").delete().eq("batch_id", batchId);

  // Delete batch
  await supabase.from("levy_batches").delete().eq("id", batchId);

  await supabase.from("audit_log").insert({
    profile_id: profile.id,
    subdivision_id: subdivisionId,
    action: "cancel",
    entity_type: "levy_batch",
    entity_id: batchId,
  });

  revalidatePath(`/subdivisions/${subdivisionId}/finance`);
  return { success: true };
}

// ─── Regenerate batch (new due date, new PDFs) ────────────

export async function regenerateBatch(subdivisionId: string, batchId: string, newDueDate: string) {
  const profile = await requireCompanyRole();
  await requireSubdivisionAccess(subdivisionId);
  const supabase = createServerClient();

  // Update batch due date
  await supabase
    .from("levy_batches")
    .update({ due_date: newDueDate, status: "draft" })
    .eq("id", batchId);

  // Update all levy notices with new due date and revert to draft
  await supabase
    .from("levy_notices")
    .update({ due_date: newDueDate, status: "draft", issued_at: null })
    .eq("batch_id", batchId);

  // Fetch data for PDF regeneration
  const { data: subdivision } = await supabase
    .from("subdivisions")
    .select("name, address, abn, plan_number, bank_bsb, bank_account_number, bank_account_name, management_company_id")
    .eq("id", subdivisionId)
    .single();

  let managementCompany = { name: "", logo_url: null as string | null };
  if (subdivision?.management_company_id) {
    const { data: mc } = await supabase
      .from("management_companies")
      .select("name, logo_url")
      .eq("id", subdivision.management_company_id)
      .single();
    if (mc) managementCompany = mc;
  }

  const hasEft = subdivision?.bank_bsb && subdivision?.bank_account_number;

  // Get levies with lot info and items
  const { data: levies } = await supabase
    .from("levy_notices")
    .select("id, reference_number, amount, period_start, period_end, lot_id, lots!inner(lot_number, unit_number)")
    .eq("batch_id", batchId);

  const regenLotIds = (levies ?? []).map((l) => l.lot_id).filter(Boolean) as string[];
  const regenOwners = await getLotOwners(supabase, regenLotIds);

  // Regenerate PDFs in parallel
  const pdfPromises = (levies ?? []).map(async (levy) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const lot = (levy as any).lots;
      const owner = regenOwners.get(levy.lot_id);
      const { data: items } = await supabase
        .from("levy_notice_items")
        .select("description, amount")
        .eq("levy_notice_id", levy.id)
        .order("sort_order");

      const pdfProps: LevyNoticeProps = {
        managementCompany,
        subdivision: {
          name: subdivision?.name ?? "",
          address: subdivision?.address ?? "",
          abn: subdivision?.abn ?? null,
          plan_number: subdivision?.plan_number ?? "",
        },
        documentTitle: "Levy Notice",
        referenceNumber: levy.reference_number,
        date: new Date(),
        lotOwner: {
          name: owner?.owner_display_name ?? "Lot Owner",
          lot_number: `${lot?.lot_number ?? ""}${lot?.unit_number ? ` Unit ${lot.unit_number}` : ""}`,
          address: subdivision?.address ?? "",
        },
        levyPeriod: { start: formatDateLong(levy.period_start), end: formatDateLong(levy.period_end) },
        lineItems: (items ?? []).map((i) => ({ description: i.description, amount: Number(i.amount) })),
        totalDue: Number(levy.amount),
        dueDate: formatDateLong(newDueDate),
        paymentInstructions: {
          bpay: null,
          eft: hasEft ? {
            bsb: subdivision!.bank_bsb!,
            account_number: subdivision!.bank_account_number!,
            account_name: subdivision!.bank_account_name ?? subdivision!.name ?? "",
            reference: levy.reference_number,
          } : { bsb: "", account_number: "", account_name: "", reference: levy.reference_number },
        },
      };

      const pdfUrl = await generateAndUploadLevyPDF(pdfProps, subdivisionId, levy.reference_number);
      await supabase.from("levy_notices").update({ pdf_url: pdfUrl }).eq("id", levy.id);
    } catch (err) {
      console.error("PDF regeneration failed for", levy.reference_number, err);
    }
  });

  await Promise.all(pdfPromises);

  await supabase.from("audit_log").insert({
    profile_id: profile.id,
    subdivision_id: subdivisionId,
    action: "regenerate",
    entity_type: "levy_batch",
    entity_id: batchId,
    after_state: { new_due_date: newDueDate },
  });

  revalidatePath(`/subdivisions/${subdivisionId}/finance`);
  return { success: true };
}

// ─── Recall batch (unsend — revert to draft) ──────────────

export async function recallBatch(subdivisionId: string, batchId: string) {
  const profile = await requireCompanyRole();
  await requireSubdivisionAccess(subdivisionId);
  const supabase = createServerClient();

  // Can't recall if any levy is already paid
  const { data: paidLevies } = await supabase
    .from("levy_notices")
    .select("id")
    .eq("batch_id", batchId)
    .eq("status", "paid");

  if (paidLevies && paidLevies.length > 0) {
    return { error: "Cannot recall — some levies have already been paid" };
  }

  // Revert all levies to draft
  await supabase
    .from("levy_notices")
    .update({ status: "draft", issued_at: null })
    .eq("batch_id", batchId);

  // Revert batch status
  await supabase
    .from("levy_batches")
    .update({ status: "draft", sent_at: null })
    .eq("id", batchId);

  await supabase.from("audit_log").insert({
    profile_id: profile.id,
    subdivision_id: subdivisionId,
    action: "recall",
    entity_type: "levy_batch",
    entity_id: batchId,
  });

  revalidatePath(`/subdivisions/${subdivisionId}/finance`);
  return { success: true };
}

// ─── Mark batch as paid ────────────────────────────────────

export async function markBatchPaid(subdivisionId: string, batchId: string) {
  const profile = await requireCompanyRole();
  await requireSubdivisionAccess(subdivisionId);
  const supabase = createServerClient();

  // Update all levies in batch to paid
  const now = new Date().toISOString();
  const { data: levies } = await supabase
    .from("levy_notices")
    .select("id, amount, reference_number")
    .eq("batch_id", batchId);

  // Guard: if ledger credits already fully cover any notice, warn (don't block).
  // The ledger + reconciliation flow is the source of truth from Prompt 1
  // onward; this legacy operator-only mark-paid should be rare.
  let coverageWarning: { covered: number; total: number; notice_ids: string[] } | null = null;
  if (levies && levies.length > 0) {
    const levyIds = levies.map((l) => l.id);
    const refNums = levies.map((l) => l.reference_number);
    const [{ data: creditsByNoticeId }, { data: creditsByRef }] = await Promise.all([
      supabase
        .from("lot_ledger_entries")
        .select("levy_notice_id, amount")
        .eq("entry_type", "credit")
        .eq("status", "active")
        .in("levy_notice_id", levyIds),
      supabase
        .from("lot_ledger_entries")
        .select("reference, amount")
        .eq("entry_type", "credit")
        .eq("status", "active")
        .in("reference", refNums),
    ]);
    const creditByNotice = new Map<string, number>();
    for (const c of creditsByNoticeId ?? []) {
      if (c.levy_notice_id) {
        creditByNotice.set(
          c.levy_notice_id,
          (creditByNotice.get(c.levy_notice_id) ?? 0) + Number(c.amount),
        );
      }
    }
    for (const c of creditsByRef ?? []) {
      const match = levies.find((l) => l.reference_number === c.reference);
      if (match) {
        creditByNotice.set(match.id, (creditByNotice.get(match.id) ?? 0) + Number(c.amount));
      }
    }
    const covered = levies.filter((l) => (creditByNotice.get(l.id) ?? 0) >= Number(l.amount));
    if (covered.length > 0) {
      coverageWarning = {
        covered: covered.length,
        total: levies.length,
        notice_ids: covered.map((l) => l.id),
      };
      console.warn(
        `[markBatchPaid] batch ${batchId}: ${covered.length}/${levies.length} notices already fully covered by active ledger credits. Proceeding anyway.`,
      );
    }
  }

  for (const levy of levies ?? []) {
    await supabase
      .from("levy_notices")
      .update({ status: "paid", amount_paid: levy.amount, paid_at: now })
      .eq("id", levy.id);
  }

  await supabase.from("audit_log").insert({
    profile_id: profile.id,
    subdivision_id: subdivisionId,
    action: "mark_paid",
    entity_type: "levy_batch",
    entity_id: batchId,
    metadata: coverageWarning
      ? {
          severity: "warning",
          warning_type: "ledger_coverage_warning",
          ledger_coverage: coverageWarning,
        }
      : null,
  });

  revalidatePath(`/subdivisions/${subdivisionId}/finance`);
  return { success: true };
}

// ─── Send batch emails ─────────────────────────────────────

export async function sendBatchEmails(subdivisionId: string, batchId: string) {
  const profile = await requireCompanyRole();
  await requireSubdivisionAccess(subdivisionId);
  const supabase = createServerClient();

  // Get batch info
  const { data: batch } = await supabase
    .from("levy_batches")
    .select("period_label")
    .eq("id", batchId)
    .single();

  // Get subdivision name
  const { data: subdivision } = await supabase
    .from("subdivisions")
    .select("name, bank_bsb, bank_account_number, bank_account_name, plan_number, address, abn, management_company_id")
    .eq("id", subdivisionId)
    .single();

  let managementCompany = { name: "", logo_url: null as string | null };
  if (subdivision?.management_company_id) {
    const { data: mc } = await supabase
      .from("management_companies")
      .select("name, logo_url")
      .eq("id", subdivision.management_company_id)
      .single();
    if (mc) managementCompany = mc;
  }

  // Get draft levies with lot info (owner resolved separately)
  const { data: levies } = await supabase
    .from("levy_notices")
    .select("id, reference_number, amount, due_date, period_start, period_end, pdf_url, lot_id, lots!inner(lot_number, unit_number)")
    .eq("batch_id", batchId)
    .eq("status", "draft");

  if (!levies || levies.length === 0) return { error: "No draft levies to send" };

  const sendLotIds = levies.map((l) => l.lot_id).filter(Boolean) as string[];
  const sendOwners = await getLotOwners(supabase, sendLotIds);

  const hasEft = subdivision?.bank_bsb && subdivision?.bank_account_number;

  let sentCount = 0;
  for (const levy of levies) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lot = (levy as any).lots;
    const owner = sendOwners.get(levy.lot_id);
    const email = owner?.owner_contact_email ?? null;

    if (!email) continue;

    try {
      // Generate PDF buffer for email attachment
      const pdfProps: LevyNoticeProps = {
        managementCompany,
        subdivision: {
          name: subdivision?.name ?? "",
          address: subdivision?.address ?? "",
          abn: subdivision?.abn ?? null,
          plan_number: subdivision?.plan_number ?? "",
        },
        documentTitle: "Levy Notice",
        referenceNumber: levy.reference_number,
        date: new Date(),
        lotOwner: {
          name: owner?.owner_display_name ?? "Lot Owner",
          lot_number: `${lot?.lot_number ?? ""}${lot?.unit_number ? ` Unit ${lot.unit_number}` : ""}`,
          address: subdivision?.address ?? "",
        },
        levyPeriod: { start: formatDateLong(levy.period_start), end: formatDateLong(levy.period_end) },
        lineItems: [], // We'll fetch items
        totalDue: Number(levy.amount),
        dueDate: formatDateLong(levy.due_date),
        paymentInstructions: {
          bpay: null,
          eft: hasEft ? {
            bsb: subdivision!.bank_bsb!,
            account_number: subdivision!.bank_account_number!,
            account_name: subdivision!.bank_account_name ?? subdivision!.name ?? "",
            reference: levy.reference_number,
          } : {
            bsb: "",
            account_number: "",
            account_name: "",
            reference: levy.reference_number,
          },
        },
      };

      // Fetch line items for this levy
      const { data: items } = await supabase
        .from("levy_notice_items")
        .select("description, amount")
        .eq("levy_notice_id", levy.id)
        .order("sort_order");

      pdfProps.lineItems = (items ?? []).map((i) => ({
        description: i.description,
        amount: Number(i.amount),
      }));

      const pdfBuffer = await generateLevyPDFBuffer(pdfProps);

      const formatCurrency = (n: number) =>
        new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n);

      await sendLevyEmail({
        to: email,
        ownerName: owner?.owner_display_name ?? null,
        subdivisionName: subdivision?.name ?? "",
        subdivisionAddress: subdivision?.address ?? "",
        companyLogoUrl: managementCompany.logo_url,
        referenceNumber: levy.reference_number,
        dueDate: formatDateLong(levy.due_date),
        totalAmount: formatCurrency(Number(levy.amount)),
        periodLabel: batch?.period_label ?? "",
        pdfBuffer,
        pdfFilename: `${levy.reference_number}.pdf`,
      });

      // Mark as issued
      await supabase
        .from("levy_notices")
        .update({ status: "issued", issued_at: new Date().toISOString() })
        .eq("id", levy.id);

      sentCount++;
    } catch (emailError) {
      console.error("Failed to send levy email for", levy.reference_number, emailError);
    }
  }

  // Update batch status
  const { data: remaining } = await supabase
    .from("levy_notices")
    .select("id")
    .eq("batch_id", batchId)
    .eq("status", "draft");

  const newStatus = (!remaining || remaining.length === 0) ? "sent" : "partially_sent";
  await supabase
    .from("levy_batches")
    .update({ status: newStatus, ...(newStatus === "sent" ? { sent_at: new Date().toISOString() } : {}) })
    .eq("id", batchId);

  await supabase.from("audit_log").insert({
    profile_id: profile.id,
    subdivision_id: subdivisionId,
    action: "send_emails",
    entity_type: "levy_batch",
    entity_id: batchId,
    after_state: { sent_count: sentCount },
  });

  // Notify lot owners
  if (sentCount > 0) {
    await notifySubdivisionLotOwners({
      subdivisionId,
      type: "levy_issued",
      title: "New levy notice",
      message: `A levy notice for ${batch?.period_label ?? "this period"} has been issued. Check your levies for details.`,
      link: `/subdivisions/${subdivisionId}/my-levies`,
    });
  }

  revalidatePath(`/subdivisions/${subdivisionId}/finance`);

  return { success: true, sentCount };
}

// ─── Resend batch emails (for already-sent batches) ────────

export async function resendBatchEmails(subdivisionId: string, batchId: string) {
  const profile = await requireCompanyRole();
  await requireSubdivisionAccess(subdivisionId);
  const supabase = createServerClient();

  const { data: batch } = await supabase
    .from("levy_batches")
    .select("period_label")
    .eq("id", batchId)
    .single();

  const { data: subdivision } = await supabase
    .from("subdivisions")
    .select("name, bank_bsb, bank_account_number, bank_account_name, plan_number, address, abn, management_company_id")
    .eq("id", subdivisionId)
    .single();

  let managementCompany = { name: "", logo_url: null as string | null };
  if (subdivision?.management_company_id) {
    const { data: mc } = await supabase
      .from("management_companies")
      .select("name, logo_url")
      .eq("id", subdivision.management_company_id)
      .single();
    if (mc) managementCompany = mc;
  }

  // Get ALL levies (not just drafts)
  const { data: levies } = await supabase
    .from("levy_notices")
    .select("id, reference_number, amount, due_date, period_start, period_end, pdf_url, lot_id, lots!inner(lot_number, unit_number)")
    .eq("batch_id", batchId);

  if (!levies || levies.length === 0) return { error: "No levies to resend" };

  const resendLotIds = levies.map((l) => l.lot_id).filter(Boolean) as string[];
  const resendOwners = await getLotOwners(supabase, resendLotIds);

  const hasEft = subdivision?.bank_bsb && subdivision?.bank_account_number;
  let sentCount = 0;

  for (const levy of levies) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lot = (levy as any).lots;
    const owner = resendOwners.get(levy.lot_id);
    const email = owner?.owner_contact_email ?? null;
    if (!email) continue;

    try {
      const pdfProps: LevyNoticeProps = {
        managementCompany,
        subdivision: {
          name: subdivision?.name ?? "",
          address: subdivision?.address ?? "",
          abn: subdivision?.abn ?? null,
          plan_number: subdivision?.plan_number ?? "",
        },
        documentTitle: "Levy Notice",
        referenceNumber: levy.reference_number,
        date: new Date(),
        lotOwner: {
          name: owner?.owner_display_name ?? "Lot Owner",
          lot_number: `${lot?.lot_number ?? ""}${lot?.unit_number ? ` Unit ${lot.unit_number}` : ""}`,
          address: subdivision?.address ?? "",
        },
        levyPeriod: { start: formatDateLong(levy.period_start), end: formatDateLong(levy.period_end) },
        lineItems: [],
        totalDue: Number(levy.amount),
        dueDate: formatDateLong(levy.due_date),
        paymentInstructions: {
          bpay: null,
          eft: hasEft ? {
            bsb: subdivision!.bank_bsb!,
            account_number: subdivision!.bank_account_number!,
            account_name: subdivision!.bank_account_name ?? subdivision!.name ?? "",
            reference: levy.reference_number,
          } : { bsb: "", account_number: "", account_name: "", reference: levy.reference_number },
        },
      };

      const { data: items } = await supabase
        .from("levy_notice_items")
        .select("description, amount")
        .eq("levy_notice_id", levy.id)
        .order("sort_order");

      pdfProps.lineItems = (items ?? []).map((i) => ({ description: i.description, amount: Number(i.amount) }));

      const pdfBuffer = await generateLevyPDFBuffer(pdfProps);

      const formatCurrency = (n: number) =>
        new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n);

      await sendLevyEmail({
        to: email,
        ownerName: owner?.owner_display_name ?? null,
        subdivisionName: subdivision?.name ?? "",
        subdivisionAddress: subdivision?.address ?? "",
        companyLogoUrl: managementCompany.logo_url,
        referenceNumber: levy.reference_number,
        dueDate: formatDateLong(levy.due_date),
        totalAmount: formatCurrency(Number(levy.amount)),
        periodLabel: batch?.period_label ?? "",
        pdfBuffer,
        pdfFilename: `${levy.reference_number}.pdf`,
      });

      sentCount++;
    } catch (err) {
      console.error("Failed to resend levy email for", levy.reference_number, err);
    }
  }

  await supabase.from("audit_log").insert({
    profile_id: profile.id,
    subdivision_id: subdivisionId,
    action: "resend_emails",
    entity_type: "levy_batch",
    entity_id: batchId,
    after_state: { sent_count: sentCount },
  });

  revalidatePath(`/subdivisions/${subdivisionId}/finance`);
  return { success: true, sentCount };
}
