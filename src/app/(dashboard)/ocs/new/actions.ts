"use server";

import { revalidatePath, updateTag } from "next/cache";
import { requireCompanyRole } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";
import { insertOCWithCode } from "@/lib/oc-code";
import { parsePlanPdf, type ParsedPlan } from "@/lib/parse-plan";
import { parseRulesPdf, type ParsedRulesDocument } from "@/lib/parse-rules";
import { parseInsurancePdf, type ParsedInsurancePolicy } from "@/lib/parse-insurance";
import { parseDrnCsv, matchDrnsToLots, type DrnMatchResult, type LotForMatch, type LotOwnerForMatch } from "@/lib/macquarie/drn-import";
import { uploadObject, fetchObject, deleteObject, publicUrlFor } from "@/lib/storage/r2";

// ─── Types stored on draft_json ─────────────────────────────────
//
// The wizard's editable state. Persisted on every page transition so the user
// can refresh / come back later. Promoted to real rows on completion.

export type DraftInsurancePolicy = {
  provider: string;
  policy_number?: string;
  policy_type: "building" | "public_liability" | "combined" | "fidelity" | "voluntary_workers" | "other";
  sum_insured?: number;
  premium?: number;
  start_date: string;     // ISO yyyy-mm-dd
  end_date: string;
  /** R2 key of the CoC PDF this policy was extracted from. Used at
   *  completeWizard time to link the resulting insurance_policies row to its
   *  source document. Empty for hand-entered policies. */
  source_coc_storage_key?: string;
};

export type DraftLot = {
  lot_number: number;
  unit_number?: string;            // e.g. "3B" — apartment / unit label distinct from lot_number
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
  financial_year_start_day?: number;         // 1–31
  /** monthly | quarterly | half_yearly | annually — drives the levy cron. */
  billing_cycle?: "monthly" | "quarterly" | "half_yearly" | "annually";
  // Page 5 (trust accounts) — per-fund bank arrangement.
  bank_provider?: "macquarie_deft" | "other_csv";
  // Macquarie DRN mappings the manager uploaded during the wizard. We stage
  // by lot_number rather than by lot_id because lots don't exist yet (they're
  // inserted by completeWizard). On completion we look up each row's real
  // lot_id and write the lot_drns table.
  lot_drns?: Array<{
    drn: string;
    lot_number: number;
    primary_id: string | null;
    secondary_id: string | null;
  }>;
  // Whether this OC holds a third "maintenance plan" reserve fund. Tier 1/2
  // is mandatory (the UI forces this on); higher tiers can opt in.
  has_maintenance_plan_fund?: boolean;
  // Admin fund — always present.
  admin_bank_id?: string;        // e.g. "macquarie"
  admin_account_name?: string;
  admin_bsb?: string;
  admin_account_number?: string;
  // Capital works fund — either inherits admin's account or its own bank details.
  capital_same_as_admin?: boolean;
  capital_bank_id?: string;
  capital_account_name?: string;
  capital_bsb?: string;
  capital_account_number?: string;
  // Maintenance plan fund — only relevant when has_maintenance_plan_fund.
  maintenance_same_as_admin?: boolean;
  maintenance_bank_id?: string;
  maintenance_account_name?: string;
  maintenance_bsb?: string;
  maintenance_account_number?: string;

  // Notice address — collected on page 4 (lots) since it informs per-lot
  // postal address defaults. Always present; defaults to the OC address
  // (set by the wizard if the user doesn't change it).
  notice_address?: string;

  // Page 6 (rules)
  rules_source?: "model" | "custom";
  rules_status?: "none" | "uploaded" | "parsed" | "failed";
  rules_filename?: string;
  rules_rule_count?: number;

  // Page 7 (insurance) — captures one or more policies on cover at setup.
  has_insurance?: boolean;
  insurance_policies?: DraftInsurancePolicy[];
  // Certificates of Currency uploaded by the manager. Each entry archives the
  // file in R2 and (optionally) records what the AI parser pulled out, so the
  // user sees a list of uploaded certs even after navigating away.
  insurance_cocs?: Array<{
    storage_key: string;
    filename: string;
    size_bytes: number;
    plan_number: string | null;
    insured_name: string | null;
    ps_match: boolean;
  }>;
  // The single-policy fields below are legacy — kept so older drafts still
  // round-trip cleanly. New drafts write into insurance_policies[].
  insurance_provider?: string;
  insurance_policy_number?: string;
  insurance_policy_type?: string;
  insurance_sum_insured?: number;
  insurance_premium?: number;
  insurance_start_date?: string;
  insurance_end_date?: string;
  insurance_doc_filename?: string;

  // Page 8 (opening balances)
  opening_balance_date?: string;                 // ISO yyyy-mm-dd
  opening_admin_balance?: number;
  opening_capital_works_balance?: number;
  opening_maintenance_plan_balance?: number;     // only when has_maintenance_plan_fund
};

// ─── Address title-casing ───────────────────────────────────────
//
// Plans of subdivision capitalise every line (street names, suburbs) in
// ALL CAPS or weird mixed-case. We Title-Case them for display in our UI so
// "10 PINCHAM ROAD" becomes "10 Pincham Road" — same string, just readable.
// Postcode is digits-only and street number can include letters (e.g. "10A")
// so those pass through unchanged.

function titleCase(s: string | null | undefined): string | undefined {
  if (!s) return s ?? undefined;
  // Don't transform mostly-mixed-case strings — Gemini sometimes returns
  // correctly cased data on the second try. We only act when 70%+ of the
  // alphabetic characters are upper-case (i.e. it's all-caps junk).
  const alpha = s.replace(/[^A-Za-z]/g, "");
  if (alpha.length === 0) return s;
  const upperCount = alpha.replace(/[^A-Z]/g, "").length;
  const allCaps = upperCount / alpha.length >= 0.7;
  if (!allCaps) return s;
  return s
    .toLowerCase()
    .split(/(\s+|[-/])/)
    .map((tok) => /^[a-z]/.test(tok) ? tok[0].toUpperCase() + tok.slice(1) : tok)
    .join("");
}

function titleCaseAddress<T extends { street_name?: string | null; suburb?: string | null; address?: string | null }>(o: T): T {
  return {
    ...o,
    street_name: titleCase(o.street_name ?? null) ?? null,
    suburb: titleCase(o.suburb ?? null) ?? null,
    address: titleCase(o.address ?? null) ?? null,
  };
}

