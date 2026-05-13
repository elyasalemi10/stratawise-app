"use server";

import { requireCompanyRole, requireOCAccess } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";
import { getSignedDownloadUrl } from "@/lib/storage/r2";

export type OCRule = {
  id: string;
  rule_number: string;
  heading: string | null;
  body: string;
  page_number: number | null;
  bbox: { x: number; y: number; w: number; h: number } | null;
  ordinal: number;
  confidence: number | null;
  source_document_id: string | null;
};

export type OCRulesPayload = {
  rules: OCRule[];
  sourceDocument: { id: string; file_name: string; file_path: string } | null;
};

export async function getOCRules(ocId: string): Promise<OCRulesPayload> {
  await requireCompanyRole();
  await requireOCAccess(ocId);
  const supabase = createServerClient();

  const { data: rules } = await supabase
    .from("oc_rules")
    .select("id, rule_number, heading, body, page_number, bbox, ordinal, confidence, source_document_id")
    .eq("oc_id", ocId)
    .order("ordinal", { ascending: true });

  let sourceDocument: OCRulesPayload["sourceDocument"] = null;
  const sourceDocId = rules?.[0]?.source_document_id;
  if (sourceDocId) {
    const { data: doc } = await supabase
      .from("documents")
      .select("id, file_name, file_path")
      .eq("id", sourceDocId)
      .single();
    if (doc) sourceDocument = doc;
  }

  return {
    rules: (rules ?? []) as OCRule[],
    sourceDocument,
  };
}

/**
 * Returns a short-lived signed URL the rules viewer can iframe to. Browsers
 * understand `#page=N` and `#page=N&zoom=auto` anchors in PDF URLs to jump
 * to the page (Chromium / Firefox / Edge). Safari ignores the anchor on
 * native PDF view; we render the whole doc and the manager scrolls.
 */
export async function getRulesSourceUrl(ocId: string): Promise<{ url: string | null }> {
  await requireCompanyRole();
  await requireOCAccess(ocId);
  const supabase = createServerClient();
  const { data: doc } = await supabase
    .from("documents")
    .select("file_path")
    .eq("oc_id", ocId)
    .eq("category", "oc_rules")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!doc) return { url: null };
  try {
    const url = await getSignedDownloadUrl(doc.file_path, 60 * 60); // 1h
    return { url };
  } catch (err) {
    console.error("getRulesSourceUrl: signed URL failed", err);
    return { url: null };
  }
}
