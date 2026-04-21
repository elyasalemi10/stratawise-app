import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

const ALLOWED_CONTENT_TYPES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml", "image/gif"];

export async function GET(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const r2Domain = process.env.R2_PUBLIC_URL;
  if (!r2Domain) {
    return NextResponse.json({ error: "Image proxy not configured" }, { status: 500 });
  }

  const url = request.nextUrl.searchParams.get("url");
  if (!url) return NextResponse.json({ error: "Missing url" }, { status: 400 });

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  let allowed: URL;
  try {
    allowed = new URL(r2Domain);
  } catch {
    return NextResponse.json({ error: "Image proxy not configured" }, { status: 500 });
  }

  // Only allow proxying from our R2 public host, over https, same origin.
  if (parsed.protocol !== "https:" || parsed.host !== allowed.host) {
    return NextResponse.json({ error: "Invalid URL" }, { status: 403 });
  }

  try {
    const res = await fetch(parsed.toString());
    if (!res.ok) {
      return NextResponse.json({ error: "Upstream error" }, { status: 502 });
    }
    const contentType = res.headers.get("content-type") ?? "application/octet-stream";
    if (!ALLOWED_CONTENT_TYPES.some((t) => contentType.startsWith(t))) {
      return NextResponse.json({ error: "Unsupported content type" }, { status: 415 });
    }
    const buffer = await res.arrayBuffer();

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch {
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
  }
}
