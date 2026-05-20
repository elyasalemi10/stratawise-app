import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { getCurrentProfile, requireOCAccess } from "@/lib/auth";
import { fetchObject, keyFromPublicUrl } from "@/lib/storage/r2";

// Streams an inbound email attachment through this authenticated route
// (NOT a presigned redirect — that would be shareable for its TTL). Every
// fetch re-runs the OC-access / recipient check, so a copied URL is
// useless to anyone without access.

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
    return NextResponse.json({ error: "Attachment not found" }, { status: 404 });
  }

  const supabase = createServerClient();
  const { data: att } = await supabase
    .from("inbound_email_attachments")
    .select("id, filename, mime_type, r2_key, r2_url, communication_log_id")
    .eq("id", id)
    .maybeSingle();
  if (!att) {
    return NextResponse.json({ error: "Attachment not found" }, { status: 404 });
  }

  const { data: logRow } = await supabase
    .from("communication_log")
    .select("oc_id, recipient_id")
    .eq("id", att.communication_log_id)
    .maybeSingle();

  // If the row is OC-scoped, require OC access. Personal manager
  // inbound rows (no oc_id, recipient_id = the manager's profile_id)
  // are only accessible to that profile.
  if (logRow?.oc_id) {
    try {
      await requireOCAccess(logRow.oc_id as string);
    } catch {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } else if (logRow?.recipient_id && logRow.recipient_id !== profile.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Derive the R2 key from the stored url if the dedicated column is
  // missing (older rows pre-migration). Fall back to the public URL
  // when the key can't be recovered — better than 500 for the user.
  const key =
    (att.r2_key as string | null) ?? keyFromPublicUrl(att.r2_url as string | null);
  if (!key) {
    return NextResponse.json({ error: "Attachment storage missing" }, { status: 404 });
  }

  const isView = request.nextUrl.searchParams.get("view") === "true";

  let body: Buffer;
  try {
    body = await fetchObject(key);
  } catch {
    return NextResponse.json({ error: "Attachment not found in storage" }, { status: 404 });
  }

  const filename = (att.filename as string) || "attachment";
  const disposition = isView
    ? "inline"
    : `attachment; filename="${encodeURIComponent(filename)}"`;
  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": (att.mime_type as string) || "application/octet-stream",
      "Content-Disposition": disposition,
      "Cache-Control": "private, max-age=0, no-store",
    },
  });
}
