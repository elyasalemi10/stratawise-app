"use server";

import { requireCompanyRole, requireOCAccess } from "@/lib/auth";
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

/**
 * Documents whose CONTENTS match, by id.
 *
 * The page filter already matches the filename, the manager's note and the
 * tags, and it does that in the browser against data it already has, which
 * is why it is instant. What it cannot do is match a word that only appears
 * on page four of a scan, and being able to is the entire reason every
 * upload goes through OCR.
 *
 * The text itself deliberately does not travel to the client. It is the
 * biggest column on the row by an order of magnitude, and shipping every
 * document's full text to render a grid of thumbnails would pay for a
 * search nobody has run yet on every page load.
 *
 * Postgres does the matching, against the generated tsvector and its GIN
 * index. Returns ids only: the client already holds the rows.
 */
export async function searchDocumentContents(
  ocId: string,
  query: string,
): Promise<string[]> {
  await requireOCAccess(ocId);
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("documents")
    .select("id")
    .eq("oc_id", ocId)
    // websearch_to_tsquery, not plainto_: it takes what a person types,
    // quoted phrases and all, and never raises on punctuation the way
    // to_tsquery does.
    .textSearch("ocr_search", trimmed, { type: "websearch", config: "english" })
    .limit(200);

  if (error) {
    console.error("searchDocumentContents failed", error);
    return [];
  }
  return ((data ?? []) as Array<{ id: string }>).map((d) => d.id);
}
