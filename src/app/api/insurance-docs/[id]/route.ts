import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { getCurrentProfile, requireOCAccess } from "@/lib/auth";
import {
  getSignedDownloadUrl,
  keyFromPublicUrl,
} from "@/lib/storage/r2";

// Authorised redirect for insurance policy certificates of currency.
// Same shape as /api/documents/[id]: ACL check (must have OC access),
// 302 to a 15-minute presigned R2 URL. Replaces the previous practice
// of rendering insurance_policies.document_url directly in <a href>.
//
// Where the policy row has a source_document_id pointing into the
// `documents` table, prefer that — it's already covered by the same
// path-prefix convention.

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

  // Prefer the canonical `documents` row when one is linked — gives us
  // file_name + mime_type for accurate Content-Disposition headers.
  if (policy.source_document_id) {
    const { data: doc } = await supabase
      .from("documents")
      .select("file_path, file_name")
      .eq("id", policy.source_document_id)
      .maybeSingle();
    if (doc?.file_path) {
      const isView = request.nextUrl.searchParams.get("view") === "true";
      const signedUrl = await getSignedDownloadUrl(doc.file_path as string, 900, {
        filename: (doc.file_name as string) ?? "policy.pdf",
        inline: isView,
      });
      if (request.nextUrl.searchParams.get("json") === "true") {
        return NextResponse.json({
          url: signedUrl,
          expiresAt: new Date(Date.now() + 900_000).toISOString(),
        });
      }
      return NextResponse.redirect(signedUrl, { status: 302 });
    }
  }

  // Fall back to the public-URL-derived key on the policy row itself.
  const key = keyFromPublicUrl(policy.document_url as string | null);
  if (!key) {
    return NextResponse.json({ error: "Certificate missing" }, { status: 404 });
  }
  const filename = `${policy.provider ?? "policy"}-${policy.policy_number ?? policy.id}.pdf`;
  const isView = request.nextUrl.searchParams.get("view") === "true";
  let signedUrl: string;
  try {
    signedUrl = await getSignedDownloadUrl(key, 900, {
      filename,
      inline: isView,
    });
  } catch (err) {
    console.error("insurance-docs: signed URL generation failed", err);
    return NextResponse.json(
      { error: "This certificate is temporarily unavailable." },
      { status: 500 },
    );
  }
  if (request.nextUrl.searchParams.get("json") === "true") {
    return NextResponse.json({
      url: signedUrl,
      expiresAt: new Date(Date.now() + 900_000).toISOString(),
    });
  }
  return NextResponse.redirect(signedUrl, { status: 302 });
}
