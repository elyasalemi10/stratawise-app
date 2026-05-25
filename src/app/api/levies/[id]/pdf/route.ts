import { NextResponse, type NextRequest } from "next/server";
import { getCurrentProfile, requireOCAccess } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";
import { fetchObject, keyFromPublicUrl } from "@/lib/storage/r2";

// API routes MUST be node runtime so we have the full cookie store; the
// auth check below relies on getCurrentProfile reading the session cookie.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Authenticated levy-PDF download. Replaces the old "stick the R2 public URL
// in pdf_url and link directly" pattern, so the PDF can live in the
// confidential R2 bucket. The body is streamed back to the caller.
//
// Two storage shapes are supported:
//   - NEW (post-confidential migration): pdf_url is `/api/levies/{id}/pdf`,
//     the object lives in the confidential bucket at `levies/{ocId}/{ref}.pdf`.
//   - OLD: pdf_url is a full https URL to the public R2 CDN; we fall back
//     to keyFromPublicUrl + fetchObject for those rows.
export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  // Explicit auth check up-front. Belt-and-braces alongside middleware so a
  // misconfigured matcher / edge route can never expose a levy PDF to an
  // anonymous request.
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const supabase = createServerClient();

  const { data: levy, error } = await supabase
    .from("levy_notices")
    .select("id, oc_id, lot_id, reference_number, pdf_url")
    .eq("id", id)
    .maybeSingle();
  if (error || !levy) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // requireOCAccess enforces strata_manager + same management company OR
  // super_admin OR active lot_owner membership in the OC. Lot-level scoping
  // for lot owners (so they only see their own levy, not other owners' in
  // the same OC) is a follow-up , the data is still scoped per OC today.
  try {
    await requireOCAccess(levy.oc_id);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  void levy.lot_id;

  // Resolve the R2 key. New rows: deterministic key from ocId + reference.
  // Old rows: extract from the legacy public URL.
  let key = `levies/${levy.oc_id}/${levy.reference_number}.pdf`;
  if (levy.pdf_url) {
    const legacyKey = keyFromPublicUrl(levy.pdf_url);
    if (legacyKey) key = legacyKey;
  }

  try {
    const buffer = await fetchObject(key);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${levy.reference_number}.pdf"`,
        "Cache-Control": "private, max-age=600",
      },
    });
  } catch (err) {
    console.error("Levy PDF fetch failed", { id, key, err });
    return NextResponse.json({ error: "PDF unavailable" }, { status: 502 });
  }
}
