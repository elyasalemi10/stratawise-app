import { NextRequest, NextResponse } from "next/server";
import { requireCompanyRole } from "@/lib/auth";
import { uploadObject } from "@/lib/storage/r2";

// Uploads a contractor's public-liability certificate (or other doc) to R2
// under the firm's confidential prefix and returns the object KEY. The key is
// stored on contractors.pl_document_url and streamed back via
// /api/contractor-docs/[contractorId]. Upload happens before the contractor
// row exists (the drawer collects the file, then saves), so this route is
// company-scoped, not contractor-scoped.

const ALLOWED = ["application/pdf", "image/png", "image/jpeg"];
const MAX_SIZE = 25 * 1024 * 1024;

function sanitiseFileName(name: string): string {
  const base = name.replace(/[/\\]/g, "_").replace(/[\x00-\x1f]/g, "").trim();
  return base.slice(0, 200) || "certificate.pdf";
}

export async function POST(request: NextRequest) {
  let profile;
  try {
    profile = await requireCompanyRole();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!profile.management_company_id) {
    return NextResponse.json({ error: "No company on profile" }, { status: 400 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });
  if (!ALLOWED.includes(file.type)) {
    return NextResponse.json({ error: "File type not supported. Allowed: PDF, PNG, JPG." }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "File too large. Maximum 25MB." }, { status: 400 });
  }

  const safeName = sanitiseFileName(file.name);
  const key = `contractors/${profile.management_company_id}/${crypto.randomUUID()}-${safeName}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await uploadObject(key, buffer, file.type);

  return NextResponse.json({ key, file_name: safeName });
}
