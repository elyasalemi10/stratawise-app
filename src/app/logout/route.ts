import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";

// Sign-out endpoint. Client navigates here (POST or GET); we clear the
// Supabase Auth cookie and bounce back to "/".
export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/", request.url));
}

export async function POST(request: NextRequest) {
  return GET(request);
}
