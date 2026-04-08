import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");
  if (!url) return NextResponse.json({ error: "Missing url" }, { status: 400 });

  // Only allow proxying from our R2 domain
  const r2Domain = process.env.R2_PUBLIC_URL;
  if (r2Domain && !url.startsWith(r2Domain)) {
    return NextResponse.json({ error: "Invalid URL" }, { status: 403 });
  }

  try {
    const res = await fetch(url);
    const buffer = await res.arrayBuffer();
    const contentType = res.headers.get("content-type") ?? "image/png";

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
