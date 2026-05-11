// ============================================================================
// Idempotent levy-notice PDF render + cache helper (PP7-A).
// ----------------------------------------------------------------------------
// Reads/writes the levy_notices.pdf_url + pdf_generated_at sentinels.
// pdf_url stores the full public R2 CDN URL (consistent with the legacy
// generateAndUploadLevyPDF shape and management_companies.logo_url).
//
// Entry points:
//   - renderLevyNoticePdf(levyId, supabase, opts?): always renders fresh,
//     uploads to R2, stamps DB sentinels, returns the buffer.
//   - getLevyNoticePdfBuffer(levyId, supabase): cache-first; fetches from
//     R2 when pdf_url is populated; falls back to renderLevyNoticePdf when
//     pdf_url is null OR the R2 fetch fails (logs a warning).
//
// Escalation senders (overdue / second-reminder / final-notice) use
// getLevyNoticePdfBuffer to attach the PDF. Levy batch issuance at
// src/lib/actions/levy.ts continues to render in-line for now; future
// cleanup can route those call sites through this wrapper.
// ============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import type { LevyNoticeProps } from "@/lib/pdf/types";
import { generateAndUploadLevyPDF, generateLevyPDFBuffer } from "@/lib/levy-pdf";
import { fetchObject, keyFromPublicUrl } from "@/lib/storage/r2";

interface RenderOptions {
  force?: boolean; // bypass the pdf_url cache check
}

export async function renderLevyNoticePdf(
  levyId: string,
  supabase: SupabaseClient,
  opts: RenderOptions = {},
): Promise<Buffer> {
  // Read existing pdf_url first (so force=false can short-circuit without
  // re-rendering).
  const { data: levyRow } = await supabase
    .from("levy_notices")
    .select("id, pdf_url")
    .eq("id", levyId)
    .single();
  const existingPdfUrl = (levyRow as { pdf_url: string | null } | null)?.pdf_url ?? null;

  if (!opts.force && existingPdfUrl) {
    // Cached path — fetch from R2 to satisfy the buffer contract.
    const key = keyFromPublicUrl(existingPdfUrl);
    if (key) {
      try {
        return await fetchObject(key);
      } catch (err) {
        console.warn(
          `renderLevyNoticePdf: pdf_url present but R2 fetch failed for levy ${levyId}, regenerating`,
          err instanceof Error ? err.message : err,
        );
        // Fall through to fresh render.
      }
    }
  }

  // Fresh render path: assemble props, upload to R2, stamp DB.
  const props = await assembleLevyNoticeProps(supabase, levyId);
  const publicUrl = await generateAndUploadLevyPDF(
    props,
    props._subdivisionId,
    props.referenceNumber,
  );
  await supabase
    .from("levy_notices")
    .update({
      pdf_url: publicUrl,
      pdf_generated_at: new Date().toISOString(),
    })
    .eq("id", levyId);

  // Re-render once more to return a buffer — alternative would be to
  // capture the buffer from generateAndUploadLevyPDF (which discards it).
  // Cheaper to render twice here than to rev the lib signature for this
  // single PP7-A consumer; revisit if cron throughput demands.
  return generateLevyPDFBuffer(props);
}

export async function getLevyNoticePdfBuffer(
  levyId: string,
  supabase: SupabaseClient,
): Promise<Buffer | null> {
  try {
    return await renderLevyNoticePdf(levyId, supabase);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(
      `getLevyNoticePdfBuffer: render failed for levy ${levyId}; sender will fall back to body-only email:`,
      msg,
    );
    return null;
  }
}

// ─── Internal: props assembly ──────────────────────────────────────────
// Mirrors the assembly inline in src/lib/actions/levy.ts:1218-1267.
// Extracted here so escalation senders + future call sites share one path.

interface AssembledLevyProps extends LevyNoticeProps {
  _subdivisionId: string; // used only for the R2 key prefix
}

