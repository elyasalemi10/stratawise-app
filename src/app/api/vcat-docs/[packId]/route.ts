import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { getCurrentProfile, requireOCAccess } from "@/lib/auth";
import { fetchObject } from "@/lib/storage/r2";

// Streams a generated VCAT pack ZIP through this authenticated, OC-scoped route.

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ packId: string }> },
) {
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { packId } = await params;
  if (!UUID_REGEX.test(packId)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const supabase = createServerClient();
  const { data: pack } = await supabase
    .from("vcat_packs")
    .select("id, oc_id, zip_key")
    .eq("id", packId)
    .maybeSingle();
  if (!pack || !pack.zip_key) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    await requireOCAccess(pack.oc_id as string);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await fetchObject(pack.zip_key as string);
    return new NextResponse(new Uint8Array(body), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="VCAT-pack-${packId.slice(0, 8)}.zip"`,
        "Cache-Control": "private, max-age=0, no-store",
      },
    });
  } catch (err) {
    console.error("vcat-docs GET failed:", err);
    return NextResponse.json({ error: "Could not load pack" }, { status: 500 });
  }
}
