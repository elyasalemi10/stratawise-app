import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { uploadObject } from "@/lib/storage/r2";

// Blog image upload (super-admin only). Stores under the PUBLIC bucket's
// blog/ prefix so the marketing site can render the image by URL. Returns
// the public URL. Dimensions are read client-side and stored on the post.
const MAX_SIZE = 8 * 1024 * 1024; // 8MB
const ALLOWED = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml"];

export async function POST(request: NextRequest) {
  try {
    await requireRole(["super_admin"]);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });
  if (!ALLOWED.includes(file.type)) {
    return NextResponse.json({ error: "Use a PNG, JPG, WebP, GIF or SVG image." }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "Image too large (max 8MB)." }, { status: 400 });
  }

  const ext = (file.name.split(".").pop() ?? "png").toLowerCase().replace(/[^a-z0-9]/g, "");
  const key = `blog/${crypto.randomUUID()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const { publicUrl } = await uploadObject(key, buffer, file.type);

  return NextResponse.json({ url: publicUrl });
}
