import { NextRequest, NextResponse } from "next/server";
import { requireCompanyRole, requireOCAccess } from "@/lib/auth";
import { uploadObject } from "@/lib/storage/r2";

// Uploads a recurring-job document to R2 immediately (so the manager sees
// progress straight away, like contractor uploads) and returns the object KEY
// + metadata. The documents row is created on save via linkRecurringJobDocs.

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED = ["application/pdf", "image/png", "image/jpeg", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
const MAX_SIZE = 25 * 1024 * 1024;

export async function POST(request: NextRequest) {
  try {
    await requireCompanyRole();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const ocId = formData.get("oc_id") as string | null;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });
  if (!ocId || !UUID_REGEX.test(ocId)) return NextResponse.json({ error: "Pick an OC first" }, { status: 400 });
  try {
    await requireOCAccess(ocId);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!ALLOWED.includes(file.type)) return NextResponse.json({ error: "File type not supported." }, { status: 400 });
  if (file.size > MAX_SIZE) return NextResponse.json({ error: "File too large. Maximum 25MB." }, { status: 400 });

  const safeName = file.name.replace(/[/\\]/g, "_").replace(/[\x00-\x1f]/g, "").trim().slice(0, 200) || "document";
  const key = `documents/${ocId}/recurring-jobs/${crypto.randomUUID()}-${safeName}`;
  await uploadObject(key, Buffer.from(await file.arrayBuffer()), file.type);
  return NextResponse.json({ key, file_name: safeName, file_size: file.size, mime_type: file.type });
}
