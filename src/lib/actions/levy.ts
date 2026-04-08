"use server";

import { requireRole, requireSubdivisionAccess } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";
import { revalidatePath } from "next/cache";
import { generateAndUploadLevyPDF, generateLevyPDFBuffer } from "@/lib/levy-pdf";
import { sendLevyEmail } from "@/lib/email";
import { formatDateLong } from "@/lib/utils";
import type { LevyNoticeProps } from "@/lib/pdf/types";

// ─── Types ─────────────────────────────────────────────────

export interface LevyPreviewLot {
  lot_id: string;
  lot_number: number;
  unit_number: string | null;
  owner_name: string | null;
  owner_email: string | null;
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
  status: "draft" | "sent" | "partially_sent";
  created_at: string;
}

export interface LevyBatchDetail extends LevyBatchSummary {
  levies: {
    id: string;
    lot_id: string;
    lot_number: number;
    unit_number: string | null;
    owner_name: string | null;
    owner_email: string | null;
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

// ─── Generate levy preview ─────────────────────────────────

export async function generateLevyPreview(
  subdivisionId: string,
  budgetId: string,
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

  // Get next period
  const nextPeriod = await getNextPeriod(subdivisionId, budgetId);
  if (!nextPeriod) return { error: "All periods for this financial year have been generated" };

  // Get lots
  const { data: lots } = await supabase
    .from("lots")
    .select("id, lot_number, unit_number, owner_name, owner_email, lot_entitlement, lot_liability")
    .eq("subdivision_id", subdivisionId)
    .order("lot_number");

  if (!lots || lots.length === 0) return { error: "No lots found in this subdivision" };

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

    return {
      lot_id: lot.id,
      lot_number: lot.lot_number,
      unit_number: lot.unit_number,
      owner_name: lot.owner_name,
      owner_email: lot.owner_email,
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
  const profile = await requireRole(["strata_manager", "super_admin"]);
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
    .select("id, lot_number, unit_number, owner_name, owner_email")
    .in("id", lotIds);
  const lotMap = new Map((lotsData ?? []).map((l) => [l.id, l]));

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

  // Step 2: Generate all PDFs in parallel and upload to R2
  const pdfPromises = createdLevies.map(async (levy) => {
    try {
      const lotInfo = lotMap.get(levy.lotId);
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
          name: lotInfo?.owner_name ?? "Lot Owner",
          lot_number: String(lotInfo?.lot_number ?? ""),
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
    .select("id, lot_id, reference_number, amount, status, pdf_url, lots!inner(lot_number, unit_number, owner_name, owner_email)")
    .eq("batch_id", batchId)
    .order("lots(lot_number)");

  const levyIds = (levies ?? []).map((l) => l.id);
  const { data: allItems } = levyIds.length > 0
    ? await supabase.from("levy_notice_items").select("*").in("levy_notice_id", levyIds).order("sort_order")
    : { data: [] };

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
      return {
        id: l.id,
        lot_id: l.lot_id,
        lot_number: lot?.lot_number ?? 0,
        unit_number: lot?.unit_number ?? null,
        owner_name: lot?.owner_name ?? null,
        owner_email: lot?.owner_email ?? null,
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
  const profile = await requireRole(["strata_manager", "super_admin"]);
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
  await requireRole(["strata_manager", "super_admin"]);
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

// ─── Send batch emails ─────────────────────────────────────

export async function sendBatchEmails(subdivisionId: string, batchId: string) {
  const profile = await requireRole(["strata_manager", "super_admin"]);
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

  // Get draft levies with lot owner info
  const { data: levies } = await supabase
    .from("levy_notices")
    .select("id, reference_number, amount, due_date, period_start, period_end, pdf_url, lots!inner(lot_number, owner_name, owner_email)")
    .eq("batch_id", batchId)
    .eq("status", "draft");

  if (!levies || levies.length === 0) return { error: "No draft levies to send" };

  const hasEft = subdivision?.bank_bsb && subdivision?.bank_account_number;

  let sentCount = 0;
  for (const levy of levies) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lot = (levy as any).lots;
    const email = lot?.owner_email;

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
          name: lot?.owner_name ?? "Lot Owner",
          lot_number: String(lot?.lot_number ?? ""),
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
        ownerName: lot?.owner_name ?? null,
        subdivisionName: subdivision?.name ?? "",
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

  revalidatePath(`/subdivisions/${subdivisionId}/finance`);

  return { success: true, sentCount };
}