// ─── Document naming ────────────────────────────────────────────
//
// Documents uploaded via the wizard get a system-generated display name
// (e.g. "Plan of Subdivision — PS812345X.pdf") that's stored on
// `documents.file_name`. The user's original filename is preserved on
// `documents.original_filename` so it's never thrown away — it shows up on
// the document detail view and is used as the suggested download filename
// when the user pulls the file back down.

type DocCategory = "plan_of_subdivision" | "oc_rules" | "insurance_policy";
function friendlyDocName(
  category: DocCategory,
  ctx: { planNumber?: string | null; ocName?: string | null; index?: number },
): string {
  const plan = (ctx.planNumber ?? "").trim().toUpperCase();
  const stamp = new Date().toISOString().slice(0, 10);
  switch (category) {
    case "plan_of_subdivision":
      return plan ? `Plan of Subdivision — ${plan}.pdf` : `Plan of Subdivision — ${stamp}.pdf`;
    case "oc_rules":
      return plan ? `Owners Corporation Rules — ${plan}.pdf` : `Owners Corporation Rules — ${stamp}.pdf`;
    case "insurance_policy": {
      const n = ctx.index != null ? ` ${ctx.index}` : "";
      return plan
        ? `Certificate of Currency${n} — ${plan}.pdf`
        : `Certificate of Currency${n} — ${stamp}.pdf`;
    }
  }
}

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

