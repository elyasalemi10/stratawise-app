"use server";

import { revalidatePath } from "next/cache";
import { requireCompanyRole } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";
import { insertOCWithCode } from "@/lib/oc-code";
import { parsePlanPdf, type ParsedPlan } from "@/lib/parse-plan";
import { uploadObject, fetchObject, deleteObject } from "@/lib/storage/r2";

// ─── Types stored on draft_json ─────────────────────────────────
//
// The wizard's editable state. Persisted on every page transition so the user
// can refresh / come back later. Promoted to real rows on completion.

export type DraftLot = {
  lot_number: number;
  unit_entitlement: number;
  lot_liability: number;
  owner_name?: string;
  owner_email?: string;
  owner_phone?: string;
  owner_postal_address?: string;
  is_occupied_by_owner?: boolean;
  tenant_name?: string;
  tenant_email?: string;
  tenant_phone?: string;
  /** Opening arrears as at setup date. Positive = arrears, negative = credit. */
  opening_balance?: number;
};

export type DraftJson = {
  // Page 2 (review)
  plan_number?: string;
  oc_number?: number;
  oc_name?: string;
  address?: string;
  street_number?: string;
  street_name?: string;
  suburb?: string;
  state?: string;
  postcode?: string;
  total_lots?: number;
  lots?: DraftLot[];
  // Page 3 (basics)
  trading_name?: string;
  services_only?: boolean;
  financial_year_start_month?: number;       // 1–12
  notice_address_same_as_oc?: boolean;
  notice_address?: string;
  common_seal?: boolean;
  common_seal_text?: string;
  // Page 5 (trust accounts)
  bank_provider?: "macquarie_deft" | "other_csv";
  uses_shared_trust_account?: boolean;
  // Shared mode: single set of fields. Separate mode: admin_* + capital_*.
  bank_name?: string;
  account_name?: string;
  bsb?: string;
  account_number?: string;
  // Used when uses_shared_trust_account === false
  capital_bank_name?: string;
  capital_account_name?: string;
  capital_bsb?: string;
  capital_account_number?: string;
  // Page 6 (opening balances)
  opening_balance_date?: string;                 // ISO yyyy-mm-dd
  opening_admin_balance?: number;
  opening_capital_works_balance?: number;
  // Tier 1/2 mandatory; optional toggle for higher tiers.
  has_maintenance_plan_fund?: boolean;
  opening_maintenance_plan_balance?: number;
};

// ─── Helpers ────────────────────────────────────────────────────

async function loadDraft(draftId: string) {
  const profile = await requireCompanyRole();
  if (!profile.management_company_id) throw new Error("No management company assigned");
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("oc_drafts")
    .select("*")
    .eq("id", draftId)
    .eq("management_company_id", profile.management_company_id)
    .single();
  if (error || !data) throw new Error("Draft not found");
  return { draft: data, profile };
}

// ─── createDraft: row + return id ───────────────────────────────

export async function createDraft(): Promise<{ draftId?: string; error?: string }> {
  try {
    const profile = await requireCompanyRole();
    if (!profile.management_company_id) {
      return { error: "No management company assigned" };
    }
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("oc_drafts")
      .insert({
        management_company_id: profile.management_company_id,
        created_by: profile.id,
      })
      .select("id")
      .single();
    if (error || !data) {
      console.error("createDraft error:", error);
      return { error: "Failed to start the wizard" };
    }
    return { draftId: data.id };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Unexpected error" };
  }
}

// ─── getDraft (for hydrating the wizard) ────────────────────────

export async function getDraft(draftId: string) {
  try {
    const { draft } = await loadDraft(draftId);
    return { draft };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to load draft" };
  }
}

// ─── savePlanUpload: persist storage key + file meta, mark pending ──

export async function savePlanUpload(
  draftId: string,
  meta: { storage_key: string; filename: string; size_bytes: number },
) {
  try {
    const { draft } = await loadDraft(draftId);
    const supabase = createServerClient();
    const { error } = await supabase
      .from("oc_drafts")
      .update({
        plan_storage_key: meta.storage_key,
        plan_filename: meta.filename,
        plan_size_bytes: meta.size_bytes,
        parse_status: "pending",
        parse_started_at: new Date().toISOString(),
        parse_error: null,
      })
      .eq("id", draft.id);
    if (error) return { error: error.message };
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Unexpected error" };
  }
}

