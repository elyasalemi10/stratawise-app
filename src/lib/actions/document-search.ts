"use server";

import { requireCompanyRole } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";

export type DocumentSearchHit = {
  id: string;
  file_name: string;
  category: string;
  oc_id: string;
  oc_name: string | null;
  oc_short_code: string | null;
  lot_id: string | null;
  rank: number;
  /** ts_headline with `<b>...</b>` highlights around matches. Already sanitised. */
  snippet: string | null;
  ocr_status: string;
  created_at: string;
};

/**
 * Full-text search over documents the caller's management company can see.
 * Joins `owners_corporations` for the OC name/short_code so the search row
 * can deep-link to the doc's OC. Limit 25 , anything more would dilute the
 * "top-of-search" hit list; we paginate if it ever matters.
 */
export async function searchDocuments(query: string): Promise<{ hits: DocumentSearchHit[]; error?: string }> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return { hits: [] };

  const profile = await requireCompanyRole();
  if (!profile.management_company_id) {
    return { hits: [], error: "No management company assigned" };
  }
  const supabase = createServerClient();

  // Postgres FTS scores `ocr_search` against the plainto_tsquery. We use a
  // raw SQL function via `rpc` because Supabase's PostgREST doesn't surface
  // ts_rank / ts_headline through `.select()`.
  const { data, error } = await supabase.rpc("search_documents", {
    p_management_company_id: profile.management_company_id,
    p_query: trimmed,
  });

  if (error) {
    console.error("searchDocuments: rpc failed", error);
    return { hits: [], error: "Search is temporarily unavailable." };
  }
  return { hits: (data ?? []) as DocumentSearchHit[] };
}
