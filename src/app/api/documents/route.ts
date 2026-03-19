import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { createServerClient } from "@/lib/supabase";
import { ALLOWED_DOCUMENT_TYPES, MAX_DOCUMENT_SIZE } from "@/lib/validations/documents";

const R2 = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT!,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

const BUCKET = process.env.R2_BUCKET_NAME ?? "msm-company-logos";

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const subdivisionId = formData.get("subdivision_id") as string | null;
  const lotId = formData.get("lot_id") as string | null;
  const category = (formData.get("category") as string) || "other";

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  if (!subdivisionId) {
    return NextResponse.json({ error: "subdivision_id is required" }, { status: 400 });
  }

  if (!ALLOWED_DOCUMENT_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: "File type not supported. Allowed: PDF, DOC, DOCX, XLS, XLSX, PNG, JPG, TXT, CSV" },
      { status: 400 }
    );
  }

  if (file.size > MAX_DOCUMENT_SIZE) {
    return NextResponse.json(
      { error: "File too large. Maximum 25MB." },
      { status: 400 }
    );
  }

  // Get profile for uploaded_by
  const supabase = createServerClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("clerk_id", userId)
    .single();

  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  // Upload to R2
  const uuid = crypto.randomUUID();
  const folder = lotId || "subdivision";
  const key = `documents/${subdivisionId}/${folder}/${uuid}-${file.name}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  await R2.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: buffer,
      ContentType: file.type,
    })
  );

  // Store metadata in DB
  const { data: doc, error } = await supabase
    .from("documents")
    .insert({
      subdivision_id: subdivisionId,
      lot_id: lotId || null,
      category,
      file_name: file.name,
      file_path: key,
      file_size: file.size,
      mime_type: file.type,
      is_confidential: false,
      uploaded_by: profile.id,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const publicUrl = `${process.env.R2_PUBLIC_URL}/${key}`;

  return NextResponse.json({
    ...doc,
    public_url: publicUrl,
  });
}