// Single round-trip variant: insert + return the full row so the wizard
// renders immediately without a second auth+select hop on first paint.
export async function createDraftAndLoad(): Promise<{ draft?: unknown; error?: string }> {
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
      .select("*")
      .single();
    if (error || !data) {
      console.error("createDraftAndLoad error:", error);
      return { error: "Failed to start the wizard" };
    }
    return { draft: data };
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

// ─── uploadOcPhoto: photo of the OC's building (page 3) ───────────
//
// Photos are <=10MB JPEG/PNG/WebP. Same R2 layout as logos:
//   logos/{managementCompanyId}/oc-photos/{draftId}-{uuid}.{ext}
// On wizard completion the storage key is copied to
// owners_corporations.photo_storage_key.

const PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function uploadOcPhoto(draftId: string, formData: FormData) {
  try {
    const { draft, profile } = await loadDraft(draftId);
    const file = formData.get("file");
    const thumb = formData.get("thumb");
    if (!(file instanceof File)) return { error: "No file uploaded" };
    if (!PHOTO_TYPES.has(file.type)) {
      return { error: "Photos must be JPEG, PNG, or WebP" };
    }
    if (file.size > 10 * 1024 * 1024) {
      return { error: "Photo exceeds 10MB" };
    }
    const ext = file.name.toLowerCase().match(/\.(jpe?g|png|webp)$/i)?.[0] ?? ".jpg";
    const baseKey = `logos/${profile.management_company_id}/oc-photos/${draft.id}-${crypto.randomUUID()}`;
    const key = `${baseKey}${ext}`;
    // Thumbnail is always JPEG (compressed from canvas client-side).
    const thumbKey = `${baseKey}-thumb.jpg`;
    const buf = Buffer.from(await file.arrayBuffer());

    try {
      await uploadObject(key, buf, file.type);
    } catch (err) {
      console.error("uploadOcPhoto: R2 upload failed", err);
      return { error: "Couldn't save your photo — please try again." };
    }

    // Best-effort thumbnail upload. If the client didn't generate one (very
    // old browser, canvas failure) we just leave thumbnail_storage_key null
    // and consumers fall back to the full-res image.
    let storedThumbKey: string | null = null;
    if (thumb instanceof File) {
      try {
        const thumbBuf = Buffer.from(await thumb.arrayBuffer());
        await uploadObject(thumbKey, thumbBuf, "image/jpeg");
        storedThumbKey = thumbKey;
      } catch (err) {
        console.error("uploadOcPhoto: thumbnail upload failed (non-fatal)", err);
      }
    }

    const supabase = createServerClient();

    // Best-effort cleanup: drop the previous photo + thumb from R2 if the user
    // is replacing them. Don't block on the result; orphan keys are harmless.
    if (draft.photo_storage_key && draft.photo_storage_key !== key) {
      void deleteObject(draft.photo_storage_key).catch(() => {});
    }
    if (draft.photo_thumbnail_storage_key && draft.photo_thumbnail_storage_key !== storedThumbKey) {
      void deleteObject(draft.photo_thumbnail_storage_key).catch(() => {});
    }

    const { error: dbErr } = await supabase
      .from("oc_drafts")
      .update({ photo_storage_key: key, photo_thumbnail_storage_key: storedThumbKey })
      .eq("id", draft.id);
    if (dbErr) {
      console.error("uploadOcPhoto: DB update failed", dbErr);
      return { error: "Couldn't save your photo — please try again." };
    }
    return {
      success: true,
      storage_key: key,
      thumbnail_storage_key: storedThumbKey,
      public_url: publicUrlFor(key),
    };
  } catch (err) {
    console.error("uploadOcPhoto: unexpected error", err);
    return { error: "Something went wrong — please try again." };
  }
}

// Resolves a storage key to its public URL without leaking the bucket origin
// to the bundle. Called once on page 3 mount when the draft already has a
// previously-uploaded photo (resumed wizard).
export async function getPhotoPublicUrl(storageKey: string): Promise<string> {
  return publicUrlFor(storageKey);
}

export async function removeOcPhoto(draftId: string) {
  try {
    const { draft } = await loadDraft(draftId);
    if (draft.photo_storage_key) {
      void deleteObject(draft.photo_storage_key).catch(() => {});
    }
    if (draft.photo_thumbnail_storage_key) {
      void deleteObject(draft.photo_thumbnail_storage_key).catch(() => {});
    }
    const supabase = createServerClient();
    const { error } = await supabase
      .from("oc_drafts")
      .update({ photo_storage_key: null, photo_thumbnail_storage_key: null })
      .eq("id", draft.id);
    if (error) return { error: "Couldn't remove the photo." };
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Unexpected error" };
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
    const cased = titleCaseAddress({
      street_name: first?.street_name ?? null,
      suburb: first?.suburb ?? null,
      address: first?.address ?? null,
    });
    const draftJson: DraftJson = {
      plan_number: parsed.plan_of_subdivision_number ?? undefined,
      oc_number: first?.oc_number ?? 1,
      oc_name: first?.oc_name ?? undefined,
      // Use the building name from the plan as the default trading name —
      // managers usually use the building's display name as the OC's
      // friendly title.
      trading_name: first?.building_name ?? undefined,
      address: cased.address ?? undefined,
      street_number: first?.street_number ?? undefined,
      street_name: cased.street_name ?? undefined,
      suburb: cased.suburb ?? undefined,
      state: first?.state ?? "VIC",
      postcode: first?.postcode ?? undefined,
      total_lots: first?.lot_count ?? first?.lots.length ?? 0,
      lots: (first?.lots ?? []).map((l) => ({
        lot_number: l.lot_number,
        unit_number: l.unit_number ?? undefined,
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
    return {
      success: true,
      ocCount: parsed.detected_ocs.length,
      lotCount: first?.lots.length ?? 0,
      detectedOcs: parsed.detected_ocs.map((o) => ({
        oc_number: o.oc_number,
        lot_count: o.lot_count,
        oc_name: o.oc_name ?? null,
      })),
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Unexpected error" };
  }
}

// ─── uploadRules / parseDraftRules / skipRules ──────────────────
//
// Wizard page 6 captures custom OC rules. When a manager uploads a PDF we:
//   1. Push it to R2 under rules/{draftId}/source.pdf,
//   2. Run Gemini's rules extractor → cache parsed JSON on the draft,
//   3. On completeWizard, materialise one oc_rules row per parsed rule and
//      register the PDF in `documents`.
//
// "Use Victoria's Model Rules" path is just a flag — no upload, no parse.

export async function uploadRules(draftId: string, formData: FormData) {
  try {
    const { draft } = await loadDraft(draftId);
    const file = formData.get("file");
    if (!(file instanceof File)) return { error: "No file uploaded" };
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      return { error: "Only PDF files are accepted" };
    }
    if (file.size > 25 * 1024 * 1024) return { error: "Rules PDF exceeds 25MB" };

    const key = `rules/${draft.id}/source.pdf`;
    const buf = Buffer.from(await file.arrayBuffer());
    try {
      await uploadObject(key, buf, "application/pdf");
    } catch (err) {
      console.error("uploadRules: R2 upload failed", err);
      return { error: "Couldn't save your file — please try again." };
    }

    const supabase = createServerClient();
    const { error: dbErr } = await supabase
      .from("oc_drafts")
      .update({
        rules_storage_key: key,
        rules_filename: file.name,
        rules_size_bytes: file.size,
        rules_parsed_json: null,
      })
      .eq("id", draft.id);
    if (dbErr) {
      console.error("uploadRules: DB update failed", dbErr);
      return { error: "Couldn't save your file — please try again." };
    }
    return { success: true };
  } catch (err) {
    console.error("uploadRules: unexpected error", err);
    return { error: "Something went wrong — please try again." };
  }
}

export async function parseDraftRules(draftId: string) {
  try {
    const { draft } = await loadDraft(draftId);
    if (!draft.rules_storage_key) return { error: "No rules PDF uploaded" };

    let buf: Buffer;
    try {
      buf = await fetchObject(draft.rules_storage_key);
    } catch (err) {
      console.error("parseDraftRules: R2 fetch failed", err);
      return { error: "We couldn't read the uploaded rules document." };
    }

    let parsed: ParsedRulesDocument;
    try {
      parsed = await parseRulesPdf(buf);
    } catch (err) {
      console.error("parseDraftRules: parser failed", err);
      return { error: "We couldn't read this rules PDF automatically. Continue and we'll keep the original — searchable but not indexed." };
    }
    if (!parsed.is_oc_rules) {
      return {
        error: `That didn't look like an OC rules document (looks like: ${parsed.document_type_guess || "another document type"}). Upload a different PDF or skip to use Victoria's Model Rules.`,
      };
    }

    const supabase = createServerClient();
    const { error } = await supabase
      .from("oc_drafts")
      .update({ rules_parsed_json: parsed as unknown as Record<string, unknown> })
      .eq("id", draft.id);
    if (error) return { error: error.message };

    return {
      success: true,
      ruleCount: parsed.rules.length,
      ocScopes: parsed.oc_scopes,
      rules: parsed.rules.map((r) => ({
        oc_scope: r.oc_scope,
        parent_heading: r.parent_heading ?? null,
        rule_number: r.rule_number,
        heading: r.heading ?? null,
        body: r.body,
      })),
    };
  } catch (err) {
    console.error("parseDraftRules: unexpected error", err);
    return { error: "Something went wrong — please try again." };
  }
}

export async function setRulesSource(draftId: string, source: "model" | "custom") {
  try {
    const { draft } = await loadDraft(draftId);
    const supabase = createServerClient();
    const merged = { ...(draft.draft_json as DraftJson), rules_source: source };
    const { error } = await supabase
      .from("oc_drafts")
      .update({ draft_json: merged })
      .eq("id", draft.id);
    if (error) return { error: error.message };
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Unexpected error" };
  }
}

// ─── uploadAndParseCoC — upload + Gemini extraction in one round-trip ───
//
// Page 7 uploads a Certificate of Currency. We push it to R2, record the
// metadata on the draft, run the Gemini parser, and return both the storage
// reference and the extracted policies. The client appends the entry to its
// running list of uploaded CoCs.
//
// Caller can pass `expectedPlanNumber` so we can compare against the PS
// number Gemini finds on the cert — the UI then warns the manager if the
// cert is for a different plan.

export async function uploadAndParseCoC(
  draftId: string,
  formData: FormData,
  expectedPlanNumber?: string,
): Promise<{
  success?: true;
  storage_key?: string;
  filename?: string;
  size_bytes?: number;
  plan_number?: string | null;
  insured_name?: string | null;
  ps_match?: boolean;
  policies?: ParsedInsurancePolicy[];
  error?: string;
}> {
  try {
    const { draft } = await loadDraft(draftId);
    const file = formData.get("file");
    if (!(file instanceof File)) return { error: "No file uploaded" };
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      return { error: "Only PDF files are accepted" };
    }
    if (file.size > 25 * 1024 * 1024) return { error: "Certificate exceeds 25MB" };

    const key = `insurance/${draft.id}/${crypto.randomUUID()}.pdf`;
    const buf = Buffer.from(await file.arrayBuffer());

    try {
      await uploadObject(key, buf, "application/pdf");
    } catch (err) {
      console.error("uploadAndParseCoC: R2 upload failed", err);
      return { error: "Couldn't save your file — please try again." };
    }

    let parsed;
    try {
      parsed = await parseInsurancePdf(buf);
    } catch (err) {
      console.error("uploadAndParseCoC: parser failed", err);
      return { error: "We couldn't read this PDF automatically. Enter details manually." };
    }
    if (!parsed.is_insurance_certificate) {
      // Best-effort cleanup: the file isn't a real cert, so don't leave it
      // sitting in R2.
      void deleteObject(key).catch(() => {});
      return {
        error: `That didn't look like a certificate of currency (looks like: ${parsed.document_type_guess || "another document type"}). Upload a different PDF or enter details manually.`,
      };
    }

    // Compare cert PS number to the OC's. Normalise both sides to handle
    // whitespace + casing differences. ps_match is true only when both sides
    // have a value AND they agree.
    const norm = (s: string | null | undefined) => (s ?? "").trim().toUpperCase().replace(/\s+/g, "");
    const expected = norm(expectedPlanNumber);
    const found = norm(parsed.plan_number ?? null);
    const psMatch = !!expected && !!found && expected === found;

    return {
      success: true,
      storage_key: key,
      filename: file.name,
      size_bytes: file.size,
      plan_number: parsed.plan_number,
      insured_name: parsed.insured_name,
      ps_match: psMatch,
      policies: parsed.policies,
    };
  } catch (err) {
    console.error("uploadAndParseCoC: unexpected error", err);
    return { error: "Something went wrong — please try again." };
  }
}

// ─── deleteCoC — remove a CoC document from R2 + draft ───
//
// Called when the manager removes a CoC from page 7. Best-effort R2 delete
// so we don't leave orphaned objects when a cert is rejected or replaced.

export async function deleteCoC(draftId: string, storageKey: string): Promise<{ success?: true; error?: string }> {
  try {
    await loadDraft(draftId);
    // R2 delete is best-effort; orphans are harmless.
    void deleteObject(storageKey).catch(() => {});
    return { success: true };
  } catch (err) {
    console.error("deleteCoC: unexpected error", err);
    return { error: "Something went wrong — please try again." };
  }
}

// ─── uploadInsuranceDoc — stores the policy schedule PDF on the draft ────

export async function uploadInsuranceDoc(draftId: string, formData: FormData) {
  try {
    const { draft } = await loadDraft(draftId);
    const file = formData.get("file");
    if (!(file instanceof File)) return { error: "No file uploaded" };
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      return { error: "Only PDF files are accepted" };
    }
    if (file.size > 25 * 1024 * 1024) return { error: "Insurance document exceeds 25MB" };

    const key = `insurance/${draft.id}/policy.pdf`;
    const buf = Buffer.from(await file.arrayBuffer());
    try {
      await uploadObject(key, buf, "application/pdf");
    } catch (err) {
      console.error("uploadInsuranceDoc: R2 upload failed", err);
      return { error: "Couldn't save your file — please try again." };
    }

    const supabase = createServerClient();
    const { error: dbErr } = await supabase
      .from("oc_drafts")
      .update({
        insurance_doc_storage_key: key,
        insurance_doc_filename: file.name,
        insurance_doc_size_bytes: file.size,
      })
      .eq("id", draft.id);
    if (dbErr) {
      console.error("uploadInsuranceDoc: DB update failed", dbErr);
      return { error: "Couldn't save your file — please try again." };
    }
    return { success: true };
  } catch (err) {
    console.error("uploadInsuranceDoc: unexpected error", err);
    return { error: "Something went wrong — please try again." };
  }
}

// ─── DRN CSV staging during the wizard ──────────────────────────
//
// Macquarie users get a "Upload DRN CSV" panel on Page 5 once they pick
// Macquarie as the admin bank. The CSV is parsed + auto-matched against the
// draft's lot schedule (by lot number / unit number / payer name → owner)
// the same way macquarie-ingest does it for live OCs. The big difference:
// lots don't exist yet, so the preview ships back lot_numbers rather than
// lot_ids, and the staged rows live on draft_json.lot_drns until
// completeWizard resolves them and writes lot_drns.

export type WizardDrnPreviewMatch = {
  rowNumber: number;
  drn: string;
  primaryId: string | null;
  secondaryId: string | null;
  /** Lot number from the draft this row was auto-matched to (null = needs
   *  manual resolution). The UI lets the manager override via a Select that
   *  picks from the same lot_numbers list. */
  lot_number: number | null;
  matchedBy: DrnMatchResult["matchedBy"];
  confidence: DrnMatchResult["confidence"];
  note?: string;
};

export type WizardDrnPreview = {
  matches: WizardDrnPreviewMatch[];
  totals: { total: number; matchedExact: number; matchedFuzzy: number; unmatched: number };
};

export async function previewDraftDrnCsv(
  draftId: string,
  formData: FormData,
): Promise<{ preview?: WizardDrnPreview; error?: string }> {
  try {
    const { draft } = await loadDraft(draftId);
    const file = formData.get("file");
    if (!(file instanceof File)) return { error: "No file uploaded" };
    if (file.size > 5 * 1024 * 1024) return { error: "CSV exceeds 5MB" };

    const text = await file.text();
    const { rows, errors } = parseDrnCsv(text);
    if (errors.length > 0 && rows.length === 0) {
      return { error: errors[0].message };
    }

    // matchDrnsToLots expects {id, lot_number, unit_number}. Wizard lots don't
    // have ids yet, so we use lot_number as a stand-in id and translate back
    // when we ship the response.
    const d = draft.draft_json as DraftJson;
    const draftLots: LotForMatch[] = (d.lots ?? []).map((l) => ({
      id: String(l.lot_number),
      lot_number: l.lot_number,
      unit_number: l.unit_number ?? null,
    }));
    const draftOwners: LotOwnerForMatch[] = (d.lots ?? [])
      .filter((l) => l.owner_name?.trim())
      .map((l) => ({ lot_id: String(l.lot_number), name: (l.owner_name ?? "").trim() }));

    const matchResults = matchDrnsToLots(rows, draftLots, draftOwners);

    let exact = 0, fuzzy = 0, unmatched = 0;
    const matches: WizardDrnPreviewMatch[] = matchResults.map((m) => {
      if (m.confidence === "exact") exact++;
      else if (m.confidence === "fuzzy") fuzzy++;
      else unmatched++;
      return {
        rowNumber: m.drnRow.rowNumber,
        drn: m.drnRow.drn,
        primaryId: m.drnRow.primaryId,
        secondaryId: m.drnRow.secondaryId,
        lot_number: m.lotId ? parseInt(m.lotId, 10) : null,
        matchedBy: m.matchedBy,
        confidence: m.confidence,
        note: m.note,
      };
    });

    return {
      preview: {
        matches,
        totals: { total: matches.length, matchedExact: exact, matchedFuzzy: fuzzy, unmatched },
      },
    };
  } catch (err) {
    console.error("previewDraftDrnCsv: unexpected error", err);
    return { error: "Couldn't read the DRN file — please try again." };
  }
}

export async function saveDraftDrnMappings(
  draftId: string,
  mappings: Array<{ drn: string; lot_number: number; primary_id: string | null; secondary_id: string | null }>,
): Promise<{ success?: true; error?: string }> {
  try {
    const { draft } = await loadDraft(draftId);
    const supabase = createServerClient();
    const merged: DraftJson = { ...(draft.draft_json as DraftJson), lot_drns: mappings };
    const { error } = await supabase
      .from("oc_drafts")
      .update({ draft_json: merged })
      .eq("id", draft.id);
    if (error) return { error: error.message };
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Unexpected error" };
  }
}

export async function clearDraftDrnMappings(draftId: string): Promise<{ success?: true; error?: string }> {
  try {
    const { draft } = await loadDraft(draftId);
    const supabase = createServerClient();
    const merged: DraftJson = { ...(draft.draft_json as DraftJson) };
    delete merged.lot_drns;
    const { error } = await supabase
      .from("oc_drafts")
      .update({ draft_json: merged })
      .eq("id", draft.id);
    if (error) return { error: error.message };
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Unexpected error" };
  }
}

// ─── skipParsing: user opted to enter manually ──────────────────

export async function skipParsing(draftId: string) {
  try {
    await loadDraft(draftId);
    const supabase = createServerClient();
    // Land on page 2 (Review) — the manager wants to type the plan number,
    // address, and lot schedule by hand. Page 2 already supports an empty
    // initial state.
    const { error } = await supabase
      .from("oc_drafts")
      .update({ parse_status: "skipped", current_step: 2 })
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

    // Minimum viable: plan_number, address, at least 2 lots. owners_corporations.name
    // is derived from trading_name → address; no separate "legal OC name" field.
    if (!d.plan_number) return { error: "Plan number is required (page 2)" };
    if (!d.address) return { error: "Address is required (page 2)" };
    const resolvedName = (d.trading_name?.trim() || d.address.trim()) || `Owners Corporation ${d.plan_number}`;
    if (!d.lots || d.lots.length < 2) return { error: "At least 2 lots are required" };
    if (!d.admin_bsb || !d.admin_account_number || !d.admin_account_name || !d.admin_bank_id) {
      return { error: "Trust account details are required (page 5)" };
    }
    if (!d.opening_balance_date) return { error: "Opening balance date is required (page 6)" };

    // Resolve per-fund bank details. Capital and maintenance can either share
    // the admin account or have their own.
    const capitalShared = d.capital_same_as_admin ?? true;
    const capital = capitalShared
      ? { bank_id: d.admin_bank_id, account_name: d.admin_account_name, bsb: d.admin_bsb, account_number: d.admin_account_number }
      : { bank_id: d.capital_bank_id, account_name: d.capital_account_name, bsb: d.capital_bsb, account_number: d.capital_account_number };
    if (!capital.bsb || !capital.account_number || !capital.account_name || !capital.bank_id) {
      return { error: "Capital works trust account details are required (page 5)" };
    }

    const hasMaintenance = !!d.has_maintenance_plan_fund;
    const maintenanceShared = d.maintenance_same_as_admin ?? true;
    const maintenance = !hasMaintenance ? null
      : maintenanceShared
        ? { bank_id: d.admin_bank_id, account_name: d.admin_account_name, bsb: d.admin_bsb, account_number: d.admin_account_number }
        : { bank_id: d.maintenance_bank_id, account_name: d.maintenance_account_name, bsb: d.maintenance_bsb, account_number: d.maintenance_account_number };
    if (maintenance && (!maintenance.bsb || !maintenance.account_number || !maintenance.account_name || !maintenance.bank_id)) {
      return { error: "Maintenance plan trust account details are required (page 5)" };
    }

    const supabase = createServerClient();

    const insertResult = await insertOCWithCode(supabase, {
      management_company_id: profile.management_company_id,
      plan_number: d.plan_number,
      name: resolvedName,
      trading_name: d.trading_name || null,
      oc_number: d.oc_number ?? 1,
      address: d.address,
      street_number: d.street_number || null,
      street_name: d.street_name || null,
      suburb: d.suburb || null,
      state: d.state || "VIC",
      postcode: d.postcode || null,
      total_lots: d.lots.length,
      photo_storage_key: draft.photo_storage_key ?? null,
      photo_thumbnail_storage_key: draft.photo_thumbnail_storage_key ?? null,
      financial_year_start_month: d.financial_year_start_month ?? 7,
      financial_year_start_day: d.financial_year_start_day ?? 1,
      services_only: !!d.services_only,
      billing_cycle: d.billing_cycle ?? "quarterly",
      // Notice address always set — wizard defaults to OC address; user can override.
      notice_address_same_as_oc: !d.notice_address || d.notice_address.trim() === d.address.trim(),
      notice_address: d.notice_address || d.address,
      bank_provider: d.bank_provider ?? "other_csv",
      uses_shared_trust_account: capitalShared && (!hasMaintenance || maintenanceShared),
      // Legacy summary fields point at the admin trust account.
      bank_bsb: d.admin_bsb,
      bank_account_number: d.admin_account_number,
      bank_account_name: d.admin_account_name,
      opening_balance_date: d.opening_balance_date,
      opening_admin_balance: d.opening_admin_balance ?? 0,
      opening_capital_works_balance: d.opening_capital_works_balance ?? 0,
      opening_maintenance_plan_balance: hasMaintenance ? (d.opening_maintenance_plan_balance ?? 0) : null,
      rules_source: d.rules_source ?? "model",
      rules_uploaded_at: d.rules_source === "custom" && draft.rules_storage_key ? new Date().toISOString() : null,
      setup_step: 8,
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
      unit_number: l.unit_number || null,
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

    // Trust accounts → bank_accounts rows per fund. Each fund references its
    // own (resolved) BSB+account_number; shared-account funds end up with
    // matching values, which the uq_bank_accounts_oc_fund_account index
    // accepts (one row per fund_type).
    await supabase.from("bank_accounts").insert({
      oc_id: oc.id,
      fund_type: "administrative",
      bank_name: d.admin_bank_id ?? null,
      account_name: d.admin_account_name,
      bsb: d.admin_bsb,
      account_number: d.admin_account_number,
      opening_balance: d.opening_admin_balance ?? 0,
      opening_balance_date: d.opening_balance_date,
    });
    await supabase.from("bank_accounts").insert({
      oc_id: oc.id,
      fund_type: "capital_works",
      bank_name: capital.bank_id ?? null,
      account_name: capital.account_name!,
      bsb: capital.bsb!,
      account_number: capital.account_number!,
      opening_balance: d.opening_capital_works_balance ?? 0,
      opening_balance_date: d.opening_balance_date,
    });
    if (maintenance) {
      await supabase.from("bank_accounts").insert({
        oc_id: oc.id,
        fund_type: "maintenance_plan",
        bank_name: maintenance.bank_id ?? null,
        account_name: maintenance.account_name!,
        bsb: maintenance.bsb!,
        account_number: maintenance.account_number!,
        opening_balance: d.opening_maintenance_plan_balance ?? 0,
        opening_balance_date: d.opening_balance_date,
      });
    }

    // DRN mappings (Macquarie only). The wizard staged rows in
    // draft_json.lot_drns keyed by lot_number; now that lots exist we resolve
    // each row to a real lot_id and write the lot_drns table. Rows that
    // didn't resolve to a lot are silently skipped — the manager can fix
    // them from the OC's DRN page later.
    if (d.lot_drns && d.lot_drns.length > 0) {
      const drnRows = d.lot_drns
        .map((m) => {
          const lotId = lotByNumber.get(m.lot_number);
          if (!lotId) return null;
          return {
            lot_id: lotId,
            drn: m.drn,
            primary_id: m.primary_id,
            secondary_id: m.secondary_id,
            source: "macquarie_csv" as const,
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);
      if (drnRows.length > 0) {
        const { error: drnError } = await supabase.from("lot_drns").insert(drnRows);
        if (drnError) {
          console.error("completeWizard: lot_drns insert failed (non-fatal)", drnError);
        }
      }
    }

    // Mark draft promoted.
    await supabase
      .from("oc_drafts")
      .update({ promoted_oc_id: oc.id, promoted_at: new Date().toISOString() })
      .eq("id", draft.id);

    // Item 22: persist the uploaded Plan-of-Subdivision PDF as a document on
    // the new OC. The file is already in R2 at draft.plan_storage_key; we
    // just register a documents row pointing at it so it surfaces in the OC's
    // documents tab and is full-text searchable once OCR completes.
    if (draft.plan_storage_key && draft.plan_filename) {
      await supabase.from("documents").insert({
        oc_id: oc.id,
        lot_id: null,
        category: "plan_of_subdivision",
        file_name: friendlyDocName("plan_of_subdivision", { planNumber: d.plan_number, ocName: d.oc_name }),
        original_filename: draft.plan_filename,
        file_path: draft.plan_storage_key,
        file_size: draft.plan_size_bytes ?? null,
        mime_type: "application/pdf",
        is_confidential: false,
        uploaded_by: profile.id,
        ocr_status: "pending",
      });
    }

    // Rules (custom path only): register the source PDF + materialise the
    // parsed rules into oc_rules so they're searchable + linkable.
    let rulesDocumentId: string | null = null;
    if (d.rules_source === "custom" && draft.rules_storage_key && draft.rules_filename) {
      const { data: rulesDoc } = await supabase.from("documents").insert({
        oc_id: oc.id,
        lot_id: null,
        category: "oc_rules",
        file_name: friendlyDocName("oc_rules", { planNumber: d.plan_number, ocName: d.oc_name }),
        original_filename: draft.rules_filename,
        file_path: draft.rules_storage_key,
        file_size: draft.rules_size_bytes ?? null,
        mime_type: "application/pdf",
        is_confidential: false,
        uploaded_by: profile.id,
        ocr_status: "pending",
      }).select("id").single();
      rulesDocumentId = rulesDoc?.id ?? null;

      // Materialise parsed rules. Best-effort: if the parse failed earlier
      // we still keep the PDF — the search index works via OCR text.
      //
      // Multi-OC documents (one PDF that registers rules for two or more OCs)
      // are filtered down to the rules whose `oc_scope` matches THIS OC,
      // matched by plan_number first then by ordinal position in oc_scopes
      // (the OC at index N in the parsed scopes maps to the N-th OC promoted
      // from this plan). This prevents two OCs' rule "1.1.1" from getting
      // merged onto a single OC.
      const parsedRules = draft.rules_parsed_json as {
        oc_scopes?: Array<{ label: string; plan_number: string | null; rule_count: number }>;
        rules?: Array<{
          oc_scope?: string;
          parent_heading?: string | null;
          rule_number: string;
          heading?: string | null;
          body: string;
          page_number?: number | null;
          bbox?: { x: number; y: number; w: number; h: number } | null;
          confidence?: number;
        }>;
      } | null;

      const scopes = parsedRules?.oc_scopes ?? [];
      const allRules = parsedRules?.rules ?? [];
      const norm = (s: string | null | undefined) => (s ?? "").trim().toUpperCase().replace(/\s+/g, "");
      // Resolve which scope to keep:
      //  (a) the scope whose stated plan_number matches the current OC's, or
      //  (b) if there's a multi-OC plan and we're creating the N-th OC, pick
      //      the N-th scope, or
      //  (c) fall back to all rules (single-OC document).
      let scopeLabel: string | null = null;
      if (scopes.length > 0) {
        const byPlan = scopes.find((s) => norm(s.plan_number) === norm(d.plan_number));
        if (byPlan) {
          scopeLabel = byPlan.label;
        } else if (scopes.length > 1) {
          // Use oc_number as a 1-based index hint.
          const idx = Math.min(Math.max((d.oc_number ?? 1) - 1, 0), scopes.length - 1);
          scopeLabel = scopes[idx]?.label ?? null;
        } else {
          scopeLabel = scopes[0].label;
        }
      }
      const ocRules = scopeLabel
        ? allRules.filter((r) => (r.oc_scope ?? scopes[0]?.label ?? "") === scopeLabel)
        : allRules;

      if (ocRules.length > 0) {
        const rows = ocRules.map((r, idx) => ({
          oc_id: oc.id,
          rule_number: r.rule_number,
          // Preserve the parent-section heading inline (e.g. "8. Commercial
          // Lots — Advertising Signage") so breach-notice generators don't
          // strip critical scope context.
          heading: r.parent_heading
            ? (r.heading ? `${r.parent_heading} — ${r.heading}` : r.parent_heading)
            : (r.heading ?? null),
          body: r.body,
          page_number: r.page_number ?? null,
          bbox: r.bbox ?? null,
          confidence: r.confidence ?? null,
          ordinal: idx + 1,
          source_document_id: rulesDocumentId,
        }));
        const { error: rulesError } = await supabase.from("oc_rules").insert(rows);
        if (rulesError) {
          console.error("completeWizard: oc_rules insert failed (non-fatal)", rulesError);
        }
      }
    }

    // Insurance — support multiple policies. Backward compat: when the older
    // single-policy fields are set but `insurance_policies` is empty, treat
    // the legacy fields as one policy.
    if (d.has_insurance) {
      const policies: DraftInsurancePolicy[] =
        d.insurance_policies && d.insurance_policies.length > 0
          ? d.insurance_policies
          : (d.insurance_provider && d.insurance_start_date && d.insurance_end_date
              ? [{
                  provider: d.insurance_provider,
                  policy_number: d.insurance_policy_number,
                  policy_type: (d.insurance_policy_type as DraftInsurancePolicy["policy_type"]) ?? "combined",
                  sum_insured: d.insurance_sum_insured,
                  premium: d.insurance_premium,
                  start_date: d.insurance_start_date,
                  end_date: d.insurance_end_date,
                }]
              : []);

      // Register every uploaded Certificate of Currency as a separate
      // document so each is archived + OCR-indexed independently. Managers
      // routinely upload multiple certs (e.g. one per insurer when a cover
      // mix changes mid-year). We capture the resulting documents row id
      // keyed by R2 storage_key so policy inserts below can attach
      // source_document_id back to the originating cert.
      const cocs = d.insurance_cocs ?? [];
      const cocDocByKey = new Map<string, string>();
      for (let idx = 0; idx < cocs.length; idx++) {
        const coc = cocs[idx];
        const friendly = friendlyDocName("insurance_policy", {
          planNumber: d.plan_number,
          ocName: d.oc_name,
          index: cocs.length > 1 ? idx + 1 : undefined,
        });
        const { data: docRow } = await supabase
          .from("documents")
          .insert({
            oc_id: oc.id,
            lot_id: null,
            category: "insurance_policy",
            file_name: friendly,
            original_filename: coc.filename,
            file_path: coc.storage_key,
            file_size: coc.size_bytes,
            mime_type: "application/pdf",
            is_confidential: false,
            uploaded_by: profile.id,
            ocr_status: "pending",
          })
          .select("id")
          .single();
        if (docRow?.id) cocDocByKey.set(coc.storage_key, docRow.id);
      }
      // Legacy single-doc path — only register it if no multi-CoC list is
      // present, to avoid duplicating older drafts that wrote the same key
      // through `insurance_doc_storage_key`.
      if (cocs.length === 0 && draft.insurance_doc_storage_key && draft.insurance_doc_filename) {
        await supabase.from("documents").insert({
          oc_id: oc.id,
          lot_id: null,
          category: "insurance_policy",
          file_name: friendlyDocName("insurance_policy", { planNumber: d.plan_number, ocName: d.oc_name }),
          original_filename: draft.insurance_doc_filename,
          file_path: draft.insurance_doc_storage_key,
          file_size: draft.insurance_doc_size_bytes ?? null,
          mime_type: "application/pdf",
          is_confidential: false,
          uploaded_by: profile.id,
          ocr_status: "pending",
        });
      }

      for (const p of policies) {
        const sourceDocId = p.source_coc_storage_key
          ? cocDocByKey.get(p.source_coc_storage_key) ?? null
          : null;
        const { error: insErr } = await supabase.from("insurance_policies").insert({
          oc_id: oc.id,
          policy_type: p.policy_type,
          provider: p.provider,
          policy_number: p.policy_number ?? null,
          sum_insured: p.sum_insured ?? null,
          premium: p.premium ?? null,
          start_date: p.start_date,
          end_date: p.end_date,
          status: "active",
          source_document_id: sourceDocId,
        });
        if (insErr) {
          console.error("completeWizard: insurance_policies insert failed (non-fatal)", insErr);
        }
      }
    }

    // Audit.
    await supabase.from("audit_log").insert({
      profile_id: profile.id,
      oc_id: oc.id,
      action: "create",
      entity_type: "oc",
      entity_id: oc.id,
      after_state: { name: resolvedName, plan_number: d.plan_number, lots: d.lots.length },
      metadata: { source: "oc_wizard_v2", draft_id: draft.id },
    });

    // Sidebar OC list uses unstable_cache tagged with the company id — without
    // this updateTag, the sidebar serves the previous (empty) list until the
    // 5-min localStorage TTL expires. revalidatePath isn't enough on its own:
    // the cache key is unrelated to the path.
    updateTag(`sidebar-ocs-${profile.management_company_id}`);
    revalidatePath("/ocs");
    revalidatePath("/dashboard");

    // Multi-OC follow-on: if the parsed plan detected more than one OC, the
    // caller can prompt the manager to create the next one. The next OC's
    // index in detected_ocs[] is just the position after the one we already
    // promoted (i.e. however many OCs share this plan_number, minus the
    // count we've already created from this same draft). We surface that
    // metadata; the client decides what to do.
    const detectedOcs = (draft.parsed_json as { detected_ocs?: Array<unknown> } | null)?.detected_ocs ?? [];
    let nextOcIndex: number | null = null;
    if (detectedOcs.length > 1) {
      // Count OCs we've already created against this plan number from any
      // promoted draft on the same management_company_id.
      const { data: siblings } = await supabase
        .from("owners_corporations")
        .select("id")
        .eq("management_company_id", profile.management_company_id)
        .eq("plan_number", d.plan_number);
      const made = siblings?.length ?? 1;
      if (made < detectedOcs.length) {
        nextOcIndex = made; // 0-based index into detected_ocs[]
      }
    }

    return {
      success: true,
      ocCode: oc.short_code,
      sourceDraftId: draft.id,
      nextOcIndex,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Unexpected error" };
  }
}

// ─── selectDetectedOc — pick which OC to set up first from a multi-OC plan ──
//
// Called after a plan PDF is parsed and Gemini reports more than one OC on
// the same plan. We rewrite this draft's `draft_json` to reflect the chosen
// OC's lot schedule, address, building name, etc., so page 2 prefill matches
// the OC the manager is setting up. The OTHER detected OCs stay in
// `parsed_json.detected_ocs` and can be promoted later via the multi-OC
// follow-on dialog at wizard completion.

export async function selectDetectedOc(
  draftId: string,
  ocIndex: number,
): Promise<{ success?: true; error?: string }> {
  try {
    const { draft } = await loadDraft(draftId);
    const parsed = draft.parsed_json as ParsedPlan | null;
    const target = parsed?.detected_ocs?.[ocIndex];
    if (!target) return { error: "That OC isn't in this plan." };

    const supabase = createServerClient();
    const current = (draft.draft_json ?? {}) as DraftJson;
    const cased = titleCaseAddress({
      street_name: target.street_name ?? null,
      suburb: target.suburb ?? null,
      address: target.address ?? null,
    });
    const draftJson: DraftJson = {
      ...current,
      plan_number: parsed?.plan_of_subdivision_number ?? current.plan_number,
      oc_number: target.oc_number,
      oc_name: target.oc_name ?? undefined,
      trading_name: target.building_name ?? undefined,
      address: cased.address ?? undefined,
      street_number: target.street_number ?? undefined,
      street_name: cased.street_name ?? undefined,
      suburb: cased.suburb ?? undefined,
      state: target.state ?? "VIC",
      postcode: target.postcode ?? undefined,
      total_lots: target.lot_count ?? target.lots?.length ?? 0,
      lots: (target.lots ?? []).map((l) => ({
        lot_number: l.lot_number,
        unit_number: l.unit_number ?? undefined,
        unit_entitlement: l.unit_entitlement,
        lot_liability: l.lot_liability,
      })),
    };

    const { error } = await supabase
      .from("oc_drafts")
      .update({ draft_json: draftJson as unknown as Record<string, unknown> })
      .eq("id", draft.id);
    if (error) return { error: error.message };
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Unexpected error" };
  }
}

// ─── createDraftFromDetectedOc — fork a new draft from a multi-OC plan ──
//
// Used by the "Create the next OC from this plan?" prompt after a wizard
// completes. We copy the plan + parse from the source draft and seed page 2
// with the chosen OC's detected fields.

export async function createDraftFromDetectedOc(sourceDraftId: string, ocIndex: number) {
  try {
    const profile = await requireCompanyRole();
    if (!profile.management_company_id) {
      return { error: "No management company assigned" };
    }
    const supabase = createServerClient();

    const { data: source } = await supabase
      .from("oc_drafts")
      .select("plan_storage_key, plan_filename, plan_size_bytes, parsed_json")
      .eq("id", sourceDraftId)
      .eq("management_company_id", profile.management_company_id)
      .single();
    if (!source) return { error: "Source draft not found" };

    const detectedOcs = (source.parsed_json as { detected_ocs?: Array<{
      oc_number: number;
      oc_name?: string | null;
      address?: string | null;
      street_number?: string | null;
      street_name?: string | null;
      suburb?: string | null;
      state?: string | null;
      postcode?: string | null;
      lot_count?: number;
      building_name?: string | null;
      lots?: Array<{ lot_number: number; unit_number?: string | null; unit_entitlement: number; lot_liability: number }>;
    }> } | null)?.detected_ocs ?? [];
    const target = detectedOcs[ocIndex];
    if (!target) return { error: "That OC index isn't in the source plan." };

    const parsed = source.parsed_json as { plan_of_subdivision_number?: string | null };
    const cased = titleCaseAddress({
      street_name: target.street_name ?? null,
      suburb: target.suburb ?? null,
      address: target.address ?? null,
    });
    const draftJson: DraftJson = {
      plan_number: parsed?.plan_of_subdivision_number ?? undefined,
      oc_number: target.oc_number,
      oc_name: target.oc_name ?? undefined,
      trading_name: target.building_name ?? undefined,
      address: cased.address ?? undefined,
      street_number: target.street_number ?? undefined,
      street_name: cased.street_name ?? undefined,
      suburb: cased.suburb ?? undefined,
      state: target.state ?? "VIC",
      postcode: target.postcode ?? undefined,
      total_lots: target.lot_count ?? target.lots?.length ?? 0,
      lots: (target.lots ?? []).map((l) => ({
        lot_number: l.lot_number,
        unit_number: l.unit_number ?? undefined,
        unit_entitlement: l.unit_entitlement,
        lot_liability: l.lot_liability,
      })),
    };

    const { data: created, error } = await supabase
      .from("oc_drafts")
      .insert({
        management_company_id: profile.management_company_id,
        created_by: profile.id,
        // Keep the same plan PDF + parse cache so the user can re-parse if
        // they want or just review.
        plan_storage_key: source.plan_storage_key,
        plan_filename: source.plan_filename,
        plan_size_bytes: source.plan_size_bytes,
        parse_status: "complete",
        parsed_json: source.parsed_json,
        draft_json: draftJson as unknown as Record<string, unknown>,
        current_step: 2,    // Skip the upload step — the parse is already done.
      })
      .select("id")
      .single();
    if (error || !created) {
      console.error("createDraftFromDetectedOc: insert failed", error);
      return { error: "Couldn't start the next OC — please try again." };
    }
    return { draftId: created.id };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Unexpected error" };
  }
}
