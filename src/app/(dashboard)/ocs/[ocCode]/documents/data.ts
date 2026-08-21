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
  const { data } = await supabase
    .from("documents")
    .select("*")
    .eq("oc_id", ocId)
    .order("created_at", { ascending: false });

  return {
    documents: data ?? [],
    readOnly: profile?.role === "lot_owner",
  };
}
