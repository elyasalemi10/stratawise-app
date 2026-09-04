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

  const { data: existing } = await supabase
    .from("document_tags")
    .select("id, name, colour")
    .eq("management_company_id", companyId)
    .order("name");

  if (existing && existing.length > 0) return existing as DocumentTag[];

  // Never seeded. Insert the defaults and return them. ON CONFLICT DO
  // NOTHING via upsert, so two tabs racing this cannot duplicate.
  const { data: seeded } = await supabase
    .from("document_tags")
    .upsert(
      DEFAULT_TAGS.map((t) => ({
        management_company_id: companyId,
        name: t.name,
        colour: t.colour,
      })),
      { onConflict: "management_company_id,name", ignoreDuplicates: true },
    )
    .select("id, name, colour");

  if (seeded && seeded.length > 0) return seeded as DocumentTag[];

  // The upsert ignored everything, which means another request seeded them
  // between our read and our write. Read again.
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
