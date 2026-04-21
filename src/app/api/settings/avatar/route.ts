import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createServerClient } from "@/lib/supabase";

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { avatar_url } = await request.json();

  // Validate avatar URL: only allow URLs hosted on our own R2 public bucket,
  // or null to clear. Prevents storing arbitrary third-party URLs in profiles
  // (tracking pixels, SSRF bait when re-served, etc.).
  let cleanUrl: string | null = null;
  if (avatar_url) {
    if (typeof avatar_url !== "string") {
      return NextResponse.json({ error: "avatar_url must be a string" }, { status: 400 });
    }
    const r2 = process.env.R2_PUBLIC_URL;
    if (!r2) {
      return NextResponse.json({ error: "Image storage not configured" }, { status: 500 });
    }
    try {
      const parsed = new URL(avatar_url);
      const allowed = new URL(r2);
      if (parsed.protocol !== "https:" || parsed.host !== allowed.host) {
        return NextResponse.json({ error: "avatar_url must be hosted on the configured image bucket" }, { status: 400 });
      }
      cleanUrl = parsed.toString();
    } catch {
      return NextResponse.json({ error: "Invalid avatar_url" }, { status: 400 });
    }
  }

  const supabase = createServerClient();

  const { error } = await supabase
    .from("profiles")
    .update({ avatar_url: cleanUrl })
    .eq("clerk_id", userId);

  if (error) {
    return NextResponse.json({ error: "Failed to update avatar" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
