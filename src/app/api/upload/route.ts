import { NextRequest, NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth";import { uploadObject } from "@/lib/storage/r2";
import { downscaleImage } from "@/lib/images/downscale";

const MAX_SIZE = 2 * 1024 * 1024; // 2MB
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/svg+xml", "image/webp"];

export async function POST(request: NextRequest) {
  const userId = await getAuthUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: "Invalid file type. Use PNG, JPG, SVG, or WebP." },
      { status: 400 }
    );
  }

  if (file.size > MAX_SIZE) {
    return NextResponse.json(
      { error: "File too large. Maximum 2MB." },
      { status: 400 }
    );
  }

  const ext = file.name.split(".").pop() ?? "png";
  const key = `logos/${userId}-${Date.now()}.${ext}`;

  // Logos and signatures come straight off a designer's export or a phone
  // photo and are rendered at a couple of hundred pixels. SVGs pass through
  // untouched, being vector.
  const shrunk = await downscaleImage(Buffer.from(await file.arrayBuffer()), file.type);
  const { publicUrl } = await uploadObject(key, shrunk.bytes, shrunk.contentType);

  return NextResponse.json({ url: publicUrl });
}
