"use server";

import { requireCompanyRole, requireOCAccess } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";
import type { DocumentRecord } from "@/lib/validations/documents";

export async function getOCDocuments(ocId: string): Promise<DocumentRecord[]> {
  await requireOCAccess(ocId);
  const supabase = createServerClient();

  const { data } = await supabase
    .from("documents")
    .select("*")
    .eq("oc_id", ocId)
    .is("lot_id", null)
    .order("created_at", { ascending: false });

  return (data as DocumentRecord[]) ?? [];
}

export async function getLotDocuments(ocId: string, lotId: string): Promise<DocumentRecord[]> {
  await requireOCAccess(ocId);
  const supabase = createServerClient();

  const { data } = await supabase
    .from("documents")
    .select("*")
    .eq("oc_id", ocId)
    .eq("lot_id", lotId)
    .order("created_at", { ascending: false });

  return (data as DocumentRecord[]) ?? [];
}

export async function renameDocument(documentId: string, newName: string) {
  const profile = await requireCompanyRole();
  const supabase = createServerClient();

  const { data: doc } = await supabase
    .from("documents")
    .select("oc_id, file_name")
    .eq("id", documentId)
    .single();

  if (!doc) return { error: "Document not found" };

  await requireOCAccess(doc.oc_id);

  const { error } = await supabase
    .from("documents")
    .update({ file_name: newName.trim() })
    .eq("id", documentId);

  if (error) return { error: error.message };

  await supabase.from("audit_log").insert({
    profile_id: profile.id,
    oc_id: doc.oc_id,
    action: "update",
    entity_type: "document",
    entity_id: documentId,
    before_state: { file_name: doc.file_name },
    after_state: { file_name: newName.trim() },
  });

  return { success: true };
}

export async function deleteDocument(documentId: string) {
  const profile = await requireCompanyRole();
  const supabase = createServerClient();

  const { data: doc } = await supabase
    .from("documents")
    .select("oc_id, file_name, file_path")
    .eq("id", documentId)
    .single();

  if (!doc) return { error: "Document not found" };

  await requireOCAccess(doc.oc_id);

  // Delete via API route (which handles R2 + DB)
  // But since we're server-side, just delete from DB directly
  // R2 cleanup happens via the API route or can be a background job
  const { error } = await supabase
    .from("documents")
    .delete()
    .eq("id", documentId);

  if (error) return { error: error.message };

  await supabase.from("audit_log").insert({
    profile_id: profile.id,
    oc_id: doc.oc_id,
    action: "delete",
    entity_type: "document",
    entity_id: documentId,
    before_state: { file_name: doc.file_name, file_path: doc.file_path },
    after_state: null,
  });

  return { success: true };
}
