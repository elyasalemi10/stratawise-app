import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { S3Client, DeleteObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { createServerClient } from "@/lib/supabase";

const R2 = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT!,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

const BUCKET = process.env.R2_BUCKET_NAME ?? "msm-company-logos";

// GET — proxy file from R2 (avoids CORS issues with redirects)
// ?view=true returns inline (for preview), otherwise attachment (for download)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const supabase = createServerClient();

  const { data: doc } = await supabase
    .from("documents")
    .select("file_path, file_name, mime_type")
    .eq("id", id)
    .single();

  if (!doc) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  // Fetch file from R2 directly via S3 API
  const response = await R2.send(
    new GetObjectCommand({
      Bucket: BUCKET,
      Key: doc.file_path,
    })
  );

  if (!response.Body) {
    return NextResponse.json({ error: "File not found in storage" }, { status: 404 });
  }

  const bytes = await response.Body.transformToByteArray();
  const isView = request.nextUrl.searchParams.get("view") === "true";
  const disposition = isView ? "inline" : `attachment; filename="${encodeURIComponent(doc.file_name)}"`;

  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": doc.mime_type || "application/octet-stream",
      "Content-Disposition": disposition,
      "Cache-Control": "private, max-age=3600",
    },
  });
}

// PATCH — rename document (DB only, R2 key unchanged)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const { name } = await request.json();

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const supabase = createServerClient();

  const { data: doc, error } = await supabase
    .from("documents")
    .update({ file_name: name.trim() })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(doc);
}

// DELETE — remove from R2 and DB
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const supabase = createServerClient();

  // Get file path before deleting
  const { data: doc } = await supabase
    .from("documents")
    .select("file_path")
    .eq("id", id)
    .single();

  if (!doc) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  // Delete from R2
  try {
    await R2.send(
      new DeleteObjectCommand({
        Bucket: BUCKET,
        Key: doc.file_path,
      })
    );
  } catch {
    // Continue even if R2 delete fails — DB is source of truth
  }

  // Delete from DB
  const { error } = await supabase
    .from("documents")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