async function assembleLevyNoticeProps(
  supabase: SupabaseClient,
  levyId: string,
): Promise<AssembledLevyProps> {
  const { data: levyData, error: levyErr } = await supabase
    .from("levy_notices")
    .select(
      "id, reference_number, amount, due_date, period_start, period_end, lot_id, subdivision_id",
    )
    .eq("id", levyId)
    .single();
  if (levyErr || !levyData) {
    throw new Error(
      `assembleLevyNoticeProps: levy_notices ${levyId} not found: ${levyErr?.message}`,
    );
  }
  const levy = levyData as {
    id: string;
    reference_number: string;
    amount: number | string;
    due_date: string;
    period_start: string;
    period_end: string;
    lot_id: string;
    subdivision_id: string;
  };

  const [
    { data: subRow },
    { data: lotRow },
    { data: itemsRow },
    { data: memberRow },
  ] = await Promise.all([
    supabase
      .from("subdivisions")
      .select(
        "id, name, address, abn, plan_number, management_company_id, bank_bsb, bank_account_number, bank_account_name",
      )
      .eq("id", levy.subdivision_id)
      .single(),
    supabase
      .from("lots")
      .select("lot_number, unit_number")
      .eq("id", levy.lot_id)
      .single(),
    supabase
      .from("levy_notice_items")
      .select("description, amount")
      .eq("levy_notice_id", levy.id)
      .order("sort_order"),
    supabase
      .from("subdivision_members")
      .select("profile_id, profiles!inner(first_name, last_name)")
      .eq("subdivision_id", levy.subdivision_id)
      .eq("lot_id", levy.lot_id)
      .eq("role", "lot_owner")
      .eq("is_primary_contact", true)
      .maybeSingle(),
  ]);

  const sub = subRow as {
    id: string;
    name: string;
    address: string;
    abn: string | null;
    plan_number: string;
    management_company_id: string;
    bank_bsb: string | null;
    bank_account_number: string | null;
    bank_account_name: string | null;
  } | null;
  if (!sub) {
    throw new Error(`assembleLevyNoticeProps: subdivision missing for levy ${levyId}`);
  }
  const lot = lotRow as { lot_number: number; unit_number: string | null } | null;

  // Management company name + logo for the header.
  const { data: mcRow } = await supabase
    .from("management_companies")
    .select("name, logo_url")
    .eq("id", sub.management_company_id)
    .single();
  const managementCompany = (mcRow as { name: string; logo_url: string | null } | null) ?? {
    name: "",
    logo_url: null,
  };

  // Owner display name.
  let ownerName = "Lot Owner";
  if (memberRow) {
    const rel = (memberRow as {
      profiles: { first_name: string | null; last_name: string | null } | { first_name: string | null; last_name: string | null }[] | null;
    }).profiles;
    const flat = Array.isArray(rel) ? rel[0] : rel;
    if (flat) {
      const f = flat.first_name?.trim() ?? "";
      const l = flat.last_name?.trim() ?? "";
      const full = `${f} ${l}`.trim();
      if (full.length > 0) ownerName = full;
    }
  }

  const lotLabel = lot
    ? `${lot.lot_number ?? ""}${lot.unit_number ? ` Unit ${lot.unit_number}` : ""}`
    : "";

  const hasEft = Boolean(sub.bank_bsb && sub.bank_account_number);
  const items = (itemsRow ?? []) as Array<{ description: string; amount: number | string }>;

  const props: AssembledLevyProps = {
    _subdivisionId: sub.id,
    managementCompany,
    subdivision: {
      name: sub.name,
      address: sub.address,
      abn: sub.abn,
      plan_number: sub.plan_number,
    },
    documentTitle: "Levy Notice",
    referenceNumber: levy.reference_number,
    date: new Date(),
    lotOwner: {
      name: ownerName,
      lot_number: lotLabel,
      address: sub.address,
    },
    levyPeriod: {
      start: formatDateLong(levy.period_start),
      end: formatDateLong(levy.period_end),
    },
    lineItems: items.map((i) => ({
      description: i.description,
      amount: Number(i.amount),
    })),
    totalDue: Number(levy.amount),
    dueDate: formatDateLong(levy.due_date),
    paymentInstructions: {
      bpay: null,
      eft: hasEft
        ? {
            bsb: sub.bank_bsb!,
            account_number: sub.bank_account_number!,
            account_name: sub.bank_account_name ?? sub.name,
            reference: levy.reference_number,
          }
        : {
            bsb: "",
            account_number: "",
            account_name: "",
            reference: levy.reference_number,
          },
    },
  };

  return props;
}

function formatDateLong(iso: string): string {
  const d = new Date(iso + (iso.length === 10 ? "T00:00:00Z" : ""));
  return d.toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}
