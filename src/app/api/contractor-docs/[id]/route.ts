import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireCompanyRole } from "@/lib/auth";
import { fetchObject } from "@/lib/storage/r2";

// Streams a contractor's stored document (pl_document_url holds the R2 key)
// through this authenticated, company-scoped route. Never a presigned
// redirect , the bank details + insurance cert are confidential.

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  let profile;
  try {
    profile = await requireCompanyRole();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  if (!UUID_REGEX.test(id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const supabase = createServerClient();
  const { data: contractor } = await supabase
    .from("contractors")
    .select("id, management_company_id, pl_document_url, business_name")
    .eq("id", id)
    .maybeSingle();

  if (
    !contractor ||
    contractor.management_company_id !== profile.management_company_id ||
    !contractor.pl_document_url
  ) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const key = contractor.pl_document_url as string;
  const ext = key.split(".").pop()?.toLowerCase();
  const mime =
    ext === "png" ? "image/png" : ext === "jpg" || ext === "jpeg" ? "image/jpeg" : "application/pdf";

  try {
    const body = await fetchObject(key);
    return new NextResponse(new Uint8Array(body), {
      headers: {
        "Content-Type": mime,
        "Content-Disposition": "inline",
        "Cache-Control": "private, max-age=0, no-store",
      },
    });
  } catch (err) {
    console.error("contractor-docs GET failed:", err);
    return NextResponse.json({ error: "Could not load document" }, { status: 500 });
  }
}
