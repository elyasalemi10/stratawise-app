"use server";

import { requireOCAccess, getCurrentProfile } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";

// Aggregate fetch for the OC documents library. One round trip, cached by
// the client hook under `documents:${ocId}`.
//
// Auth lives here rather than in page.tsx: the page is only a shell now, so
// a check up there would run once and be skipped on every refresh after.

export interface DocumentsPageData {
  documents: Array<Record<string, unknown>>;
  readOnly: boolean;
}

export async function getDocumentsPageData(ocId: string): Promise<DocumentsPageData> {
  const [profile] = await Promise.all([getCurrentProfile(), requireOCAccess(ocId)]);
  const supabase = createServerClient();
  // Documents and their tag links in one wave: the links table is tiny and
  // joining it per document would be a round trip per card.
  const [docsRes, linksRes] = await Promise.all([
    // Everything except ocr_text. A scanned twenty-page report carries tens
    // of kilobytes of it, and the grid shows none of it: the search that
    // needs it runs in Postgres against the tsvector index instead.
    supabase
      .from("documents")
      .select(
        "id, oc_id, lot_id, category, file_name, file_path, file_size, mime_type, is_confidential, uploaded_by, created_at, ocr_status, ocr_page_count, ocr_provider, description, original_filename, insurance_policy_id, recurring_job_id, pdf_storage_key, pdf_status, pdf_page_count, thumbnail_storage_key",
      )
      .eq("oc_id", ocId)
      .order("created_at", { ascending: false }),
    // Scoped through the join rather than by collecting ids first, so this
    // does not have to wait on the documents query and the two go out
    // together.
    supabase
      .from("document_tag_links")
      .select("document_id, document_tags(id, name, colour), documents!inner(oc_id)")
      .eq("documents.oc_id", ocId),
  ]);

  const tagsByDoc = new Map<string, Array<{ id: string; name: string; colour: string }>>();
  for (const link of (linksRes.data ?? []) as unknown as Array<{
    document_id: string;
    // PostgREST returns an embedded relation as an array even when the FK
    // makes it at most one row.
    document_tags: Array<{ id: string; name: string; colour: string }> | { id: string; name: string; colour: string } | null;
  }>) {
    const tag = Array.isArray(link.document_tags) ? link.document_tags[0] : link.document_tags;
    if (!tag) continue;
    const list = tagsByDoc.get(link.document_id) ?? [];
    list.push(tag);
    tagsByDoc.set(link.document_id, list);
  }

  return {
    documents: (docsRes.data ?? []).map((d) => ({
      ...(d as Record<string, unknown>),
      tags: tagsByDoc.get((d as { id: string }).id) ?? [],
    })) as DocumentsPageData["documents"],
    readOnly: profile?.role === "lot_owner",
  };
}
