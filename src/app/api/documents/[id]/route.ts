import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { getCurrentProfile, requireCompanyRole, requireOCAccess } from "@/lib/auth";
import { deleteObject, fetchObject } from "@/lib/storage/r2";

// Unauthenticated browser hit → bounce to login with a return path so a
// shared link prompts sign-in rather than 401-ing. Fetch / XHR clients
// (Accept: application/json) get a plain 401 so client code can handle it.
function unauthorizedResponse(request: NextRequest): NextResponse {
  const accept = request.headers.get("accept") ?? "";
  if (accept.includes("text/html")) {
    const url = request.nextUrl.clone();
    const target = `${url.pathname}${url.search}`;
    url.pathname = "/";
    url.search = `?next=${encodeURIComponent(target)}`;
    return NextResponse.redirect(url, { status: 302 });
  }
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

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

// GET , authorise + redirect to a short-lived (15 min) presigned R2 URL.
//
// Strata documents are sensitive (financial statements, insurance certs,
// breach notices). We STREAM the bytes through this authenticated route
// rather than redirecting to a presigned R2 URL , a presigned URL is
// shareable by anyone for its TTL, which leaks the document. Streaming
// means every single fetch re-runs the auth + OC-access + confidentiality
// checks, so a copied URL is useless to anyone who isn't signed in with
// access to that OC.
//
// ?view=true → inline disposition (PDF previews); otherwise attachment.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return unauthorizedResponse(request);
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

  const isView = request.nextUrl.searchParams.get("view") === "true";

  let body: Buffer;
  try {
    body = await fetchObject(doc.file_path);
  } catch {
    return NextResponse.json({ error: "File not found in storage" }, { status: 404 });
  }

  const disposition = isView
    ? "inline"
    : `attachment; filename="${encodeURIComponent(doc.file_name)}"`;

  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": doc.mime_type || "application/octet-stream",
      "Content-Disposition": disposition,
      // private = never cached by shared proxies/CDN; only the
      // authenticated browser may cache it briefly.
      "Cache-Control": "private, max-age=0, no-store",
    },
  });
}

// PATCH , rename document (DB only, R2 key unchanged)
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
    metadata: doc.lot_id ? { lot_id: doc.lot_id } : null,
  });

  return NextResponse.json(updated);
}

// DELETE , remove from R2 and DB
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
    // Continue even if R2 delete fails , DB is source of truth
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
    metadata: doc.lot_id ? { lot_id: doc.lot_id } : null,
  });

  return NextResponse.json({ success: true });
}
