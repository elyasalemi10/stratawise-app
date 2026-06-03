import { NextRequest, NextResponse } from "next/server";
import { requireCompanyRole } from "@/lib/auth";
import { uploadObject } from "@/lib/storage/r2";

// Uploads a follow-up step's custom attachment to R2 (confidential) and returns
// the object KEY + filename. Stored on escalation_workflow_steps.attachment_url
// and attached to that step's email by the escalation runner.

const ALLOWED = ["application/pdf", "image/png", "image/jpeg", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
const MAX_SIZE = 15 * 1024 * 1024;

export async function POST(request: NextRequest) {
  let profile;
  try {
    profile = await requireCompanyRole();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!profile.management_company_id) return NextResponse.json({ error: "No company on profile" }, { status: 400 });

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });
  if (!ALLOWED.includes(file.type)) return NextResponse.json({ error: "File type not supported. Allowed: PDF, PNG, JPG, Word." }, { status: 400 });
  if (file.size > MAX_SIZE) return NextResponse.json({ error: "File too large. Maximum 15MB." }, { status: 400 });

  const safeName = file.name.replace(/[/\\]/g, "_").replace(/[\x00-\x1f]/g, "").trim().slice(0, 200) || "attachment";
  const key = `followup/${profile.management_company_id}/${crypto.randomUUID()}-${safeName}`;
  await uploadObject(key, Buffer.from(await file.arrayBuffer()), file.type);
  return NextResponse.json({ key, file_name: safeName });
}
