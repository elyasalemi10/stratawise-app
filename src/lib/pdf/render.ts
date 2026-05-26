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
    // Cached path , fetch from R2 to satisfy the buffer contract.
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
    props._ocId,
    props.referenceNumber,
  );
  await supabase
    .from("levy_notices")
    .update({
      pdf_url: publicUrl,
      pdf_generated_at: new Date().toISOString(),
    })
    .eq("id", levyId);

  // Re-render once more to return a buffer , alternative would be to
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
  _ocId: string; // used only for the R2 key prefix
}

async function assembleLevyNoticeProps(
  supabase: SupabaseClient,
  levyId: string,
): Promise<AssembledLevyProps> {
  const { data: levyData, error: levyErr } = await supabase
    .from("levy_notices")
    .select(
      "id, reference_number, amount, due_date, period_start, period_end, lot_id, oc_id",
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
    oc_id: string;
  };

  const [
    { data: subRow },
    { data: lotRow },
    { data: itemsRow },
    { data: memberRow },
    { data: drnRow },
    { data: ownerRefRow },
  ] = await Promise.all([
    supabase
      .from("owners_corporations")
      .select(
        "id, name, address, abn, plan_number, management_company_id, bank_bsb, bank_account_number, bank_account_name, include_arrears_on_notice",
      )
      .eq("id", levy.oc_id)
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
      .from("oc_members")
      .select("profile_id, profiles!inner(first_name, last_name)")
      .eq("oc_id", levy.oc_id)
      .eq("lot_id", levy.lot_id)
      .eq("role", "lot_owner")
      .eq("is_primary_contact", true)
      .maybeSingle(),
    // DRN active on the levy's PERIOD_START , Macquarie issues one DRN per
    // lot but they can be reassigned on owner change; using the period_start
    // as the cutoff keeps the historical notice tied to the DRN that was
    // current when the levy was raised. Null when the OC isn't on Macquarie
    // DEFT yet , callers fall back to the LEV-NNNN reference.
    supabase
      .from("lot_drns")
      .select("drn")
      .eq("lot_id", levy.lot_id)
      .lte("active_from", levy.period_start)
      .or(`active_to.is.null,active_to.gte.${levy.period_start}`)
      .order("active_from", { ascending: false })
      .limit(1)
      .maybeSingle(),
    // Owner-reference fallback when no DRN is active. payment_reference
    // is generated on OC creation ("WHDPE-001" = first-5-of-short_code
    // + lot-number-padded-3) and is what the lot owner sees as their
    // permanent billing reference.
    supabase
      .from("lot_owners")
      .select("payment_reference")
      .eq("lot_id", levy.lot_id)
      .not("payment_reference", "is", null)
      .limit(1)
      .maybeSingle(),
  ]);
  const activeDrn = (drnRow as { drn: string } | null)?.drn ?? null;
  const ownerPaymentRef = (ownerRefRow as { payment_reference: string | null } | null)?.payment_reference ?? null;

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
    include_arrears_on_notice: boolean | null;
  } | null;
  if (!sub) {
    throw new Error(`assembleLevyNoticeProps: oc missing for levy ${levyId}`);
  }
  const lot = lotRow as { lot_number: number; unit_number: string | null } | null;

  // Reference cascade: DRN > owner payment_reference > "Lot N" label.
  // Internal LEV-NNNN is never surfaced to the owner (it's our DB
  // sequence, not theirs).
  const displayRef = activeDrn ?? ownerPaymentRef ?? `Lot ${lot?.lot_number ?? ""}`.trim();

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

  // Arrears summary , only computed when the OC opts in. Sums the
  // outstanding (amount minus amount_paid) for every PRIOR levy notice
  // on this lot whose period started before this one's period_start.
  // "As of" date = most recent bank_transactions.imported_at so the
  // owner knows how fresh the balance is.
  let priorArrears: { amount: number; asOf: string } | null = null;
  if (sub.include_arrears_on_notice) {
    const [{ data: priorRows }, { data: lastImport }] = await Promise.all([
      supabase
        .from("levy_notices")
        .select("amount, amount_paid")
        .eq("lot_id", levy.lot_id)
        .lt("period_start", levy.period_start)
        .in("status", ["issued", "partially_paid", "overdue"]),
      supabase
        .from("bank_transactions")
        .select("imported_at")
        .eq("oc_id", levy.oc_id)
        .order("imported_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    const outstanding = (priorRows ?? []).reduce((sum, r) => {
      return sum + Math.max(0, Number(r.amount ?? 0) - Number(r.amount_paid ?? 0));
    }, 0);
    if (outstanding > 0) {
      const importedAt = (lastImport as { imported_at: string } | null)?.imported_at;
      priorArrears = {
        amount: Math.round(outstanding * 100) / 100,
        asOf: importedAt ? formatDateLong(importedAt.slice(0, 10)) : "today",
      };
    }
  }

  const props: AssembledLevyProps = {
    _ocId: sub.id,
    managementCompany,
    oc: {
      name: sub.name,
      address: sub.address,
      abn: sub.abn,
      plan_number: sub.plan_number,
    },
    documentTitle: "Levy Notice",
    // Prefer the active DRN as the user-facing reference , owners pay via
    // BPAY/EFT using their DRN, so the PDF should print the same number
    // Macquarie reconciles against. Falls back to the LEV-NNNN sequence
    // when the OC isn't on DEFT yet.
    referenceNumber: displayRef,
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
            // EFT reference must match Macquarie's reconciliation key (the
            // DRN) when one exists, otherwise the LEV-NNNN sequence.
            reference: displayRef,
          }
        : {
            bsb: "",
            account_number: "",
            account_name: "",
            reference: displayRef,
          },
    },
    priorArrears,
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
