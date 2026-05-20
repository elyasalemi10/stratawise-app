import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { getCurrentProfile, requireOCAccess } from "@/lib/auth";
import {
  getSignedDownloadUrl,
  keyFromPublicUrl,
} from "@/lib/storage/r2";

// Authorised redirect to a 15-min presigned R2 URL for inbound email
// attachments. The same access check as a regular document applies:
// the requester must belong to the OC linked on the parent
// communication_log row. Public R2 URLs on `inbound_email_attachments`
// would otherwise be guessable by anyone with the bucket pattern.
//
// ?json=true returns { url, expiresAt } instead of redirecting so
// iframes / copy-link UI can read the URL directly.

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
  const isJson = request.nextUrl.searchParams.get("json") === "true";

  let signedUrl: string;
  try {
    signedUrl = await getSignedDownloadUrl(key, 900, {
      filename: att.filename as string,
      inline: isView,
    });
  } catch (err) {
    console.error("inbox-attachments: signed URL generation failed", err);
    return NextResponse.json(
      { error: "This attachment is temporarily unavailable." },
      { status: 500 },
    );
  }

  if (isJson) {
    return NextResponse.json({
      url: signedUrl,
      expiresAt: new Date(Date.now() + 900_000).toISOString(),
    });
  }
  return NextResponse.redirect(signedUrl, { status: 302 });
}
