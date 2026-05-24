import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { getCurrentProfile, requireOCAccess } from "@/lib/auth";
import { fetchObject, keyFromPublicUrl } from "@/lib/storage/r2";

// Streams an insurance certificate of currency through this authenticated
// route (NOT a presigned redirect , that would be shareable for its TTL).
// Prefers the canonical `documents` row when source_document_id is linked
// (gives accurate file_name + mime_type); else derives the key from the
// stored public URL on the policy row.

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const dynamic = "force-dynamic";

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

function streamResponse(
  body: Buffer,
  filename: string,
  mimeType: string,
  isView: boolean,
): NextResponse {
  const disposition = isView
    ? "inline"
    : `attachment; filename="${encodeURIComponent(filename)}"`;
  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": mimeType || "application/octet-stream",
      "Content-Disposition": disposition,
      "Cache-Control": "private, max-age=0, no-store",
    },
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return unauthorizedResponse(request);
  }
  const { id } = await params;
  if (!UUID_REGEX.test(id)) {
    return NextResponse.json({ error: "Policy not found" }, { status: 404 });
  }

  const supabase = createServerClient();
  const { data: policy } = await supabase
    .from("insurance_policies")
    .select("id, oc_id, document_url, source_document_id, policy_number, provider")
    .eq("id", id)
    .maybeSingle();
  if (!policy) {
    return NextResponse.json({ error: "Policy not found" }, { status: 404 });
  }
  try {
    await requireOCAccess(policy.oc_id as string);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const isView = request.nextUrl.searchParams.get("view") === "true";

  // Prefer the canonical `documents` row when one is linked.
  if (policy.source_document_id) {
    const { data: doc } = await supabase
      .from("documents")
      .select("file_path, file_name, mime_type")
      .eq("id", policy.source_document_id)
      .maybeSingle();
    if (doc?.file_path) {
      try {
        const body = await fetchObject(doc.file_path as string);
        return streamResponse(
          body,
          (doc.file_name as string) ?? "policy.pdf",
          (doc.mime_type as string) ?? "application/pdf",
          isView,
        );
      } catch {
        return NextResponse.json({ error: "Certificate not found in storage" }, { status: 404 });
      }
    }
  }

  // Fall back to the public-URL-derived key on the policy row itself.
  const key = keyFromPublicUrl(policy.document_url as string | null);
  if (!key) {
    return NextResponse.json({ error: "Certificate missing" }, { status: 404 });
  }
  const filename = `${policy.provider ?? "policy"}-${policy.policy_number ?? policy.id}.pdf`;
  try {
    const body = await fetchObject(key);
    return streamResponse(body, filename, "application/pdf", isView);
  } catch {
    return NextResponse.json({ error: "Certificate not found in storage" }, { status: 404 });
  }
}
