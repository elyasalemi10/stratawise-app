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
  insured_name?: string | null;
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
  // the docs page later, with OCR-ready storage path.
  const supabase = createServerClient();
  await supabase.from("documents").insert({
    oc_id: ocId,
    file_name: file.name,
    file_path: key,
    file_size: file.size,
    mime_type: "application/pdf",
    category: "insurance",
    is_confidential: true,
    ocr_status: "complete",
  });

  return {
    storage_key: key,
    public_url: `/api/insurance-doc?key=${encodeURIComponent(key)}`,
    insured_name: parsed.insured_name,
    policies: parsed.policies,
  };
}
