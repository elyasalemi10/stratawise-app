import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { getCurrentProfile, requireOCAccess } from "@/lib/auth";
import { fetchObject } from "@/lib/storage/r2";

// Streams a meeting's notice PDF (meetings.notice_pdf_url holds the R2 key)
// through this authenticated, OC-scoped route.

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!UUID_REGEX.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const supabase = createServerClient();
  const { data: meeting } = await supabase
    .from("meetings")
    .select("id, oc_id, notice_pdf_url, reference_number")
    .eq("id", id)
    .maybeSingle();
  if (!meeting || !meeting.notice_pdf_url) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    await requireOCAccess(meeting.oc_id as string);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const isView = request.nextUrl.searchParams.get("view") === "true";
  const filename = `${meeting.reference_number ?? "meeting-notice"}.pdf`;
  try {
    const body = await fetchObject(meeting.notice_pdf_url as string);
    return new NextResponse(new Uint8Array(body), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": isView ? "inline" : `attachment; filename="${encodeURIComponent(filename)}"`,
        "Cache-Control": "private, max-age=0, no-store",
      },
    });
  } catch (err) {
    console.error("meeting-docs GET failed:", err);
    return NextResponse.json({ error: "Could not load notice" }, { status: 500 });
  }
}
