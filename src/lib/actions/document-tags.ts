"use server";

import { requireCompanyRole, requireOCAccess } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";
import { DEFAULT_TAGS, type DocumentTag, type TagColour } from "@/lib/document-tags-shared";

/**
 * The firm's tags, seeding the defaults the first time they are asked for.
 *
 * Seeding on read rather than at company creation, so firms that existed
 * before tags did get them too, and so a firm that deletes the lot and starts
 * again is not handed them back on the next page load: the seed only runs
 * when the company has never had a tag, which the marker row records.
 */
export async function listDocumentTags(): Promise<DocumentTag[]> {
  const profile = await requireCompanyRole();
  const companyId = profile.management_company_id;
  if (!companyId) return [];
  const supabase = createServerClient();

  const [tagsRes, companyRes] = await Promise.all([
    supabase
      .from("document_tags")
      .select("id, name, colour")
      .eq("management_company_id", companyId)
      .order("name"),
    supabase
      .from("management_companies")
      .select("document_tags_seeded_at")
      .eq("id", companyId)
      .maybeSingle(),
  ]);

  const tags = (tagsRes.data ?? []) as DocumentTag[];
  const seeded = Boolean(
    (companyRes.data as { document_tags_seeded_at?: string | null } | null)
      ?.document_tags_seeded_at,
  );
  if (seeded) return tags;

  // Never seeded. This used to be inferred from the list being empty, which
  // is a different question: a manager who created one tag of their own
  // before ever opening the list made the seed think it had already run, so
  // they got their one tag and none of the defaults. It also meant a firm
  // that deliberately cleared the defaults had them handed back on the next
  // page load. The marker records the fact instead of guessing at it.
  const { error: seedErr } = await supabase.from("document_tags").upsert(
    DEFAULT_TAGS.map((t) => ({
      management_company_id: companyId,
      name: t.name,
      colour: t.colour,
    })),
    { onConflict: "management_company_id,name", ignoreDuplicates: true },
  );
  if (seedErr) {
    console.error("[document-tags] seeding failed:", seedErr);
    return tags;
  }
  // Stamped even if some rows collided: the defaults have now been offered.
  await supabase
    .from("management_companies")
    .update({ document_tags_seeded_at: new Date().toISOString() })
    .eq("id", companyId);

  const { data: after } = await supabase
    .from("document_tags")
    .select("id, name, colour")
    .eq("management_company_id", companyId)
    .order("name");
  return (after ?? []) as DocumentTag[];
}

export async function createDocumentTag(
  name: string,
  colour: TagColour,
): Promise<{ tag?: DocumentTag; error?: string }> {
  const profile = await requireCompanyRole();
  const companyId = profile.management_company_id;
  if (!companyId) return { error: "Set up your company before adding tags." };

  const trimmed = name.trim();
  if (!trimmed) return { error: "Give the tag a name." };
  if (trimmed.length > 40) return { error: "Tag names are limited to 40 characters." };

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("document_tags")
    .insert({ management_company_id: companyId, name: trimmed, colour })
    .select("id, name, colour")
    .single();

  if (error) {
    // 23505 is the case-insensitive unique index. Not an error worth a
    // scary message: they already have that tag.
    if (error.code === "23505") return { error: `"${trimmed}" already exists.` };
    console.error("[document-tags] create failed:", error);
    return { error: "Couldn't add that tag, please try again." };
  }
  return { tag: data as DocumentTag };
}

export async function deleteDocumentTag(tagId: string): Promise<{ error?: string }> {
  const profile = await requireCompanyRole();
  if (!profile.management_company_id) return { error: "Not permitted." };
  const supabase = createServerClient();
  // Scoped by company so a tag id from another firm matches nothing. The
  // links go with it via ON DELETE CASCADE.
  const { error } = await supabase
    .from("document_tags")
    .delete()
    .eq("id", tagId)
    .eq("management_company_id", profile.management_company_id);
  if (error) {
    console.error("[document-tags] delete failed:", error);
    return { error: "Couldn't remove that tag, please try again." };
  }
  return {};
}

/** Replace a document's tags with exactly this set. */
export async function setDocumentTags(
  ocId: string,
  documentId: string,
  tagIds: string[],
): Promise<{ error?: string }> {
  await requireOCAccess(ocId);
  const supabase = createServerClient();

  const { error: clearErr } = await supabase
    .from("document_tag_links")
    .delete()
    .eq("document_id", documentId);
  if (clearErr) {
    console.error("[document-tags] clear failed:", clearErr);
    return { error: "Couldn't update tags, please try again." };
  }
  if (tagIds.length === 0) return {};

  const { error } = await supabase
    .from("document_tag_links")
    .insert(tagIds.map((tag_id) => ({ document_id: documentId, tag_id })));
  if (error) {
    console.error("[document-tags] link failed:", error);
    return { error: "Couldn't update tags, please try again." };
  }
  return {};
}

/** What the manager says the document is. Empty clears it. */
export async function setDocumentDescription(
  ocId: string,
  documentId: string,
  description: string,
): Promise<{ error?: string }> {
  await requireOCAccess(ocId);
  const supabase = createServerClient();
  const { error } = await supabase
    .from("documents")
    .update({ description: description.trim() || null })
    .eq("id", documentId)
    .eq("oc_id", ocId);
  if (error) {
    console.error("[document-tags] description failed:", error);
    return { error: "Couldn't save that, please try again." };
  }
  return {};
}

/**
 * Preview state for documents still being prepared.
 *
 * The grid polls this while a .docx or .pptx is being converted, so the card
 * swaps from "Getting this one ready" to the real page without the manager
 * reloading. Deliberately narrow: three columns, only the ids asked for, and
 * scoped to an OC they can already see.
 */
export async function getDocumentPreviewStatus(
  ocId: string,
  documentIds: string[],
): Promise<Array<{ id: string; thumbnail_storage_key: string | null; pdf_status: string; ocr_status: string }>> {
  if (documentIds.length === 0) return [];
  await requireOCAccess(ocId);
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("documents")
    .select("id, thumbnail_storage_key, pdf_status, ocr_status")
    .eq("oc_id", ocId)
    .in("id", documentIds);
  if (error) {
    console.error("[documents] preview status query failed:", error);
    return [];
  }
  return (data ?? []) as Array<{
    id: string;
    thumbnail_storage_key: string | null;
    pdf_status: string;
    ocr_status: string;
  }>;
}