// ─── uploadPlan: receive FormData with the PDF, push to R2 ──
//
// Server-action multipart upload. next.config.ts bumps the body-size limit to
// 50MB. Client calls this with FormData containing a single `file` field.
// Object goes to R2 under `plans/{draftId}/original.pdf`.

export async function uploadPlan(draftId: string, formData: FormData) {
  try {
    const { draft } = await loadDraft(draftId);
    const file = formData.get("file");
    if (!(file instanceof File)) return { error: "No file uploaded" };
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      return { error: "Only PDF files are accepted" };
    }
    if (file.size > 50 * 1024 * 1024) return { error: "File exceeds 50MB" };

    const key = `plans/${draft.id}/original.pdf`;
    const buf = Buffer.from(await file.arrayBuffer());

    try {
      await uploadObject(key, buf, "application/pdf");
    } catch (err) {
      console.error("uploadPlan: R2 upload failed", err);
      return { error: "Couldn't save your file — please try again." };
    }

    const supabase = createServerClient();
    const { error: dbErr } = await supabase
      .from("oc_drafts")
      .update({
        plan_storage_key: key,
        plan_filename: file.name,
        plan_size_bytes: file.size,
        parse_status: "pending",
        parse_started_at: new Date().toISOString(),
        parse_error: null,
      })
      .eq("id", draft.id);
    if (dbErr) {
      console.error("uploadPlan: DB update failed", dbErr);
      return { error: "Couldn't save your file — please try again." };
    }
    return { success: true };
  } catch (err) {
    console.error("uploadPlan: unexpected error", err);
    return { error: "Something went wrong — please try again." };
  }
}

// ─── parseDraftWithGemini: blocking call, ~10-30s ───────────────

export async function parseDraftWithGemini(draftId: string) {
  try {
    const { draft } = await loadDraft(draftId);
    if (!draft.plan_storage_key) return { error: "No plan uploaded" };

    const supabase = createServerClient();

    let buf: Buffer;
    try {
      buf = await fetchObject(draft.plan_storage_key);
    } catch (err) {
      console.error("parseDraftWithGemini: R2 fetch failed", err);
      await supabase.from("oc_drafts").update({
        parse_status: "failed",
        parse_error: "Storage read failed",
      }).eq("id", draft.id);
      return { error: "We couldn't read the uploaded plan." };
    }

    let parsed: ParsedPlan;
    try {
      parsed = await parsePlanPdf(buf);
    } catch (err) {
      console.error("parseDraftWithGemini: parser failed", err);
      await supabase.from("oc_drafts").update({
        parse_status: "failed",
        parse_completed_at: new Date().toISOString(),
        parse_error: err instanceof Error ? err.message : "Parser failed",
      }).eq("id", draft.id);
      return { error: "Couldn't read this PDF automatically." };
    }

    // Document-type gate: Gemini saw the PDF and decided it's not a Plan of
    // Subdivision. Surface a clear message and don't pollute draft_json with
    // a hallucinated lot schedule.
    if (!parsed.is_plan_of_subdivision) {
      await supabase.from("oc_drafts").update({
        parse_status: "failed",
        parse_completed_at: new Date().toISOString(),
        parse_error: `Not a Plan of Subdivision (looks like: ${parsed.document_type_guess || "unknown document"})`,
      }).eq("id", draft.id);
      return {
        error: `That didn't look like a Plan of Subdivision (looks like: ${parsed.document_type_guess || "another document type"}). Upload a different PDF, or skip this step and enter details manually.`,
      };
    }

    // Default to the first detected OC and seed draft_json so page 2 has
    // something to render even if the user never edits.
    const first = parsed.detected_ocs[0];
    const draftJson: DraftJson = {
      plan_number: parsed.plan_of_subdivision_number ?? undefined,
      oc_number: first?.oc_number ?? 1,
      oc_name: first?.oc_name ?? undefined,
      address: first?.address ?? undefined,
      street_number: first?.street_number ?? undefined,
      street_name: first?.street_name ?? undefined,
      suburb: first?.suburb ?? undefined,
      state: first?.state ?? "VIC",
      postcode: first?.postcode ?? undefined,
      total_lots: first?.lot_count ?? first?.lots.length ?? 0,
      lots: (first?.lots ?? []).map((l) => ({
        lot_number: l.lot_number,
        unit_entitlement: l.unit_entitlement,
        lot_liability: l.lot_liability,
      })),
    };

    const { error } = await supabase
      .from("oc_drafts")
      .update({
        parsed_json: parsed as unknown as Record<string, unknown>,
        draft_json: draftJson as unknown as Record<string, unknown>,
        parse_status: "complete",
        parse_completed_at: new Date().toISOString(),
        parse_error: null,
      })
      .eq("id", draft.id);
    if (error) return { error: error.message };
    return { success: true, ocCount: parsed.detected_ocs.length, lotCount: first?.lots.length ?? 0 };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Unexpected error" };
  }
}

