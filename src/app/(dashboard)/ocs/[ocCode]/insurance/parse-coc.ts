"use server";

import { requireCompanyRole, requireOCAccess } from "@/lib/auth";
import { uploadObject, deleteObject } from "@/lib/storage/r2";
import { parseInsurancePdf, type ParsedInsurancePolicy } from "@/lib/parse-insurance";
import { createServerClient } from "@/lib/supabase";

// Insurance "Certificate of Currency" upload + structured-extraction
// for the post-wizard insurance page. Mirrors the wizard's
// uploadAndParseCoC but scopes auth to the saved OC instead of a draft.
// Persists nothing yet , the caller takes the returned fields and
// shows them in a form so the manager can review / edit before save.

export async function uploadAndParseInsuranceCoc(
  ocId: string,
  formData: FormData,
): Promise<{
  storage_key?: string;
  public_url?: string;
  /** Documents row id for the uploaded CoC. The drawer hands this back
   *  to createInsurancePolicy via attachDocumentToPolicy() so the
   *  document is permanently linked to the saved policy , the policy
   *  detail page can then show "Source: filename.pdf" without scanning. */
  document_id?: string;
  insured_name?: string | null;
  /** PS number Gemini read off the certificate. Returned so the
   *  drawer can compare against the OC's saved plan_number and ask
   *  the manager to confirm if they don't match (defensive vs the
   *  wrong CoC being uploaded against the wrong OC). */
  plan_number?: string | null;
  /** True when the parsed plan_number matches the OC's plan_number
   *  (case-insensitive, whitespace-stripped). False = mismatch, null
   *  = Gemini didn't find one on the certificate. */
  ps_match?: boolean | null;
  policies?: ParsedInsurancePolicy[];
  error?: string;
}> {
  await requireCompanyRole();
  await requireOCAccess(ocId);

  const file = formData.get("file");
  if (!(file instanceof File)) return { error: "No file uploaded." };
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    return { error: "Only PDF files are accepted." };
  }
  if (file.size > 25 * 1024 * 1024) return { error: "Certificate exceeds 25 MB." };

  const key = `insurance/${ocId}/${crypto.randomUUID()}.pdf`;
  const buf = Buffer.from(await file.arrayBuffer());
  try {
    await uploadObject(key, buf, "application/pdf");
  } catch (err) {
    console.error("uploadAndParseInsuranceCoc: R2 upload failed", err);
    return { error: "Couldn't save your file, please try again." };
  }

  let parsed;
  try {
    parsed = await parseInsurancePdf(buf);
  } catch (err) {
    console.error("uploadAndParseInsuranceCoc: Gemini parse failed", err);
    // Don't roll back the upload , the manager may still want to keep
    // the file even if Gemini couldn't read it. We return the key so
    // they can attach it manually.
    return { storage_key: key, public_url: `/api/insurance-doc?key=${encodeURIComponent(key)}`, policies: [], insured_name: null };
  }

  if (!parsed.is_insurance_certificate) {
    void deleteObject(key).catch(() => {});
    return { error: `That didn't look like a certificate of currency (looks like: ${parsed.document_type_guess || "another document"}). Upload a different PDF or skip and enter details manually.` };
  }

  // Drop the file row into documents so the manager can find it in
  // the docs page later. Category is "certificate_of_currency" (not
  // the generic "insurance") so the documents page can render the
  // right badge + filter chip, and so we know which docs to back-link
  // to a policy when the manager finishes the create flow.
  const supabase = createServerClient();
  const { data: docRow } = await supabase
    .from("documents")
    .insert({
      oc_id: ocId,
      file_name: file.name,
      file_path: key,
      file_size: file.size,
      mime_type: "application/pdf",
      category: "certificate_of_currency",
      is_confidential: true,
      ocr_status: "complete",
    })
    .select("id")
    .single();
  const documentId = (docRow as { id: string } | null)?.id;

  // Compare the certificate's plan_number against the OC's so we can
  // warn the manager when the wrong CoC was uploaded against the wrong
  // OC. Strip whitespace + uppercase before comparing so "ps 812345 x"
  // matches "PS812345X".
  const { data: ocRow } = await supabase
    .from("owners_corporations")
    .select("plan_number")
    .eq("id", ocId)
    .maybeSingle();
  const ocPlan = (ocRow as { plan_number: string | null } | null)?.plan_number?.replace(/\s+/g, "").toUpperCase() ?? null;
  const certPlan = parsed.plan_number?.replace(/\s+/g, "").toUpperCase() ?? null;
  const psMatch = !certPlan ? null : (ocPlan === certPlan);

  return {
    storage_key: key,
    public_url: `/api/insurance-doc?key=${encodeURIComponent(key)}`,
    document_id: documentId,
    insured_name: parsed.insured_name,
    plan_number: parsed.plan_number ?? null,
    ps_match: psMatch,
    policies: parsed.policies,
  };
}

/**
 * Back-links a previously-uploaded CoC document to the insurance
 * policy that was created from it. Called by AddPolicyDrawer right
 * after createInsurancePolicy returns, so the documents row gains
 * insurance_policy_id and the policy detail page can render
 * "Source: filename.pdf" without scanning.
 */
export async function attachDocumentToPolicy(
  ocId: string,
  documentId: string,
  policyId: string,
): Promise<{ error?: string }> {
  await requireCompanyRole();
  await requireOCAccess(ocId);
  const supabase = createServerClient();
  const { error } = await supabase
    .from("documents")
    .update({ insurance_policy_id: policyId })
    .eq("id", documentId)
    .eq("oc_id", ocId);
  if (error) return { error: error.message };
  return {};
}
