import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { getCurrentProfile, requireCompanyRole, requireOCAccess } from "@/lib/auth";
import { fetchObject, deleteObject } from "@/lib/storage/r2";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function loadDocument(id: string) {
  if (!UUID_REGEX.test(id)) return null;
  const supabase = createServerClient();
  const { data } = await supabase
    .from("documents")
    .select("id, oc_id, lot_id, file_path, file_name, mime_type, is_confidential")
    .eq("id", id)
    .single();
  return data;
}

// GET — proxy file from R2 (avoids CORS issues with redirects)
// ?view=true returns inline (for preview), otherwise attachment (for download)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const doc = await loadDocument(id);
  if (!doc) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  try {
    await requireOCAccess(doc.oc_id);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Confidential documents are only visible to company staff, not lot owners.
  if (doc.is_confidential && profile.role === "lot_owner") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: Buffer;
  try {
    body = await fetchObject(doc.file_path);
  } catch {
    return NextResponse.json({ error: "File not found in storage" }, { status: 404 });
  }

  const isView = request.nextUrl.searchParams.get("view") === "true";
  const disposition = isView ? "inline" : `attachment; filename="${encodeURIComponent(doc.file_name)}"`;

  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": doc.mime_type || "application/octet-stream",
      "Content-Disposition": disposition,
      "Cache-Control": "private, max-age=3600",
    },
  });
}

// PATCH — rename document (DB only, R2 key unchanged)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let profile;
  try {
    profile = await requireCompanyRole();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const doc = await loadDocument(id);
  if (!doc) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  try {
    await requireOCAccess(doc.oc_id);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { name } = await request.json();
  if (!name || typeof name !== "string" || name.trim().length === 0 || name.length > 255) {
    return NextResponse.json({ error: "Name must be 1–255 characters" }, { status: 400 });
  }

  const supabase = createServerClient();
  const newName = name.trim().replace(/[/\\]/g, "_").slice(0, 255);

  const { data: updated, error } = await supabase
    .from("documents")
    .update({ file_name: newName })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await supabase.from("audit_log").insert({
    profile_id: profile.id,
    oc_id: doc.oc_id,
    action: "rename",
    entity_type: "document",
    entity_id: id,
    before_state: { file_name: doc.file_name },
    after_state: { file_name: newName },
  });

  return NextResponse.json(updated);
}

// DELETE — remove from R2 and DB
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let profile;
  try {
    profile = await requireCompanyRole();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const doc = await loadDocument(id);
  if (!doc) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  try {
    await requireOCAccess(doc.oc_id);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    await deleteObject(doc.file_path);
  } catch {
    // Continue even if R2 delete fails — DB is source of truth
  }

  const supabase = createServerClient();
  const { error } = await supabase
    .from("documents")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await supabase.from("audit_log").insert({
    profile_id: profile.id,
    oc_id: doc.oc_id,
    action: "delete",
    entity_type: "document",
    entity_id: id,
    before_state: { file_name: doc.file_name, file_path: doc.file_path },
  });

  return NextResponse.json({ success: true });
}
