import { NextRequest, NextResponse } from "next/server";
import { requireCompanyRole } from "@/lib/auth";
import { lookupAbn, isValidAbnFormat } from "@/lib/abr";

// Company-scoped ABN lookup for the contractor drawer. Returns the entity /
// business name + GST status to prefill the form. Soft-fails (200 with
// found:false) when the ABR GUID isn't configured or the ABN isn't found, so
// the field simply stays manual.

export async function GET(request: NextRequest) {
  try {
    await requireCompanyRole();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const abn = request.nextUrl.searchParams.get("abn") ?? "";
  if (!isValidAbnFormat(abn)) {
    return NextResponse.json({ found: false, reason: "invalid" });
  }

  const result = await lookupAbn(abn);
  if (!result) return NextResponse.json({ found: false, reason: "not_found" });
  return NextResponse.json({ found: true, result });
}