// ─── skipParsing: user opted to enter manually ──────────────────

export async function skipParsing(draftId: string) {
  try {
    await loadDraft(draftId);
    const supabase = createServerClient();
    const { error } = await supabase
      .from("oc_drafts")
      .update({ parse_status: "skipped", current_step: 3 })
      .eq("id", draftId);
    if (error) return { error: error.message };
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Unexpected error" };
  }
}

// ─── saveStep: merge partial draft_json + step number ───────────

export async function saveStep(
  draftId: string,
  patch: Partial<DraftJson>,
  nextStep: number,
) {
  try {
    const { draft } = await loadDraft(draftId);
    const supabase = createServerClient();
    const merged = { ...(draft.draft_json as DraftJson), ...patch };
    const { error } = await supabase
      .from("oc_drafts")
      .update({ draft_json: merged, current_step: nextStep })
      .eq("id", draft.id);
    if (error) return { error: error.message };
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Unexpected error" };
  }
}

// ─── completeWizard: promote draft to real OC + lots + lot_owners ─

export async function completeWizard(draftId: string) {
  try {
    const { draft, profile } = await loadDraft(draftId);
    const d = draft.draft_json as DraftJson;
    if (!profile.management_company_id) return { error: "No management company assigned" };

    // Minimum viable: plan_number, oc_name, address, at least 2 lots.
    if (!d.plan_number) return { error: "Plan number is required (page 2)" };
    if (!d.oc_name) return { error: "OC name is required (page 2)" };
    if (!d.address) return { error: "Address is required (page 2)" };
    if (!d.lots || d.lots.length < 2) return { error: "At least 2 lots are required" };
    if (!d.bsb || !d.account_number || !d.account_name) return { error: "Trust account details are required (page 5)" };
    if (!d.opening_balance_date) return { error: "Opening balance date is required (page 6)" };

    const shared = d.uses_shared_trust_account ?? false;
    if (!shared && (!d.capital_bsb || !d.capital_account_number || !d.capital_account_name)) {
      return { error: "Capital works trust account details are required (page 5)" };
    }

    const supabase = createServerClient();

    const insertResult = await insertOCWithCode(supabase, {
      management_company_id: profile.management_company_id,
      plan_number: d.plan_number,
      name: d.oc_name,
      trading_name: d.trading_name || null,
      oc_number: d.oc_number ?? 1,
      address: d.address,
      street_number: d.street_number || null,
      street_name: d.street_name || null,
      suburb: d.suburb || null,
      state: d.state || "VIC",
      postcode: d.postcode || null,
      total_lots: d.lots.length,
      financial_year_start_month: d.financial_year_start_month ?? 7,
      services_only: !!d.services_only,
      notice_address_same_as_oc: d.notice_address_same_as_oc ?? true,
      notice_address: d.notice_address_same_as_oc === false ? (d.notice_address || null) : null,
      common_seal_text: d.common_seal ? (d.common_seal_text || null) : null,
      bank_provider: d.bank_provider ?? "other_csv",
      uses_shared_trust_account: shared,
      bank_bsb: d.bsb,
      bank_account_number: d.account_number,
      bank_account_name: d.account_name,
      opening_balance_date: d.opening_balance_date,
      opening_admin_balance: d.opening_admin_balance ?? 0,
      opening_capital_works_balance: d.opening_capital_works_balance ?? 0,
      opening_maintenance_plan_balance: d.has_maintenance_plan_fund
        ? (d.opening_maintenance_plan_balance ?? 0)
        : null,
      setup_step: 6,
      status: "active",
      created_by: profile.id,
    });
    if (insertResult.error || !insertResult.success) {
      return { error: insertResult.error ?? "Failed to create OC" };
    }
    const oc = insertResult.success;

    // Add creator as primary OC member.
    await supabase.from("oc_members").insert({
      oc_id: oc.id,
      profile_id: profile.id,
      role: "strata_manager",
      is_primary_contact: true,
    });

    // Insert lots — opening_balance carries per-lot arrears/credit at setup date.
    const lotsToInsert = d.lots.map((l) => ({
      oc_id: oc.id,
      lot_number: l.lot_number,
      lot_entitlement: l.unit_entitlement,
      lot_liability: l.lot_liability,
      opening_balance: l.opening_balance ?? 0,
    }));
    const { data: insertedLots, error: lotsError } = await supabase
      .from("lots")
      .insert(lotsToInsert)
      .select("id, lot_number");
    if (lotsError || !insertedLots) {
      return { error: `Failed to create lots: ${lotsError?.message ?? "unknown"}` };
    }

    // Insert lot_owners for any lot that had at least a name or contact.
    const lotByNumber = new Map<number, string>();
    for (const l of insertedLots) lotByNumber.set(l.lot_number, l.id);

    const ownerRows = d.lots
      .map((l) => {
        const name = (l.owner_name ?? "").trim();
        const email = (l.owner_email ?? "").trim();
        const phone = (l.owner_phone ?? "").trim();
        const postal = (l.owner_postal_address ?? "").trim();
        if (!name && !email && !phone && !postal) return null;
        const lotId = lotByNumber.get(l.lot_number);
        if (!lotId) return null;
        return {
          lot_id: lotId,
          name: name || "Owner",
          email: email || null,
          phone: phone || null,
          postal_address: postal || null,
          is_occupied_by_owner: l.is_occupied_by_owner ?? true,
          tenant_name: l.tenant_name || null,
          tenant_email: l.tenant_email || null,
          tenant_phone: l.tenant_phone || null,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    if (ownerRows.length > 0) {
      const { error: ownersError } = await supabase.from("lot_owners").insert(ownerRows);
      if (ownersError) {
        console.error("lot_owners insert failed (non-fatal):", ownersError);
      }
    }

    // Trust accounts → bank_accounts. Shared mode duplicates the BSB/account
    // across both funds; separate mode uses admin_* and capital_* fields.
    await supabase.from("bank_accounts").insert({
      oc_id: oc.id,
      fund_type: "administrative",
      bank_name: d.bank_name ?? null,
      account_name: d.account_name,
      bsb: d.bsb,
      account_number: d.account_number,
      opening_balance: d.opening_admin_balance ?? 0,
      opening_balance_date: d.opening_balance_date,
    });
    await supabase.from("bank_accounts").insert({
      oc_id: oc.id,
      fund_type: "capital_works",
      bank_name: shared ? (d.bank_name ?? null) : (d.capital_bank_name ?? null),
      account_name: shared ? d.account_name : (d.capital_account_name ?? ""),
      bsb: shared ? d.bsb : (d.capital_bsb ?? ""),
      account_number: shared ? d.account_number : (d.capital_account_number ?? ""),
      opening_balance: d.opening_capital_works_balance ?? 0,
      opening_balance_date: d.opening_balance_date,
    });

    // Mark draft promoted.
    await supabase
      .from("oc_drafts")
      .update({ promoted_oc_id: oc.id, promoted_at: new Date().toISOString() })
      .eq("id", draft.id);

    // Audit.
    await supabase.from("audit_log").insert({
      profile_id: profile.id,
      oc_id: oc.id,
      action: "create",
      entity_type: "oc",
      entity_id: oc.id,
      after_state: { name: d.oc_name, plan_number: d.plan_number, lots: d.lots.length },
      metadata: { source: "oc_wizard_v2", draft_id: draft.id },
    });

    revalidatePath("/ocs");
    revalidatePath("/dashboard");

    return { success: true, ocCode: oc.short_code };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Unexpected error" };
  }
}
